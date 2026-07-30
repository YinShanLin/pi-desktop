# Pi Desktop — Session 连续性方案

> 目标：让 Pi Desktop 的 chat 真正"接上下文"，关闭再打开、切换文件夹后 Pi 都知道之前聊过什么。

---

## 背景：当前问题

### 用户视角的现象
- 软件打开能看到之前的窗口和历史聊天（UI 从 localStorage 读消息）
- 但再次输入问题，Pi 不知道之前聊过什么
- 软件关闭再打开，聊天记录在 UI 上能看到，但 Agent 把每次都当新开始

### 技术根因
- `src-tauri/src/lib.rs:107` 启动 pi 时带 `--no-session` 参数
  → pi 启动后是空白状态，不加载任何历史
- `send_prompt` RPC 只发送当前一条 `message: string` 字符串
  → 即使 pi 有历史，也只看到"现在这条"
- 前端 `messageStore`（localStorage）只给 UI 渲染用，不通知 pi

### 三种方案对比
| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| A. 去掉 `--no-session`，让 pi 自己管 | 启动时 `--session-id`，切换用 `switch_session` RPC | 改动最小；自动获得 compaction / fork / clone | 需废弃前端 sessionStore；分组要重实现 |
| B. prompt 携带历史消息 | `send_prompt` 附带 `messages: []` | 前端控制权大 | ❌ RPC 协议不支持（`message: string` 单一字段） |
| C. 把 localStorage 写回 Pi 的 session 文件 | 直接生成 `.jsonl` 文件到 `~/.pi/agent/sessions/` | 保留 UI 状态；老数据可迁移 | 需理解 Pi JSONL 格式；需 fs 写权限 |

**结论**：方案 A 最干净，让 Pi 做它最擅长的事。

---

## 实施方案（路径 A）

### 阶段 1：Pi 启动参数改造

#### 1.1 Rust 改动 `src-tauri/src/lib.rs`

**改 `start_pi` 命令签名**：

```rust
#[tauri::command]
fn start_pi(
    backend: State<'_, PiBackend>,
    app: AppHandle,
    cwd: String,
    session_id: Option<String>,     // ← 新增
    session_name: Option<String>,   // ← 新增
) -> Result<BackendStatus, String> {
    // ... 现有逻辑 ...
    
    let mut command = Command::new(&pi_path);
    command
        .arg("--mode")
        .arg("rpc");
    
    // session 接管
    if let Some(ref sid) = session_id {
        command.arg("--session-id").arg(sid);
    } else {
        command.arg("--no-session");  // 保留 fallback
    }
    if let Some(ref name) = session_name {
        command.arg("--name").arg(name);
    }
    command
        .arg("--session-dir")  // 可选：固定 session 目录便于管理
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        // ...
}
```

**PiBackend 内部新增 session_id 字段**：

```rust
struct PiBackendInner {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    cwd: Option<String>,
    session_id: Option<String>,      // ← 新增
    session_file: Option<String>,     // ← 新增
}
```

#### 1.2 新增 Tauri commands

```rust
// 切换到指定 session（通过 session_id）
#[tauri::command]
fn switch_session(backend: State<'_, PiBackend>, session_id: String) -> Result<(), String> {
    // 先从后端查 session file 路径
    let session_path = lookup_session_file(session_id)?;
    send_rpc_command(backend, json!({
        "type": "switch_session",
        "sessionPath": session_path
    }))
}

// 列出指定 cwd 的所有 session
#[tauri::command]
fn list_sessions(cwd: String) -> Result<Vec<SessionInfo>, String> {
    // 用 std::fs 读 ~/.pi/agent/sessions/<encoded-cwd>/ 下的 .jsonl
    // 解析每个文件的 header 返回 SessionInfo
}

// 获取当前 session 的所有消息（替代 messageStore.load）
#[tauri::command]
fn get_session_messages() -> Result<Vec<AgentMessage>, String> {
    send_rpc_command_then(backend, json!({ "type": "get_messages" }))
}

// 新建 session（清空当前对话）
#[tauri::command]
fn new_pi_session(backend: State<'_, PiBackend>, parent_session: Option<String>) -> Result<String, String> {
    send_rpc_command_then(backend, json!({
        "type": "new_session",
        "parentSession": parent_session
    }))
    // 返回新 session ID
}
```

#### 1.3 Pi session 文件路径解析

`~/.pi/agent/sessions/` 目录结构：

```
~/.pi/agent/sessions/
  └── <encoded-cwd>/          // cwd 的 base64 编码
      ├── <uuid-1>.jsonl
      ├── <uuid-2>.jsonl
      └── ...
```

每个 `.jsonl` 文件结构：

```
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"..."}
{"type":"message","id":"<eid>","parentId":null,"timestamp":"...","message":{...}}
{"type":"message","id":"<eid>","parentId":"<prev>","timestamp":"...","message":{...}}
...
```

**CWD 编码规则**（需要从 Pi 源码确认）：
- 当前推测是 base64 编码（但需要验证）

---

### 阶段 2：前端 sessionStore 改造

#### 2.1 新数据模型

`src/data/sessions.ts`：

```typescript
// 不再本地存消息，只存 session 元信息
export interface Session {
  id: string;              // Pi session UUID
  title: string;           // 用户命名（来自 Pi 的 set_session_name）
  cwd: string;             // 关联目录
  createdAt: number;       // 来自 Pi session header
  updatedAt: number;       // 来自 Pi session 的 last entry timestamp
  messageCount: number;    // 来自 Pi get_state
  isActive: boolean;       // 是否被 archive（前端自定义）
  // ... 保留 diff 统计等 UI 专用字段，从 Pi 计算
}
```

**关键变化**：消息不再存在 localStorage，每次切到 session 都从 Pi 拉取。

#### 2.2 数据流改造

**Session 列表**：启动时调 `list_sessions(cwd)` 拿到所有 session，按 `updatedAt` 分组（Today/Yesterday/Earlier）

**Session 内容**：点击 session 时调 `switch_session(id)` + `get_session_messages()` 拿到完整消息

**新消息发送**：现有的 `send_prompt` 不变，pi 自动追加到当前 session 文件

**Session 创建**：点 "New chat" → `new_pi_session()` 拿新 ID → 自动切到新 session

**Session 重命名**：调 `set_session_name(name)` RPC

#### 2.3 待删除的代码

- `messageStore.save()` / `messageStore.load()` / `messageStore.remove()`（localStorage 消息存储）
- `messageStore` 整个文件可废弃
- App.tsx 中 `loadSession()`, `saveActiveMessages()` 函数
- 400ms debounced save 副作用

---

### 阶段 3：UI 适配

#### 3.1 Session 列表显示

- 分组规则改用 `updatedAt`（来自 Pi）
- 消息数、diff 统计：从 Pi `get_state` / `get_session_stats` 拿
- 未读标记：本地维护（消息在 Pi 那边，前端可记录"已读时间戳"）

#### 3.2 切换 session 时的 loading 态

`switch_session` 是异步的（要 stop 当前 agent run + 加载新文件），需要：
- 按钮 disable
- 显示 "Switching..." 状态
- 切换完成后 `get_messages` 拉取消息填充 UI

#### 3.3 老数据迁移（一次性）

首次启动时检测 `messageStore` 中有数据：
1. 创建一个新 session 拿 ID
2. 把 localStorage 里的消息按 Pi 的 JSONL 格式写到 `~/.pi/agent/sessions/<encoded-cwd>/<id>.jsonl`
3. 启动 pi 时 `--session-id <id>` 加载
4. 清空 localStorage `messageStore`

**JSONL 格式示例**（用于迁移）：

```jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"2024-01-01T00:00:00Z","cwd":"/path/to/dir"}
{"type":"message","id":"<eid1>","parentId":null,"timestamp":"...","message":{"role":"user","content":"hi"}}
{"type":"message","id":"<eid2>","parentId":"<eid1>","timestamp":"...","message":{"role":"assistant","content":"hello"}}
```

迁移工具需要：
- 读取 localStorage 消息
- 生成 UUID（用 `crypto.randomUUID()`）
- 写 JSONL 文件（用 tauri-plugin-fs 或直接通过 Rust command）
- 写完后 `localStorage.removeItem('pi.messages.*')`

---

## 文件改动清单

### 新增
- `src-tauri/src/session_io.rs` — 读取 ~/.pi/agent/sessions/ 目录工具
- `src/data/sessions.ts` 改造：删除 message 字段，只留 session 元信息

### 修改
- `src-tauri/src/lib.rs` — `start_pi` 签名、移除 `--no-session`、新增 commands
- `src-tauri/tauri.conf.json` — 可能需要 fs 权限
- `src/pi.ts` — 新增 `switchSession` / `listSessions` / `getSessionMessages` 等包装
- `src/data/sessions.ts` — 数据模型重做
- `src/App.tsx` — 启动逻辑改为 session 模式，删除 messageStore 相关
- `src/components/SessionSidebar.tsx` — 适配新的 session 列表数据源

### 删除
- `src/data/messages.ts` — messageStore 整个文件
- App.tsx 中 `loadSession` / `saveActiveMessages` / debounced save useEffect

---

## 风险点

| 风险 | 缓解 |
|------|------|
| Pi 协议未来变更（消息字段变动） | 锁定 `@earendil-works/pi-coding-agent` 版本，升级时跑测试 |
| CWD 编码规则不明确 | 在 `session_io.rs` 启动时打印实际路径，验证 base64 推测 |
| `switch_session` 会中断当前 agent run | 切换前 abort (`send_abort`)，等 agent_settled |
| 老 localStorage 数据迁移失败 | 提供"放弃迁移"开关，用户可清空重来 |
| Pi 进程 crash 后 session 状态丢失 | JSONL append-only，crash 不丢；启动自动 reload |

---

## 实施顺序

1. ✅ 研究 RPC 协议（已完成）
2. ⏭️ Rust: 修改 `start_pi`，加 `switch_session` / `list_sessions` / `get_session_messages` / `new_pi_session` commands
3. ⏭️ 前端: 改造 `pi.ts` 包装层
4. ⏭️ 前端: 改造 `sessionStore`（去掉 messages 字段）
5. ⏭️ 前端: 改造 `App.tsx` 启动流程和切换逻辑
6. ⏭️ 前端: 改造 `SessionSidebar` 适配新数据源
7. ⏭️ 一次性数据迁移工具
8. ⏭️ 测试：切换文件夹 / 关闭重开 / 多 session 切换

---

## 验证清单

- [ ] 启动软件，能看到之前所有 session 列表
- [ ] 点击 session，能看到完整历史消息
- [ ] 发送新消息，Pi 知道之前的上下文（验证：问"我刚才问了什么"）
- [ ] 切换文件夹，session 列表更新
- [ ] 关闭软件重开，所有 session 仍在
- [ ] 新建 session，是真正的空白
- [ ] 老 localStorage 数据成功迁移

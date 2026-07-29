# Pi Desktop UI Redesign — Style E（极简优先）

> 目标：**比 ZCode 更专注，比现状更克制**。
> 桌面级极简不是空白，而是把"该隐藏的都藏起来，只留一束聚光打在对话内容上"。

---

## 0. 现状诊断

经过 Phase 1.5–1.6 + 本轮优化后，chrome 仍有 4 层：

```
┌─ Titlebar 24px ────────────────────────────────────┐
├─ Sidebar 240px ─┬─ MessageList ─┬─ RightRail ────┤
│                 │              │                │
│                 │ Composer     │                │
│                 │              │                │
├─ StatusBar 24px ───────────────────────────────────┘
```

即使 ModelBar 已并入、blur 已去掉，视觉上仍是 **"三栏 + 顶/底栏" 的 IDE 骨架**。ZCode 的形态更接近 **"单栏 + 隐形工具"** —— 所有非对话元素要么彻底隐藏，要么只在需要时浮现。

**核心减法**：
- 顶栏：去掉所有按钮（status dot 可保留为 2px 圆点）
- 底栏：默认隐藏，仅在报错 / loading / token 异常时浮现
- 左栏：默认折叠为 48px icon-rail（hover 展开到 240px）
- 右栏：默认完全隐藏，靠 ⌘B/⌘J 唤起
- 模型 / thinking：input 上方一行 11px 灰色 caption，不再是 pill

---

## 1. 信息架构（IA）

### 全局快捷键（取代视觉按钮）

| 操作 | 快捷键 |
|---|---|
| 命令面板 | ⌘K |
| 新对话 | ⌘N |
| 切换会话 | ⌘[ / ⌘] |
| 打开 / 聚焦 Files | ⌘B |
| 打开 / 聚焦 Terminal | ⌘J |
| 切换 RightRail | ⌘. |
| 设置 | ⌘, |
| 侧栏展开 / 收起 | ⌘\\ |
| 取消 / 关弹层 | Esc |

> 视觉上的"按钮"应该只保留 `Send` 和 `Abort`，其他全部走快捷键或 ⌘K。

### 三种窗口形态

| 状态 | Sidebar | RightRail | StatusBar |
|---|---|---|---|
| **Default** | 折叠（48px icon-rail） | 隐藏 | 隐藏 |
| **Focus** | 隐藏 | 隐藏 | 隐藏 |
| **Working** | 折叠 | 隐藏 | 隐藏（报错才出） |

→ 默认就是 single-pane 形态，只有"按需展开"，永远不会被多层 chrome 挤占视觉。

---

## 2. 布局

### 2.1 整体栅格

```
window 1100×750
├── 顶部 1px hairline (border-bottom, 不用 24px titlebar)
│
├── 主体（flex-row, gap=0）
│   ├── [optional] Sidebar 48px ↔ 240px（hover 展开，220ms）
│   ├── Main（flex-1, min-width 480px）
│   │   ├── MessageList（滚动区）
│   │   ├── [hover-revealed] 顶导 28px（status dot · cwd · model caption）
│   │   └── Composer（底部）
│   └── [optional] RightRail 280px（只在 ⌘B/⌘J/⌘. 时存在）
│
└── [conditional] StatusBar 22px（仅在报错 / 进度 / 异常 token 时浮现）
```

### 2.2 Composer 区域（极简版）

```
┌──────────────────────────────────────────────────────┐
│ minimax · M3 · medium                       ⌘K palette │  ← 11px caption
├──────────────────────────────────────────────────────┤
│                                                      │
│  Ask pi anything…                                    │  ← textarea, 无边框
│                                                      │
│                                                      │
├──────────────────────────────────────────────────────┤
│ 1 file · 3 edits attached                  Send ⏎    │  ← 10px meta + send
└──────────────────────────────────────────────────────┘
```

要点：
- 没有圆角外框 / 内层 textarea + actions 一体化
- 顶部 caption：模型 + thinking level 用 `·` 分隔，灰色 monospace 10.5px，hover 可点击展开菜单
- 底部 meta：附件 / token / 路径摘要，10px
- Send 按钮：**没有圆角图标**，纯文字 + 灰色 ⏎ 提示（hover 变 accent）

### 2.3 Message 排版

- **user bubble**：右对齐，最大宽度 78%，浅 accent 底（透明度 0.08），圆角 12px
- **assistant bubble**：左对齐，无底色，仅文字 + 1px hairline 分隔行
- **tool bubble**：单行摘要 `▶ read ~/foo.ts · 142 lines` + hover/点击展开
- **thinking**：默认折叠为一行小字 `thinking (3s) ▸`，点击展开

### 2.4 Sidebar icon-rail（48px 折叠态）

```
┌──┐
│ π │  ← logo (单字符)
├──┤
│ + │  ← new chat
├──┤
│ ≡ │  ← sessions (展开显示数字 badge)
├──┤
│ ⌘ │  ← command palette
└──┘
```

hover 任一图标 → 整条 sidebar 在 220ms 内展开到 240px，露出完整 sessions 列表。移开鼠标 600ms 自动折叠（用户停留可中断）。

---

## 3. 视觉系统（Design Tokens）

### 3.1 颜色 — 极简中性

```css
:root {
  /* Surfaces — 3 级足够 */
  --bg:        #0b0b0c;   /* 主底，几乎黑 */
  --bg-1:      #131316;   /* 卡片 */
  --bg-2:      #1b1b1f;   /* hover / 选中 */

  /* Text — 4 级就够 */
  --fg:        #e8e8ea;   /* 正文 */
  --fg-2:      #9b9ba1;   /* 次要 */
  --fg-3:      #6c6c72;   /* 辅助 */
  --fg-4:      #444448;   /* 占位 / disabled */

  /* Border — 1px hairline 几乎透明 */
  --border:    rgba(255, 255, 255, 0.06);
  --border-2:  rgba(255, 255, 255, 0.10);

  /* Accent — 单色，做克制 */
  --accent:    #7aa2ff;
  --accent-2:  #5a86e8;
  --accent-soft: rgba(122, 162, 255, 0.10);

  /* Semantic — 只在状态栏 / banner 用 */
  --ok:        #4ade80;
  --warn:      #fbbf24;
  --err:       #f87171;
}

[data-theme="light"] {
  --bg:        #fafafa;
  --bg-1:      #ffffff;
  --bg-2:      #f1f1f3;
  --fg:        #1a1a1c;
  --fg-2:      #6c6c72;
  --fg-3:      #9b9ba1;
  --fg-4:      #c4c4c8;
  --border:    rgba(0, 0, 0, 0.06);
  --border-2:  rgba(0, 0, 0, 0.10);
  --accent:    #2563eb;
  --accent-2:  #1d4ed8;
  --accent-soft: rgba(37, 99, 235, 0.08);
  --ok:        #16a34a;
  --warn:      #d97706;
  --err:       #dc2626;
}
```

对比：
- ✅ bg #0b0b0c ↔ fg #e8e8ea → 16.5:1（远超 WCAG AAA 7:1）
- ✅ accent #7aa2ff 在 bg 上 → 7.8:1（AAA）
- 整个色板只有 18 个变量（vs 现状 ~35+）

### 3.2 字体

```css
--font-ui:   -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
--font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;

--fs-xs:  10.5px;   /* caption / meta */
--fs-sm:  12px;     /* secondary */
--fs-md:  13.5px;   /* body */
--fs-lg:  15px;     /* title */
--fs-xl:  18px;     /* display */

--lh-tight: 1.35;   /* mono / compact */
--lh-body:  1.55;   /* prose */
```

去掉所有 `font-optical-sizing` / `ss01` / `cv11` / `calt` 等修饰，回到系统原生字形。

### 3.3 间距 / 圆角 / 阴影

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;

--radius-1: 4px;
--radius-2: 6px;
--radius-3: 8px;     /* 卡片 / 输入框 */
--radius-pill: 999px; /* 不用，砍掉 */

--shadow-1: 0 1px 2px rgba(0,0,0,.04);
--shadow-2: 0 8px 24px rgba(0,0,0,.12);   /* modal 唯一用 */
--shadow-NONE: none;                       /* 默认值 */
```

**规则**：
- 任何常驻表面：`shadow: none`
- 任何 motion：`transform: none`（不用 scale 反馈）
- 圆角统一 ≤ 8px（modal 8px、bubble 6px、button 4px）

### 3.4 动效

```css
--ease: cubic-bezier(.4, 0, .2, 1);
--t-fast: 120ms;
--t-med:  200ms;
--t-slow: 320ms;
```

- 所有 hover / focus 过渡 ≤ 120ms
- sidebar 折叠 / 展开 220ms
- modal / dropdown 入场 160ms ease-out，**没有 spring / scale / translateY**
- `@media (prefers-reduced-motion: reduce)` 全局禁用 transition（已有，写完整）

---

## 4. 组件规范

### 4.1 Button — 取消药丸与阴影

| Variant | 样式 |
|---|---|
| `primary` | 无边框，accent 底，白字，4px 圆角，hover 加深 10% |
| `ghost` | 无底，灰字，hover bg-2 |
| `danger` | 无底，err 色，hover bg-2 |

高度统一 28px，padding 0 12px。**禁用 `transform: scale(0.97)`**——输入区按按钮会吃掉焦点感，改用 opacity 0.7 反馈。

### 4.2 Pill / Chip — 删掉

整个系统不再用 pill 形态。模型 / thinking 用 `·` 分隔的纯文字 caption。

### 4.3 Dropdown

```css
.dropdown-menu {
  position: absolute;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-2);
  padding: 4px;
  min-width: 220px;
  box-shadow: var(--shadow-2);  /* 唯一允许 shadow 的常驻元素 */
  animation: dropdown-in 140ms var(--ease);
}
@keyframes dropdown-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

dropdown-item 高度 26px，hover bg-2，无 padding 动画。

### 4.4 Modal

8px 圆角，shadow-2，背景 blur 8px（瞬时，可保留），入场 160ms。

### 4.5 Bubble

```css
.bubble-user {
  align-self: flex-end;
  max-width: 78%;
  background: var(--accent-soft);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: var(--fs-md);
  line-height: var(--lh-body);
}
.bubble-assistant {
  /* 不需要 .bubble-assistant 容器，assistant 直接渲染纯文本 */
  padding: 12px 0;
}
```

### 4.6 Tool 行

```tsx
<ToolRow>
  <summary>
    <span class="dot" />          {/* 2px 运行中/完成 圆点 */}
    <span class="name">read</span>
    <span class="arg">~/foo.ts</span>
    <span class="time">142ms</span>     {/* 仅在完成后显示 */}
  </summary>
  <details>...</details>
</ToolRow>
```

默认一行 28px 高度，hover 露 `⏎ to expand` 提示，click 展开 details。

---

## 5. 关键交互

### 5.1 Sidebar 折叠 / 展开

| Trigger | 行为 |
|---|---|
| 鼠标 hover 整个 sidebar（含折叠态） | 220ms 内展开到 240px |
| 鼠标离开 sidebar | 600ms 后折叠（计时可被新 hover 中断） |
| `⌘\` | 切换 lock（持续展开 / 折叠） |
| `⌘1..9` | 直接跳到第 N 个 session（无需展开 sidebar） |

### 5.2 ⌘K 命令面板（已规划 Phase 2）

居中 modal，640×420px，搜索框 + 分类列表：
- Commands（⌘N, ⌘B, ⌘., …）
- Sessions（按 cwd + title fuzzy 搜索）
- Files（项目内 fuzzy）
- Models（provider/id 搜索）
- Settings（theme / cwd / 快捷键自定义）

键盘导航：↑↓ 切换、⏎ 执行、esc 关闭。

### 5.3 Composer 行为

- 输入为空 → placeholder: `Ask pi anything. Enter to send, Shift+Enter for newline.`
- 输入非空 → 隐藏 placeholder，右下角出现 `Send ⏎`
- busy 状态 → 文案变 `Working… Esc to interrupt`，右下角变 `Stop ⌘.`
- 顶部 caption hover → 显示下拉菜单切换 model / thinking

### 5.4 RightRail 唤起

- ⌘B → Files tab 滑入（180ms ease-out，宽度 280px）
- ⌘J → Terminal tab
- ⌘. → 在三种 tab 间循环
- 再次按对应键或 Esc → 折叠

---

## 6. 与 ZCode 对照

| 维度 | ZCode | Pi Desktop 现状 | Style E |
|---|---|---|---|
| 默认 chrome 层数 | 1（仅输入区） | 4（title/side/main/rail） | **1** |
| 顶栏高度 | 0 | 24px | **0** |
| 侧栏默认宽 | 0 / 48 | 240 | **48 (hover 展开)** |
| 右栏默认 | 0 | 0（已默认隐藏，OK） | **0** |
| 底栏默认 | 0 | 24 | **0** |
| 常驻 blur 表面 | 0 | 0（已修） | **0** |
| 用户可见按钮数 | ≤3 | ~10 | **≤2** |
| 全局色板变量数 | ~10 | ~35+ | **18** |
| 圆角最大值 | 6px | 12px | **8px** |
| 入场动效类型 | 无 / 微淡入 | spring + scale | **ease + 微 translateY** |
| 模型 / thinking 展示 | 顶部 caption | pill | **caption** |

→ Style E 在"信息密度 + 视觉重量"两个维度都更接近 ZCode，同时**没有盲目砍功能**（session、file tree、terminal 都保留，只是默认折叠）。

---

## 7. 实施路径

### Sprint 1 — Token 与排版（2 小时）
1. 替换 design tokens（`:root` + light theme，约 30 个变量）
2. 字体规范简化（去掉 SF Pro 特性开关）
3. 全局 border-radius / shadow 收敛
4. 删除所有 `transform: scale(...)` / spring 动画

### Sprint 2 — Layout 重构（4 小时）
1. 干掉 Titlebar，合并到 Main 顶部 28px 折叠导
2. Sidebar 折叠为 48px icon-rail，hover 展开
3. StatusBar 默认隐藏，加 conditional render
4. Composer 重写：caption + textarea + meta 三行式

### Sprint 3 — 组件改造（3 小时）
1. Button 三态重做
2. 移除所有 pill / chip 形态
3. Dropdown / Modal 单一 shadow 来源
4. ToolRow 单行化

### Sprint 4 — ⌘K 命令面板（4 小时，Phase 2 顺路）
1. 居中 modal + fuzzy 搜索
2. 分类：Commands / Sessions / Files / Models / Settings
3. 键盘导航 + 执行

### Sprint 5 — 验证（1 小时）
1. tsc + vite build + cargo check
2. `pnpm tauri dev` 走查：流式 / 长会话 / 右栏唤起 / 浅色主题
3. 截图对比（现状 vs Style E）写到 PROGRESS.md

**总计 ~14 小时，1.5 个工作日**。

---

## 8. 风险 & 回退

| 风险 | 影响 | 缓解 |
|---|---|---|
| Sidebar hover 展开在 trackpad 上抖动 | UX 降级 | 加 600ms 离开延迟 + 用户停留可中断；可一键 `⌘\` 锁定 |
| 顶栏去除导致窗口无法拖动 | macOS UX 不符 | 顶部 4px 留 `cursor: grab` 拖动区；或保留极薄 1px hairline 作为拖动命中区 |
| 字号 / 间距全面收紧，老用户不适应 | 学习成本 | 在 ⌘K 首条放 "Switch to Classic UI" 临时回退（v0.2 删） |
| ⌘K 复杂度高 | 工期失控 | 先做 Commands + Sessions 两类，Files/Models 留空数组占位 |

---

## 9. 验收标准

1. **视觉重量**：默认状态下，可见 chrome 总高度 ≤ 60px（vs 现状 96px）
2. **色板**：CSS 变量数 ≤ 25 个
3. **圆角**：全文件 grep 不出现 `border-radius` 大于 8px
4. **shadow**：全文件 grep 出现的 `box-shadow` 数 ≤ 5 处（仅 dropdown / modal / banner / toast）
5. **动效**：所有 transition duration ≤ 220ms
6. **可达性**：默认窗口在 1100×750 下，所有交互元素 ≥ 24×24px 触摸目标
7. **功能等价**：原有功能（多 session / file tree / extension dialog / model switch）零回归

---

## 附：Mockup

打开 `docs/style-e-mockup.html` 看实际渲染效果：
- 左：Style E 折叠态（默认）
- 中：Style E 展开态（hover sidebar）
- 右：命令面板 ⌘K
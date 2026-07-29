import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pi from "./pi";
import type {
  AssistantMessageEvent,
  ConnectionStatus,
  ExtensionUiRequest,
  Message,
  ToolMessage,
} from "./types";
import type { ModelOption } from "./types";
import { sessionStore, type Session } from "./data/sessions";
import { messageStore } from "./data/messages";
import { useResizable } from "./hooks/useResizable";
import { useTheme } from "./hooks/useTheme";
import { useShortcuts, type ShortcutBinding } from "./hooks/useShortcuts";
import { SHORTCUTS, isMac } from "./lib/shortcuts";
import { Titlebar } from "./components/Titlebar";
import { CollapsibleSidebar } from "./components/CollapsibleSidebar";
import { SessionSidebar } from "./components/SessionSidebar";
import { RightRail, type RailTab } from "./components/RightRail";
import { StatusBar } from "./components/StatusBar";
import { MessageList } from "./components/MessageList";
import { Composer } from "./components/Composer";
import { ExtensionDialog } from "./components/ExtensionDialog";
import { Settings } from "./components/Settings";
import { CommandPalette } from "./components/CommandPalette";

let _uid = 0;
const uid = () => `m_${Date.now().toString(36)}_${(_uid++).toString(36)}`;

function defaultCwd(): string {
  return "/Users/" + (window.navigator.userAgent.includes("Mac") ? "ysl" : "you");
}

export default function App() {
  // ---- Connection & backend state ----------------------------------------
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [cwd, setCwd] = useState<string>(defaultCwd());
  const [modelLabel, setModelLabel] = useState<string>("(no model)");
  const [thinkingLevel, setThinkingLevel] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [input, setInput] = useState<string>("");
  const [pendingDialog, setPendingDialog] = useState<ExtensionUiRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---- Theme & settings -------------------------------------------------
  const { theme, toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ---- Session state ----------------------------------------------------
  const [sessions, setSessions] = useState<Session[]>(() => sessionStore.getActive());
  const [sessionQuery, setSessionQuery] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);

  const refreshSessions = useCallback(() => {
    setSessions(sessionStore.getActive());
  }, []);

  // Refs to avoid stale closures in event handler + guard initial mount
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const modelLabelRef = useRef(modelLabel);
  modelLabelRef.current = modelLabel;

  // ---- Layout state -----------------------------------------------------
  const [railOpen, setRailOpen] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>("files");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarLocked, setSidebarLocked] = useState(() => {
    try {
      return localStorage.getItem("pi.sidebar.locked") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("pi.sidebar.locked", sidebarLocked ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarLocked]);

  const rail = useResizable("pi.rail.width", 280, 220, 480);

  // ---- Refs for streaming correlation -----------------------------------
  const currentAssistantIdRef = useRef<string | null>(null);
  const pendingToolInserts = useRef<ToolMessage[]>([]);

  // ---- rAF-batched streaming buffers -------------------------------------
  // Token deltas accumulate here and flush to state once per animation
  // frame, capping render frequency at display refresh regardless of how
  // fast pi emits deltas.
  const pendingTextRef = useRef("");
  const pendingThinkingRef = useRef("");
  const rafScheduledRef = useRef(false);

  // ---- Restart pi backend for a new cwd ---------------------------------
  const restartPi = useCallback(async (dir: string) => {
    try { await pi.stopPi(); } catch (e) { pi.frontendLog("warn", `[restartPi] stopPi failed: ${String(e)}`); }
    setModelLabel("(no model)");
    setThinkingLevel("");
    setAvailableModels([]);
    setStatus("disconnected");
    try {
      await pi.startPi(dir);
      setStatus("ready");
      pi.getState().catch(() => {});
      pi.getAvailableModels().catch(() => {});
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus("disconnected");
    }
  }, []);

  // ---- Persistence helpers ------------------------------------------------
  const activeMessagesRef = useRef<Message[]>(activeMessages);
  activeMessagesRef.current = activeMessages;

  const saveActiveMessages = useCallback(() => {
    const sid = activeSessionIdRef.current;
    if (sid && activeMessagesRef.current.length > 0) {
      messageStore.save(sid, activeMessagesRef.current);
    }
  }, []);

  // ---- Load messages for a session id -----------------------------------
  const loadSession = useCallback((sessionId: string | null) => {
    saveActiveMessages();
    if (!sessionId) {
      setActiveMessages([]);
      return;
    }
    setActiveMessages(messageStore.load(sessionId));
  }, [saveActiveMessages]);

  // ---- Switch active session: sync cwd, load messages, restart pi -------
  const switchToSession = useCallback((sessionId: string) => {
    const all = sessionStore.getAll();
    const session = all.find((s) => s.id === sessionId);
    if (!session) return;

    setActiveSessionId(sessionId);
    loadSession(sessionId);
    sessionStore.markRead(sessionId);
    refreshSessions();

    if (session.cwd !== cwdRef.current) {
      setCwd(session.cwd);
      restartPi(session.cwd);
    }
  }, [loadSession, refreshSessions, restartPi]);

  // ---- Initialize: find first active session or create one ---------------
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const active = sessionStore.getActive();
    let session: Session;
    let initialCwd: string;

    if (active.length > 0) {
      session = active[0];
      initialCwd = session.cwd;
    } else {
      session = sessionStore.create("New chat", defaultCwd(), "(no model)");
      initialCwd = session.cwd;
      refreshSessions();
    }

    setActiveSessionId(session.id);
    setActiveMessages(messageStore.load(session.id));
    setCwd(initialCwd);
  }, [refreshSessions]);

  // ---- Auto-start pi ----------------------------------------------------
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;

    pi.getStatus()
      .then((s) => {
        if (!mounted) return;
        if (s.running) {
          setStatus("ready");
          setCwd(s.cwd ?? cwdRef.current);
          return;
        }
        return pi.startPi(cwdRef.current).then(() => {
          if (!mounted) return;
          setStatus("ready");
          pi.getState().catch(() => {});
          pi.getAvailableModels().catch(() => {});
        });
      })
      .catch((e) => setError(String(e)));

    pi.onPiEvent((event) => {
      handleEvent(event);
    }).then((fn) => {
      if (!mounted) { fn(); return; }
      unlisten = fn;
    });

    return () => { mounted = false; unlisten?.(); saveActiveMessages(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Flush buffered deltas once per animation frame --------------------
  const flushDeltas = useCallback(() => {
    rafScheduledRef.current = false;
    const targetId = currentAssistantIdRef.current;
    const text = pendingTextRef.current;
    const thinking = pendingThinkingRef.current;
    if (!targetId || (text === "" && thinking === "")) return;
    pendingTextRef.current = "";
    pendingThinkingRef.current = "";
    setActiveMessages((prev) =>
      prev.map((m) =>
        m.kind === "assistant" && m.id === targetId
          ? { ...m, text: m.text + text, thinking: m.thinking + thinking }
          : m,
      ),
    );
  }, []);

  const scheduleDeltaFlush = useCallback(() => {
    if (rafScheduledRef.current) return;
    rafScheduledRef.current = true;
    requestAnimationFrame(flushDeltas);
  }, [flushDeltas]);

  // ---- Debounced persistence (single save point, replaces per-event saves)
  useEffect(() => {
    if (!activeSessionId || activeMessages.length === 0) return;
    const t = setTimeout(() => {
      messageStore.save(activeSessionId, activeMessages);
    }, 400);
    return () => clearTimeout(t);
  }, [activeMessages, activeSessionId]);

  // ---- Event handler ----------------------------------------------------
  const handleEvent = useCallback((event: any) => {
    if (!event || typeof event.type !== "string") return;
    const type = event.type as string;
    const sid = activeSessionIdRef.current;

    switch (type) {
      case "agent_start":
        setStatus("busy");
        return;
      case "agent_settled":
        setStatus("ready");
        return;
      case "pi_exit":
        setStatus("disconnected");
        return;

      case "message_start": {
        const msg = event.message;
        if (!msg || msg.role !== "assistant" || currentAssistantIdRef.current || !sid) return;
        const id = uid();
        currentAssistantIdRef.current = id;
        const newMsg: Message = { id, kind: "assistant", text: "", thinking: "", isStreaming: true, at: Date.now() };
        setActiveMessages((prev) => {
          if (prev.some((m) => m.kind === "assistant" && m.id === id)) return prev;
          return [...prev, newMsg];
        });
        return;
      }

      case "message_update": {
        const ame = event.assistantMessageEvent as AssistantMessageEvent | undefined;
        if (!ame) return;
        const targetId = currentAssistantIdRef.current;
        if (!targetId) return;
        // High-frequency deltas: buffer and flush once per animation frame.
        if (ame.type === "text_delta" && typeof ame.delta === "string") {
          pendingTextRef.current += ame.delta;
          scheduleDeltaFlush();
          return;
        }
        if (ame.type === "thinking_delta" && typeof ame.delta === "string") {
          pendingThinkingRef.current += ame.delta;
          scheduleDeltaFlush();
          return;
        }
        if (ame.type === "toolcall_end" && ame.toolCall) {
          flushDeltas(); // keep text/delta ordering ahead of the tool card
          const toolMsg: ToolMessage = {
            id: `t_${ame.toolCall.id}`, kind: "tool", toolCallId: String(ame.toolCall.id),
            name: ame.toolCall.name, args: ame.toolCall.arguments ?? {}, at: Date.now(),
          };
          pendingToolInserts.current.push(toolMsg);
          queueMicrotask(() => {
            if (pendingToolInserts.current.length === 0) return;
            const additions = pendingToolInserts.current.splice(0);
            setActiveMessages((p) => {
              const known = new Set(p.map((x) => (x.kind === "tool" ? x.toolCallId : null)));
              const fresh = additions.filter((a) => !known.has(a.toolCallId));
              return fresh.length ? [...p, ...fresh] : p;
            });
          });
        }
        return;
      }

      case "message_end": {
        const id = currentAssistantIdRef.current;
        if (id) {
          flushDeltas();
          setActiveMessages((prev) =>
            prev.map((m) => (m.kind === "assistant" && m.id === id ? { ...m, isStreaming: false } : m)),
          );
          currentAssistantIdRef.current = null;
        }
        return;
      }

      case "tool_execution_end": {
        const toolCallId = String(event.toolCallId ?? "");
        if (!toolCallId) return;
        setActiveMessages((prev) =>
          prev.map((m) => (m.kind === "tool" && m.toolCallId === toolCallId ? { ...m, result: event.result, isError: Boolean(event.isError) } : m)),
        );
        return;
      }

      case "extension_ui_request": {
        const req = event as ExtensionUiRequest;
        if (req.method === "select" || req.method === "confirm" || req.method === "input" || req.method === "editor") {
          setPendingDialog(req);
        } else if (req.method === "notify") {
          const kind = req.notifyType ?? "info";
          setNotice(`[${kind}] ${req.message ?? req.title ?? ""}`);
          setTimeout(() => setNotice(null), 4000);
        }
        return;
      }

      case "response": {
        if (event.success && event.data) {
          const data = event.data as Record<string, any>;
          if (event.command === "get_state" && data.model) {
            const m2 = data.model;
            setModelLabel(`${m2.provider ?? ""}/${m2.id ?? m2.name ?? ""}`);
            if (typeof data.thinkingLevel === "string") setThinkingLevel(data.thinkingLevel);
          }
          if (event.command === "get_available_models" && Array.isArray(data.models)) {
            setAvailableModels(data.models);
          }
        }
        if (!event.success && event.error) {
          setError(String(event.error));
          setTimeout(() => setError(null), 5000);
        }
        return;
      }

      default:
        return;
    }
  }, [flushDeltas, scheduleDeltaFlush]);

  // ---- Session handlers -------------------------------------------------
  const onNewChat = useCallback(() => {
    const s = sessionStore.create("New chat", cwdRef.current, modelLabelRef.current);
    switchToSession(s.id);
    setNotice("New chat created");
    setTimeout(() => setNotice(null), 2000);
  }, [switchToSession]);

  const onSelectSession = useCallback((id: string) => {
    switchToSession(id);
  }, [switchToSession]);

  const onArchiveSession = useCallback((id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    if (s.status === "active") sessionStore.archive(id);
    else sessionStore.restore(id);
    refreshSessions();
    setNotice(s.status === "active" ? "Archived" : "Restored");
    setTimeout(() => setNotice(null), 1500);
  }, [sessions, refreshSessions]);

  const onDeleteSession = useCallback((id: string) => {
    sessionStore.delete(id);
    if (activeSessionId === id) {
      const remaining = sessionStore.getActive();
      if (remaining.length > 0) {
        switchToSession(remaining[0].id);
      } else {
        setActiveSessionId(null);
        setActiveMessages([]);
      }
    }
    messageStore.remove(id);
    refreshSessions();
    setNotice("Session deleted");
    setTimeout(() => setNotice(null), 1500);
  }, [activeSessionId, refreshSessions, switchToSession]);

  const onOpenPalette = useCallback(() => {
    setPaletteOpen(true);
  }, []);

  // ---- Backend wrappers -------------------------------------------------
  const pickCwd = useCallback(async () => {
    const dir = await pi.pickDirectory();
    if (!dir) return;

    // Find existing session for this cwd, or create one
    const all = sessionStore.getAll();
    const existing = all.find((s) => s.cwd === dir && s.status === "active");
    if (existing) {
      switchToSession(existing.id);
    } else {
      const s = sessionStore.create("New chat", dir, modelLabelRef.current);
      switchToSession(s.id);
    }

    setNotice(`Switched to ${dir}`);
    setTimeout(() => setNotice(null), 3000);
  }, [switchToSession]);

  const switchModel = useCallback(async (provider: string, modelId: string) => {
    setModelLabel(`${provider}/${modelId}`);
    try { await pi.setModel(provider, modelId); } catch (e: any) { setError(String(e?.message ?? e)); }
  }, []);

  const setThinking = useCallback(async (level: string) => {
    try {
      await pi.setThinkingLevel(level);
      setThinkingLevel(level);
    } catch (e: any) { setError(String(e?.message ?? e)); }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || status !== "ready" || !activeSessionIdRef.current) return;
    const msg: Message = { id: uid(), kind: "user", text, at: Date.now() };
    setActiveMessages((prev) => [...prev, msg]);
    setInput("");
    setStatus("busy");
    sessionStore.incrementMsgs(activeSessionIdRef.current);
    try { await pi.sendPrompt(text); } catch (e: any) { setError(String(e?.message ?? e)); setStatus("ready"); }
  }, [input, status]);

  const abort = useCallback(async () => {
    try { await pi.sendAbort(); } catch (e: any) { setError(String(e?.message ?? e)); }
  }, []);

  // ---- Keyboard shortcuts -----------------------------------------------
  const activeList = sessions;
  const onCycleSession = useCallback(
    (dir: 1 | -1) => {
      const ids = activeList.map((s) => s.id);
      const idx = activeSessionId ? ids.indexOf(activeSessionId) : 0;
      const next = (idx + dir + ids.length) % ids.length;
      switchToSession(ids[next]);
    },
    [activeSessionId, activeList, switchToSession],
  );

  const shortcutBindings: ShortcutBinding[] = useMemo(
    () => [
      { ...SHORTCUTS.newChat, run: onNewChat },
      { ...SHORTCUTS.toggleFiles, run: () => { setRailOpen(true); setRailTab("files"); } },
      { ...SHORTCUTS.toggleTerminal, run: () => { setRailOpen(true); setRailTab("terminal"); } },
      { ...SHORTCUTS.toggleRail, run: () => setRailOpen((v) => !v) },
      { ...SHORTCUTS.commandPalette, run: onOpenPalette },
      { ...SHORTCUTS.toggleSidebar, run: () => setSidebarLocked((v) => !v) },
      { ...SHORTCUTS.prevSession, run: () => onCycleSession(-1) },
      { ...SHORTCUTS.nextSession, run: () => onCycleSession(1) },
      { ...SHORTCUTS.settings, run: () => setSettingsOpen((v) => !v) },
    ],
    [onNewChat, onOpenPalette, onCycleSession],
  );
  useShortcuts(shortcutBindings);

  // ---- Derived values ---------------------------------------------------
  const tokenEstimate = useMemo(
    () => (activeMessages.length === 0 ? "0" : Math.round(activeMessages.length * 220).toLocaleString()),
    [activeMessages.length],
  );

  return (
    <div className={`app ${railOpen ? "rail-open" : "rail-closed"}`}>
      <Titlebar
        status={status}
        sessionTitle={sessions.find((s) => s.id === activeSessionId)?.title ?? ""}
        sidebarLocked={sidebarLocked}
        onToggleSidebar={() => setSidebarLocked((v) => !v)}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewChat={onNewChat}
      />

      <div className="app-body">
        <div className="sidebar-slot">
          <CollapsibleSidebar
            badge={sessions.length}
            locked={sidebarLocked}
            onNewChat={onNewChat}
            onOpenPalette={onOpenPalette}
          >
            <SessionSidebar
              sessions={sessions}
              activeId={activeSessionId}
              query={sessionQuery}
              onQueryChange={setSessionQuery}
              onSelect={onSelectSession}
              onNewChat={onNewChat}
              onArchive={onArchiveSession}
              onDelete={onDeleteSession}
              onOpenPalette={onOpenPalette}
              onToggleFiles={() => { setRailOpen(true); setRailTab("files"); }}
              onToggleTerminal={() => { setRailOpen(true); setRailTab("terminal"); }}
              onToggleRail={() => setRailOpen((v) => !v)}
              cwd={cwd}
              isMac={isMac}
            />
          </CollapsibleSidebar>
        </div>

        <div className="main">
          {(error || notice) && (
            <div className="banners">
              {error && <div className="banner error">{error}</div>}
              {notice && <div className="banner notice">{notice}</div>}
            </div>
          )}
          <MessageList messages={activeMessages} />
          <Composer
            status={status}
            input={input}
            onInput={setInput}
            onSend={send}
            onAbort={abort}
            modelLabel={modelLabel}
            thinkingLevel={thinkingLevel}
            availableModels={availableModels}
            onSwitchModel={switchModel}
            onSetThinking={setThinking}
            cwd={cwd}
            onPickCwd={pickCwd}
          />
        </div>

        {railOpen && (
          <>
            <div className="divider" data-side="left" onMouseDown={rail.handleProps.onMouseDown} />
            <div className="rail-slot" style={{ width: rail.width, flex: `0 0 ${rail.width}px` }}>
              <RightRail activeTab={railTab} onActiveTab={setRailTab} onClose={() => setRailOpen(false)} />
            </div>
          </>
        )}
      </div>

      {/* StatusBar hidden by default in Style E. Only show when the user
          needs to know something is wrong or in-flight. */}
      {(error || notice) && (
        <StatusBar
          status={status}
          cwd={cwd}
          modelLabel={modelLabel}
          thinkingLevel={thinkingLevel}
          tokenEstimate={tokenEstimate}
        />
      )}

      {pendingDialog && (
        <ExtensionDialog
          request={pendingDialog}
          onResolve={async (response) => {
            setPendingDialog(null);
            try { await pi.respondExtensionUi(pendingDialog.id, response); } catch (e: any) { setError(String(e?.message ?? e)); }
          }}
        />
      )}

      {settingsOpen && (
        <Settings theme={theme} onToggleTheme={toggleTheme} onClose={() => setSettingsOpen(false)} />
      )}

      {paletteOpen && (
        <CommandPalette
          sessions={sessions}
          onClose={() => setPaletteOpen(false)}
          onNewChat={() => { onNewChat(); }}
          onToggleFiles={() => { setRailOpen(true); setRailTab("files"); }}
          onToggleTerminal={() => { setRailOpen(true); setRailTab("terminal"); }}
          onToggleRail={() => setRailOpen((v) => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
          onSelectSession={onSelectSession}
        />
      )}
    </div>
  );
}

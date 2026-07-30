import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export interface BackendStatus {
  running: boolean;
  cwd: string | null;
  pid: number | null;
}

export interface ImageContent {
  type: "image";
  data: string; // base64
  mimeType: string;
}

// ---- Deferred response helpers (for RPCs that return data) ---------------

type Deferred<T> = { resolve: (v: T) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
const deferred = new Map<string, Deferred<any>>();

function defer<T>(key: string, timeoutMs = 10_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      deferred.delete(key);
      reject(new Error(`${key} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    deferred.set(key, { resolve, reject, timer });
  });
}

function resolveDeferred(key: string, value: unknown) {
  const d = deferred.get(key);
  if (!d) return;
  clearTimeout(d.timer);
  deferred.delete(key);
  d.resolve(value);
}

function rejectDeferred(key: string, err: Error) {
  const d = deferred.get(key);
  if (!d) return;
  clearTimeout(d.timer);
  deferred.delete(key);
  d.reject(err);
}

/**
 * Called by the event handler when a `response` event arrives from pi.
 * Routes to the matching deferred promise by `command` name.
 */
export function handlePiResponse(event: { command: string; success: boolean; data?: unknown; error?: string }) {
  if (event.success) {
    resolveDeferred(`rpc:${event.command}`, event.data);
  } else {
    rejectDeferred(`rpc:${event.command}`, new Error(event.error ?? `${event.command} failed`));
  }
}

// ---- Commands ----

export const getStatus = () => invoke<BackendStatus>("get_status");

export const startPi = (cwd: string, sessionId?: string) =>
  invoke<BackendStatus>("start_pi", { cwd, sessionId: sessionId ?? null });

export const stopPi = () => invoke<void>("stop_pi");

export const sendPrompt = (message: string, images: ImageContent[] = []) =>
  invoke<void>("send_prompt", {
    args: { message, images, streamingBehavior: null },
  });

export const sendSteer = (message: string) =>
  invoke<void>("send_steer", { message });

export const sendFollowUp = (message: string) =>
  invoke<void>("send_follow_up", { message });

export const sendAbort = () => invoke<void>("send_abort");

export const setModel = (provider: string, modelId: string) =>
  invoke<void>("set_model", { provider, modelId });

export const setThinkingLevel = (level: string) =>
  invoke<void>("set_thinking_level", { level });

export const getState = () => invoke<unknown>("get_state");

export const getAvailableModels = () => invoke<unknown>("get_available_models");

export const newSession = () => {
  invoke<void>("new_session").catch((err) => {
    rejectDeferred("rpc:new_session", err instanceof Error ? err : new Error(String(err)));
  });
  return defer<unknown>("rpc:new_session");
};

export const switchSession = (sessionId: string) =>
  invoke<void>("switch_session", { sessionId });

export const getSessionMessages = () => {
  invoke<void>("get_session_messages");
  return defer<unknown>("rpc:get_session_messages");
};

export const getSessionId = () => invoke<string | null>("get_session_id");

export const migrateSessionMessages = (
  sessionId: string,
  cwd: string,
  messages: { role: string; content: string }[],
) => invoke<void>("migrate_session_messages", { sessionId, cwd, messages });

export const respondExtensionUi = (
  id: string,
  response: Record<string, unknown>,
) => invoke<void>("respond_extension_ui", { id, response });

export const frontendLog = (level: string, message: string) =>
  invoke<void>("frontend_log", { level, message });

export const showMainWindow = () => invoke<void>("show_main_window");

/**
 * Open the macOS native folder picker. Returns the chosen path, or null
 * if the user cancelled. Backed by `tauri-plugin-dialog`.
 */
export async function pickDirectory(): Promise<string | null> {
  const result = await openDialog({
    directory: true,
    multiple: false,
    title: "Select working directory",
  });
  return typeof result === "string" ? result : null;
}

// ---- Events ----

/** Subscribe to all pi events. Returns an unlisten function. */
export async function onPiEvent(
  handler: (event: PiEvent) => void,
): Promise<UnlistenFn> {
  return listen<PiEvent>("pi:event", (e) => handler(e.payload));
}

// ---- Event types (loose typing; pi emits untyped JSON) ----

export interface PiEvent {
  type: string;
  [key: string]: unknown;
}

export type AssistantMessageEvent = {
  type:
    | "start"
    | "text_start"
    | "text_delta"
    | "text_end"
    | "thinking_start"
    | "thinking_delta"
    | "thinking_end"
    | "toolcall_start"
    | "toolcall_delta"
    | "toolcall_end"
    | "done"
    | "error";
  delta?: string;
  contentIndex?: number;
  partial?: unknown;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
};

export type ExtensionUiRequest = {
  type: "extension_ui_request";
  id: string;
  method: "select" | "confirm" | "input" | "editor" | "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text";
  title?: string;
  message?: string;
  options?: string[];
  prefill?: string;
  placeholder?: string;
  statusKey?: string;
  statusText?: string;
  widgetKey?: string;
  widgetLines?: string[];
  widgetPlacement?: "aboveEditor" | "belowEditor";
  text?: string;
  notifyType?: "info" | "warning" | "error";
  timeout?: number;
};

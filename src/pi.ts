// Pi Desktop - IPC client wrapping the Rust PiBackend.
//
// Renderer-side facade so React components never call `invoke` / `listen`
// directly. This is the seam where we will later swap the RPC backend for
// the in-process Node SDK if/when we need features that RPC cannot express
// (dynamic tool registration, runtime message mutation, sub-agents, etc.).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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

// ---- Commands ----

export const getStatus = () => invoke<BackendStatus>("get_status");

export const startPi = (cwd: string) =>
  invoke<BackendStatus>("start_pi", { cwd });

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

export const newSession = () => invoke<void>("new_session");

export const respondExtensionUi = (
  id: string,
  response: Record<string, unknown>,
) => invoke<void>("respond_extension_ui", { id, response });

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

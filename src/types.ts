// Shared types for the renderer. These mirror the pi RPC protocol but stay
// loose because the real source of truth is the JSON coming over JSONL.

export type Role = "user" | "assistant" | "tool" | "system";

export interface UserMessage {
  id: string;
  kind: "user";
  text: string;
  at: number;
}

export interface AssistantMessage {
  id: string; // matches pi's `message.id` so updates correlate
  kind: "assistant";
  text: string;
  thinking: string;
  isStreaming: boolean;
  at: number;
}

export interface ToolMessage {
  id: string; // unique, derived from toolCallId
  kind: "tool";
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  at: number;
}

export type Message = UserMessage | AssistantMessage | ToolMessage;

export type ConnectionStatus = "disconnected" | "ready" | "busy" | "error";

export type ModelOption = {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  contextWindow?: number;
};

export interface ExtensionUiRequest {
  type: "extension_ui_request";
  id: string;
  method:
    | "select"
    | "confirm"
    | "input"
    | "editor"
    | "notify"
    | "setStatus"
    | "setWidget"
    | "setTitle"
    | "set_editor_text";
  title?: string;
  message?: string;
  options?: string[];
  prefill?: string;
  placeholder?: string;
  notifyType?: "info" | "warning" | "error";
}

export interface AssistantMessageEvent {
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
}

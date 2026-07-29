import type { Message } from "../types";

const PREFIX = "pi.msgs.";

export const messageStore = {
  load(sessionId: string): Message[] {
    try {
      const raw = localStorage.getItem(PREFIX + sessionId);
      if (raw) return JSON.parse(raw) as Message[];
    } catch {}
    return [];
  },

  save(sessionId: string, messages: Message[]) {
    try { localStorage.setItem(PREFIX + sessionId, JSON.stringify(messages)); } catch {}
  },

  add(sessionId: string, message: Message) {
    const msgs = this.load(sessionId);
    msgs.push(message);
    this.save(sessionId, msgs);
  },

  update(sessionId: string, id: string, patch: Partial<Message>) {
    const msgs = this.load(sessionId);
    const idx = msgs.findIndex((m) => m.id === id);
    if (idx === -1) return;
    msgs[idx] = { ...msgs[idx], ...patch } as Message;
    this.save(sessionId, msgs);
  },

  remove(sessionId: string) {
    try { localStorage.removeItem(PREFIX + sessionId); } catch {}
  },
};

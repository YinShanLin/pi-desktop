export type SessionStatus = "active" | "archived";

export type Session = {
  id: string;
  title: string;
  cwd: string;
  model: string;
  messageCount: number;
  status: SessionStatus;
  group: "today" | "yesterday" | "earlier";
  updatedAt: number;
  diffStats?: { added: number; removed: number };
  unread?: boolean;
  piSessionId?: string;
};

const STORAGE_KEY = "pi.sessions";

function load(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Session[];
  } catch {}
  return [];
}

function save(sessions: Session[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch {}
}

function computeGroup(ts: number): Session["group"] {
  const diff = Date.now() - ts;
  if (diff < 24 * 60 * 60 * 1000) return "today";
  if (diff < 48 * 60 * 60 * 1000) return "yesterday";
  return "earlier";
}

let _uid = 0;
function uid() {
  return `s_${Date.now().toString(36)}_${(_uid++).toString(36)}`;
}

export const sessionStore = {
  getAll(): Session[] {
    return load();
  },

  getActive(): Session[] {
    return load().filter((s) => s.status === "active");
  },

  getArchived(): Session[] {
    return load().filter((s) => s.status === "archived");
  },

  create(title: string, cwd: string, model: string, piSessionId?: string): Session {
    const sessions = load();
    const now = Date.now();
    const s: Session = {
      id: uid(),
      title,
      cwd,
      model,
      messageCount: 0,
      status: "active",
      group: computeGroup(now),
      updatedAt: now,
      piSessionId,
    };
    sessions.unshift(s);
    save(sessions);
    return s;
  },

  update(id: string, patch: Partial<Session>) {
    const sessions = load();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    sessions[idx] = { ...sessions[idx], ...patch, group: computeGroup(patch.updatedAt ?? sessions[idx].updatedAt) };
    save(sessions);
  },

  archive(id: string) {
    const sessions = load();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    sessions[idx].status = "archived";
    save(sessions);
  },

  restore(id: string) {
    const sessions = load();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    sessions[idx].status = "active";
    save(sessions);
  },

  delete(id: string) {
    const sessions = load().filter((s) => s.id !== id);
    save(sessions);
  },

  incrementMsgs(id: string) {
    const sessions = load();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    sessions[idx].messageCount++;
    sessions[idx].updatedAt = Date.now();
    sessions[idx].group = computeGroup(sessions[idx].updatedAt);
    save(sessions);
  },

  markRead(id: string) {
    const sessions = load();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    sessions[idx].unread = false;
    save(sessions);
  },
};

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

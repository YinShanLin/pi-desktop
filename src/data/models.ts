import type { ModelOption } from "../types";

const STORAGE_KEY = "pi.user.models";

export function loadUserModels(): ModelOption[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ModelOption[];
  } catch {}
  return [];
}

export function saveUserModels(models: ModelOption[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(models)); } catch {}
}

export function addUserModel(model: ModelOption) {
  const list = loadUserModels();
  const idx = list.findIndex((m) => m.provider === model.provider && m.id === model.id);
  if (idx >= 0) list[idx] = model;
  else list.push(model);
  saveUserModels(list);
}

export function removeUserModel(provider: string, id: string) {
  saveUserModels(loadUserModels().filter((m) => !(m.provider === provider && m.id === id)));
}

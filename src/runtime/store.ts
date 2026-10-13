import { create } from "zustand";

import { getPath, setIn } from "@/runtime/path";

const STATE_KEY = "manifest.state.v1";

type Store = {
  byId: Record<string, Record<string, unknown>>;
  ensure: (pageId: string, defaults: Record<string, unknown>) => void;
  hydrate: () => void;
  setPath: (pageId: string, path: string, value: unknown) => void;
  toggle: (pageId: string, path: string) => void;
  toggleIn: (pageId: string, path: string, value: unknown) => void;
  toggleField: (
    pageId: string,
    path: string,
    where: { field: string; eq: unknown },
    field: string,
  ) => void;
  append: (pageId: string, path: string, value: unknown) => void;
  removeWhere: (pageId: string, path: string, where: { field: string; eq: unknown }) => void;
  patchWhere: (
    pageId: string,
    path: string,
    where: { field: string; eq: unknown },
    partial: Record<string, unknown>,
  ) => void;
  reset: (pageId: string, defaults: Record<string, unknown>) => void;
};

function persist(byId: Record<string, Record<string, unknown>>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(byId));
  } catch {
    /* ignore quota */
  }
}

function read(pageId: string, byId: Store["byId"]): Record<string, unknown> {
  return byId[pageId] ?? {};
}

function commit(
  set: (partial: Partial<Store>) => void,
  get: () => Store,
  pageId: string,
  next: Record<string, unknown>,
) {
  const byId = { ...get().byId, [pageId]: next };
  set({ byId });
  persist(byId);
}

export const usePageStore = create<Store>((set, get) => ({
  byId: {},
  ensure: (pageId, defaults) => {
    const current = get().byId[pageId];
    if (!current) {
      set({ byId: { ...get().byId, [pageId]: structuredClone(defaults) } });
      return;
    }
    let changed = false;
    const next = { ...current };
    for (const [key, value] of Object.entries(defaults)) {
      if (next[key] === undefined) {
        next[key] = value;
        changed = true;
      }
    }
    if (changed) set({ byId: { ...get().byId, [pageId]: next } });
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      const byId = { ...get().byId };
      for (const [id, value] of Object.entries(saved)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          byId[id] = { ...(byId[id] ?? {}), ...(value as Record<string, unknown>) };
        }
      }
      set({ byId });
    } catch {
      /* ignore corrupt state */
    }
  },
  setPath: (pageId, path, value) => {
    commit(set, get, pageId, setIn(read(pageId, get().byId), path, value));
  },
  toggle: (pageId, path) => {
    const current = getPath(read(pageId, get().byId), path.startsWith("state.") ? path.slice(6) : path);
    commit(set, get, pageId, setIn(read(pageId, get().byId), path, !current));
  },
  toggleIn: (pageId, path, value) => {
    const current = getPath(read(pageId, get().byId), path.startsWith("state.") ? path.slice(6) : path);
    const list = Array.isArray(current) ? current : [];
    const has = list.some((item) => item === value || String(item) === String(value));
    const next = has ? list.filter((item) => String(item) !== String(value)) : [...list, value];
    commit(set, get, pageId, setIn(read(pageId, get().byId), path, next));
  },
  toggleField: (pageId, path, where, field) => {
    const current = getPath(read(pageId, get().byId), path.startsWith("state.") ? path.slice(6) : path);
    if (!Array.isArray(current)) return;
    const next = current.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = item as Record<string, unknown>;
      if (String(row[where.field]) !== String(where.eq)) return item;
      return { ...row, [field]: !row[field] };
    });
    commit(set, get, pageId, setIn(read(pageId, get().byId), path, next));
  },
  append: (pageId, path, value) => {
    const current = getPath(read(pageId, get().byId), path.startsWith("state.") ? path.slice(6) : path);
    const list = Array.isArray(current) ? current : [];
    commit(set, get, pageId, setIn(read(pageId, get().byId), path, [...list, value]));
  },
  removeWhere: (pageId, path, where) => {
    const current = getPath(read(pageId, get().byId), path.startsWith("state.") ? path.slice(6) : path);
    if (!Array.isArray(current)) return;
    const next = current.filter((item) => {
      if (!item || typeof item !== "object") return true;
      return String((item as Record<string, unknown>)[where.field]) !== String(where.eq);
    });
    commit(set, get, pageId, setIn(read(pageId, get().byId), path, next));
  },
  patchWhere: (pageId, path, where, partial) => {
    const current = getPath(read(pageId, get().byId), path.startsWith("state.") ? path.slice(6) : path);
    if (!Array.isArray(current)) return;
    const next = current.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = item as Record<string, unknown>;
      if (String(row[where.field]) !== String(where.eq)) return item;
      return { ...row, ...partial };
    });
    commit(set, get, pageId, setIn(read(pageId, get().byId), path, next));
  },
  reset: (pageId, defaults) => {
    commit(set, get, pageId, structuredClone(defaults));
  },
}));

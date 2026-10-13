import { resolveValue } from "@/runtime/path";
import { usePageStore } from "@/runtime/store";
import type { Action, Scope } from "@/runtime/types";

export type ActionEnv = {
  navigate: (to: string) => void;
  toast: (message: string) => void;
  invalidate: (source: string) => void;
  defaults: Record<string, unknown>;
};

function asActions(raw: unknown): Action[] {
  if (Array.isArray(raw)) return raw.filter((item) => item && typeof item === "object") as Action[];
  if (raw && typeof raw === "object" && "do" in raw) return [raw as Action];
  return [];
}

function text(value: unknown, scope: Scope): string {
  const next = resolveValue(value, scope);
  return next == null ? "" : String(next);
}

export function perform(raw: unknown, scope: Scope, pageId: string, env: ActionEnv) {
  const store = usePageStore.getState();
  for (const action of asActions(raw)) {
    if (action.do === "set" && action.path) {
      store.setPath(pageId, action.path, resolveValue(action.value, scope));
      continue;
    }
    if (action.do === "setMany" && action.values) {
      for (const [path, value] of Object.entries(action.values)) {
        usePageStore.getState().setPath(pageId, path, resolveValue(value, scope));
      }
      continue;
    }
    if (action.do === "toggle" && action.path) {
      store.toggle(pageId, action.path);
      continue;
    }
    if (action.do === "toggleIn" && action.path) {
      store.toggleIn(pageId, action.path, resolveValue(action.value, scope));
      continue;
    }
    if (action.do === "toggleField" && action.path && action.where && action.field) {
      store.toggleField(
        pageId,
        action.path,
        { field: action.where.field, eq: resolveValue(action.where.eq, scope) },
        action.field,
      );
      continue;
    }
    if (action.do === "append" && action.path) {
      const value = resolveValue(action.value, scope);
      if (value && typeof value === "object" && "title" in value) {
        const title = String((value as { title?: unknown }).title ?? "").trim();
        if (!title) {
          env.toast("Write something first");
          return;
        }
      }
      store.append(pageId, action.path, value);
      continue;
    }
    if (action.do === "remove" && action.path && action.where) {
      store.removeWhere(pageId, action.path, {
        field: action.where.field,
        eq: resolveValue(action.where.eq, scope),
      });
      continue;
    }
    if (action.do === "patch" && action.path && action.where) {
      const partial: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(action.set ?? {})) {
        partial[key] = resolveValue(value, scope);
      }
      store.patchWhere(
        pageId,
        action.path,
        { field: action.where.field, eq: resolveValue(action.where.eq, scope) },
        partial,
      );
      continue;
    }
    if (action.do === "splitSet") {
      const parts = text(action.value, scope).split(action.sep || "|");
      (action.into ?? []).forEach((path, index) => {
        const piece = parts[index] ?? "";
        const value = /^-?\d+(\.\d+)?$/.test(piece) ? Number(piece) : piece;
        usePageStore.getState().setPath(pageId, path, value);
      });
      continue;
    }
    if (action.do === "toast") {
      env.toast(text(action.message, scope));
      continue;
    }
    if (action.do === "navigate") {
      env.navigate(text(action.to, scope));
      continue;
    }
    if (action.do === "refetch" && action.source) {
      env.invalidate(action.source);
      continue;
    }
    if (action.do === "reset") {
      store.reset(pageId, env.defaults);
    }
  }
}

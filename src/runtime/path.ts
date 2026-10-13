import type { Scope } from "@/runtime/types";

export function stripState(path: string): string {
  return path.startsWith("state.") ? path.slice("state.".length) : path;
}

export function getPath(root: unknown, path: string): unknown {
  if (!path) return root;
  const parts = path.split(".").filter(Boolean);
  let cur = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setIn(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = stripState(path).split(".").filter(Boolean);
  if (parts.length === 0) return root;
  const clone = structuredClone(root);
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (next == null || typeof next !== "object") {
      const slot: Record<string, unknown> = {};
      cur[key] = slot;
      cur = slot;
    } else {
      cur = next as Record<string, unknown>;
    }
  }
  cur[parts[parts.length - 1]!] = value;
  return clone;
}

function truthy(value: unknown): boolean {
  return value != null && value !== false && value !== "";
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" || typeof b === "number") {
    if (a == null || b == null || a === "" || b === "") return false;
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

function formatNumber(value: unknown, digits: number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}

function weatherPhrase(code: unknown): string {
  const n = Number(code);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "Clear";
  if (n <= 3) return "Clouded over";
  if (n === 45 || n === 48) return "Fog";
  if (n <= 57) return "Drizzle";
  if (n <= 67) return "Rain";
  if (n <= 77) return "Snow";
  if (n <= 82) return "Showers";
  if (n >= 95) return "Storm";
  return "Mixed sky";
}

function applyPipe(value: unknown, pipe: string): unknown {
  const [name, arg] = pipe.split(":").map((p) => p.trim());
  if (name === "currency") {
    if (value == null || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }
  if (name === "number") return value == null || value === "" ? "—" : formatNumber(value, 1);
  if (name === "rate") return value == null || value === "" ? "—" : formatNumber(value, 4);
  if (name === "percent") {
    if (value == null || value === "") return "—";
    return `${formatNumber(value, 0)}%`;
  }
  if (name === "temp") {
    if (value == null || value === "") return "—";
    return `${formatNumber(value, 1)}°`;
  }
  if (name === "weather") return weatherPhrase(value);
  if (name === "upper") return value == null ? "" : String(value).toUpperCase();
  if (name === "lower") return value == null ? "" : String(value).toLowerCase();
  if (name === "fallback") return value == null || value === "" ? (arg ?? "—") : value;
  return value;
}

export function applyExpr(expr: string, scope: Scope): unknown {
  const parts = expr.split("|").map((p) => p.trim());
  const head = parts[0] ?? "";
  let value: unknown;
  if (
    (head.startsWith('"') && head.endsWith('"')) ||
    (head.startsWith("'") && head.endsWith("'"))
  ) {
    value = head.slice(1, -1);
  } else if (head === "true") value = true;
  else if (head === "false") value = false;
  else if (head === "null") value = null;
  else if (/^-?\d+(\.\d+)?$/.test(head)) value = Number(head);
  else value = getPath(scope, head);
  for (const pipe of parts.slice(1)) value = applyPipe(value, pipe);
  return value;
}

export function resolveValue(value: unknown, scope: Scope): unknown {
  if (typeof value === "string") {
    const whole = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (whole) return applyExpr(whole[1]!.trim(), scope);
    if (value.includes("{{")) {
      return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
        const next = applyExpr(expr.trim(), scope);
        return next == null ? "" : String(next);
      });
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, scope));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = resolveValue(inner, scope);
    return out;
  }
  return value;
}

export function readPath(expr: string, scope: Scope): unknown {
  if (expr.includes("{{")) return resolveValue(expr, scope);
  return applyExpr(expr, scope);
}

export function isShown(show: unknown, scope: Scope): boolean {
  if (show == null) return true;
  if (typeof show === "string") return truthy(readPath(show, scope));
  if (typeof show !== "object") return true;
  const spec = show as Record<string, unknown>;
  if (typeof spec.path !== "string") return true;
  const left = readPath(spec.path, scope);
  if ("includes" in spec) {
    const needle = resolveValue(spec.includes, scope);
    return Array.isArray(left) && left.some((item) => same(item, needle));
  }
  if ("excludes" in spec) {
    const needle = resolveValue(spec.excludes, scope);
    return !Array.isArray(left) || !left.some((item) => same(item, needle));
  }
  if ("eq" in spec) return same(left, resolveValue(spec.eq, scope));
  if ("neq" in spec) return !same(left, resolveValue(spec.neq, scope));
  return truthy(left);
}

export function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return formatNumber(value, 1);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

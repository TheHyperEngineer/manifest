import { getPath, isShown, resolveValue } from "@/runtime/path";
import type { Clause, DataSource, DeriveSource, Scope } from "@/runtime/types";

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" || typeof b === "number") {
    if (a == null || b == null || a === "" || b === "") return false;
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

function clausePasses(clause: Clause, row: unknown, scope: Scope): boolean {
  if (clause.when != null && !isShown(clause.when, scope)) return true;
  const left = getPath(row, clause.field);
  if ("eq" in clause && clause.eq !== undefined) return same(left, resolveValue(clause.eq, scope));
  if ("neq" in clause && clause.neq !== undefined) {
    return !same(left, resolveValue(clause.neq, scope));
  }
  return true;
}

function pickFrom(data: unknown, pick: string | undefined, scope: Scope): unknown {
  if (!pick) return data;
  const key = pick.includes("{{") ? resolveValue(pick, scope) : pick;
  if (typeof key !== "string" || key === "") return data;
  return getPath(data, key);
}

function runDerive(source: DeriveSource, values: Record<string, unknown>, scope: Scope): unknown {
  let data: unknown = source.fromState
    ? getPath(scope.state, source.fromState)
    : source.from
      ? values[source.from]
      : undefined;
  data = pickFrom(data, source.pick, scope);

  const clauses: Clause[] = [
    ...(source.where ? [source.where] : []),
    ...(source.match?.all ?? []),
  ];

  if (Array.isArray(data) && clauses.length > 0) {
    data = data.filter((row) => clauses.every((clause) => clausePasses(clause, row, scope)));
  }

  if (Array.isArray(data) && source.search) {
    const query = String(resolveValue(source.search.query, scope) ?? "")
      .trim()
      .toLowerCase();
    if (query) {
      const fields = source.search.fields ?? [];
      data = data.filter((row) =>
        fields.some((field) =>
          String(getPath(row, field) ?? "")
            .toLowerCase()
            .includes(query),
        ),
      );
    }
  }

  if (Array.isArray(data) && source.sort?.field) {
    const field = source.sort.field;
    const dir = source.sort.dir === "desc" ? -1 : 1;
    data = [...data].sort((a, b) => {
      const av = getPath(a, field);
      const bv = getPath(b, field);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }

  if (source.count || source.sum) {
    const rows = Array.isArray(data) ? data : [];
    const sum = source.sum
      ? rows.reduce((total, row) => total + (Number(getPath(row, source.sum!)) || 0), 0)
      : undefined;
    return { count: rows.length, sum };
  }

  if (source.first) {
    if (Array.isArray(data)) return data[0] ?? null;
    return data ?? null;
  }

  return data;
}

export function computeSources(
  sources: DataSource[] | undefined,
  state: Record<string, unknown>,
  http: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(http)) values[key] = value;
  for (const source of sources ?? []) {
    if (source.kind === "static") values[source.id] = source.data;
  }
  const derives = (sources ?? []).filter((source): source is DeriveSource => source.kind === "derive");
  const passes = Math.max(1, derives.length);
  for (let pass = 0; pass < passes; pass++) {
    const scope: Scope = { state, sources: values, index: 0, now: "" };
    for (const source of derives) values[source.id] = runDerive(source, values, scope);
  }
  return values;
}

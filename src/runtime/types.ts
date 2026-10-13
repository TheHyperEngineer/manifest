export type Clause = {
  field: string;
  eq?: unknown;
  neq?: unknown;
  when?: unknown;
};

export type StaticSource = {
  id: string;
  kind: "static";
  data: unknown;
};

export type HttpSource = {
  id: string;
  kind: "http";
  url: string;
  pick?: string;
  entries?: boolean;
};

export type DeriveSource = {
  id: string;
  kind: "derive";
  from?: string;
  fromState?: string;
  pick?: string;
  where?: Clause;
  match?: { all?: Clause[] };
  search?: { query: string; fields: string[] };
  sort?: { field: string; dir?: "asc" | "desc" };
  first?: boolean;
  count?: boolean;
  sum?: string;
};

export type DataSource = StaticSource | HttpSource | DeriveSource;

export type Node = {
  type: string;
  children?: Node[];
  template?: Node;
  empty?: Node;
  show?: unknown;
  [key: string]: unknown;
};

export type PageConfig = {
  id: string;
  title: string;
  kicker?: string;
  summary?: string;
  icon?: string;
  state?: Record<string, unknown>;
  sources?: DataSource[];
  root: Node;
};

export type AppManifest = {
  product: string;
  name: string;
  summary: string;
  defaultPage: string;
  pages: string[];
};

export type Scope = {
  state: Record<string, unknown>;
  sources: Record<string, unknown>;
  item?: unknown;
  index?: number;
  event?: unknown;
  now?: string;
};

export type SourceStatus = "idle" | "loading" | "ready" | "error";

export type RenderCtx = {
  pageId: string;
  state: Record<string, unknown>;
  sources: Record<string, unknown>;
  sourceStatus: Record<string, SourceStatus>;
  sourceError: Record<string, string>;
  item?: unknown;
  index?: number;
  run: (actions: unknown, extra?: { event?: unknown; item?: unknown }) => void;
};

export type Action = {
  do: string;
  path?: string;
  value?: unknown;
  values?: Record<string, unknown>;
  to?: string;
  message?: string;
  source?: string;
  where?: { field: string; eq?: unknown };
  set?: Record<string, unknown>;
  field?: string;
  sep?: string;
  into?: string[];
};

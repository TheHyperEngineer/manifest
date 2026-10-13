import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { isAllowedUrl } from "@/runtime/allowlist";
import { computeSources } from "@/runtime/derive";
import { getPath, resolveValue } from "@/runtime/path";
import type { HttpSource, PageConfig, SourceStatus } from "@/runtime/types";

type Bag = {
  sources: Record<string, unknown>;
  sourceStatus: Record<string, SourceStatus>;
  sourceError: Record<string, string>;
};

type HttpState = { status: SourceStatus; data?: unknown; error: string };

export function Sources({
  page,
  state,
  children,
}: {
  page: PageConfig;
  state: Record<string, unknown>;
  children: (bag: Bag) => ReactNode;
}) {
  const [http, setHttp] = useState<Record<string, HttpState>>({});
  const httpSources = useMemo(
    () => (page.sources ?? []).filter((source): source is HttpSource => source.kind === "http"),
    [page.sources],
  );
  const onResult = useCallback((id: string, next: HttpState) => {
    setHttp((prev) => {
      const current = prev[id];
      if (
        current &&
        current.status === next.status &&
        current.data === next.data &&
        current.error === next.error
      ) {
        return prev;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  const httpData = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const source of httpSources) {
      const row = http[source.id];
      if (row && row.status === "ready") out[source.id] = row.data;
    }
    return out;
  }, [http, httpSources]);

  const sources = useMemo(
    () => computeSources(page.sources, state, httpData),
    [page.sources, state, httpData],
  );

  const bag = useMemo<Bag>(() => {
    const sourceStatus: Record<string, SourceStatus> = {};
    const sourceError: Record<string, string> = {};
    for (const source of page.sources ?? []) {
      if (source.kind === "http") {
        sourceStatus[source.id] = http[source.id]?.status ?? "loading";
        sourceError[source.id] = http[source.id]?.error ?? "";
      } else {
        sourceStatus[source.id] = "ready";
      }
    }
    return { sources, sourceStatus, sourceError };
  }, [page.sources, http, sources]);

  return (
    <>
      {httpSources.map((source) => (
        <HttpLoader
          key={source.id}
          pageId={page.id}
          source={source}
          state={state}
          onResult={onResult}
        />
      ))}
      {children(bag)}
    </>
  );
}

function HttpLoader({
  pageId,
  source,
  state,
  onResult,
}: {
  pageId: string;
  source: HttpSource;
  state: Record<string, unknown>;
  onResult: (id: string, next: HttpState) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const url = String(
    resolveValue(source.url, { state, sources: {}, index: 0, now: "" }) ?? "",
  );
  const allowed = isAllowedUrl(url);
  const query = useQuery({
    queryKey: ["manifest-src", pageId, source.id, url],
    enabled: mounted && allowed,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      let data: unknown = await response.json();
      if (source.pick) data = getPath(data, source.pick);
      if (source.entries && data && typeof data === "object" && !Array.isArray(data)) {
        data = Object.entries(data as Record<string, unknown>).map(([key, value]) => ({ key, value }));
      }
      return data;
    },
  });

  useEffect(() => {
    if (!allowed) {
      onResult(source.id, {
        status: "error",
        error: "Only Frankfurter and Open-Meteo can be called from a page.",
      });
      return;
    }
    if (!mounted || query.isPending) {
      onResult(source.id, { status: "loading", error: "" });
      return;
    }
    if (query.isError) {
      onResult(source.id, {
        status: "error",
        error: query.error instanceof Error ? query.error.message : "Request failed",
      });
      return;
    }
    onResult(source.id, { status: "ready", data: query.data, error: "" });
  }, [allowed, mounted, onResult, query.data, query.error, query.isError, query.isPending, source.id]);

  return null;
}

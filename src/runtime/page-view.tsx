import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Component, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";

import { perform } from "@/runtime/actions";
import { useCatalog } from "@/runtime/catalog";
import { RenderNode } from "@/runtime/renderer";
import { Sources } from "@/runtime/sources";
import { usePageStore } from "@/runtime/store";
import type { PageConfig, RenderCtx } from "@/runtime/types";

export function PageView({ pageId }: { pageId: string }) {
  const catalog = useCatalog();
  const page = catalog.get(pageId);
  if (!page) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-12">
        <h1 className="font-display text-4xl text-ink">No page named {pageId}</h1>
        <p className="mt-3 max-w-md text-muted">
          The manifest doesn’t declare that id. Open the studio to add one, or go back to the desk.
        </p>
      </div>
    );
  }
  return (
    <PageBoundary pageId={page.id} resetKey={catalog.epoch}>
      <PageRuntime page={page} />
    </PageBoundary>
  );
}

export function PageRuntime({ page }: { page: PageConfig }) {
  const stored = usePageStore((state) => state.byId[page.id]);
  const state = stored ?? page.state ?? {};
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sourcesRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    usePageStore.getState().ensure(page.id, page.state ?? {});
  }, [page.id, page.state]);

  const run: RenderCtx["run"] = (actions, extra) => {
    perform(
      actions,
      {
        state: usePageStore.getState().byId[page.id] ?? state,
        sources: sourcesRef.current,
        item: extra?.item,
        index: 0,
        event: extra?.event,
        now: String(Date.now()),
      },
      page.id,
      {
        defaults: page.state ?? {},
        toast: (message) => {
          if (message) toast(message);
        },
        invalidate: (source) => {
          void queryClient.invalidateQueries({ queryKey: ["manifest-src", page.id, source] });
        },
        navigate: (to) => {
          if (to === "studio") {
            void navigate({ to: "/studio", search: { page: page.id } });
            return;
          }
          void navigate({ to: "/$pageId", params: { pageId: to } });
        },
      },
    );
  };

  return (
    <div data-page={page.id} className="min-w-0">
      <Sources page={page} state={state}>
        {(bag) => {
          sourcesRef.current = bag.sources;
          const ctx: RenderCtx = {
            pageId: page.id,
            state,
            sources: bag.sources,
            sourceStatus: bag.sourceStatus,
            sourceError: bag.sourceError,
            run,
          };
          return <RenderNode node={page.root} ctx={ctx} />;
        }}
      </Sources>
    </div>
  );
}

class PageBoundary extends Component<
  { children: ReactNode; pageId: string; resetKey: number },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { pageId: string; resetKey: number }) {
    if (
      this.state.error &&
      (prev.pageId !== this.props.pageId || prev.resetKey !== this.props.resetKey)
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-2xl border border-line bg-surface p-6">
        <h1 className="font-display text-3xl text-ink">This page hit a snag</h1>
        <p className="mt-2 max-w-xl text-sm break-words text-muted">{this.state.error.message}</p>
      </div>
    );
  }
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { focusRing, cn } from "@/lib/utils";
import { app, useCatalog } from "@/runtime/catalog";
import { ACTION_SHELF, COMPONENT_SHELF } from "@/runtime/glossary";
import { PageRuntime } from "@/runtime/page-view";
import { parsePage } from "@/runtime/schema";
import { usePageStore } from "@/runtime/store";

export const Route = createFileRoute("/studio")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "string" && search.page ? search.page : app.defaultPage,
  }),
  component: StudioRoute,
});

function StudioRoute() {
  const { page: requested } = Route.useSearch();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const selectedId = catalog.get(requested) ? requested : app.defaultPage;
  const page = catalog.get(selectedId);
  const [text, setText] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const writing = useRef(false);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  useEffect(() => {
    if (!catalog.ready) return;
    const current = catalogRef.current.get(selectedId);
    if (!current) return;
    writing.current = false;
    setText(JSON.stringify(current, null, 2));
    setIssues([]);
  }, [catalog.ready, catalog.epoch, selectedId]);

  useEffect(() => {
    if (!writing.current || !text) return;
    const handle = window.setTimeout(() => {
      const cat = catalogRef.current;
      const parsed = parsePage(text);
      if (!parsed.ok) {
        setIssues(parsed.issues);
        return;
      }
      if (parsed.page.id !== selectedId) {
        setIssues([`Keep "id" as "${selectedId}". Duplicate the page to use another id.`]);
        return;
      }
      setIssues([]);
      const current = cat.get(selectedId);
      if (current && JSON.stringify(current) === JSON.stringify(parsed.page)) return;
      cat.save(parsed.page);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [selectedId, text]);

  if (!page) return null;

  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 overflow-auto px-4 py-6 md:px-8 md:py-8">
        <p className="text-xs font-medium tracking-widest text-copper uppercase">Live render</p>
        <div className="mt-4">
          <PageRuntime page={page} />
        </div>
      </div>
      <aside className="flex flex-col gap-3 bg-ink p-4 text-paper lg:h-dvh lg:overflow-auto" style={{ colorScheme: "dark" }}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-2xl">Studio</p>
          <p className="text-xs text-paper/70">{catalog.isOverride(page.id) || !catalog.isBundled(page.id) ? "Edited here" : "Shipped file"}</p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-paper/70">Page</span>
          <select
            className={cn(focusRing, "min-h-11 rounded-lg border border-paper/20 bg-ink px-3 text-paper")}
            value={selectedId}
            aria-label="Page"
            onChange={(event) => {
              void navigate({ to: "/studio", search: { page: event.target.value } });
            }}
          >
            {catalog.pages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <StudioButton
            label="New"
            onClick={() => {
              const id = catalog.create();
              void navigate({ to: "/studio", search: { page: id } });
            }}
          />
          <StudioButton
            label="Duplicate"
            onClick={() => {
              const id = catalog.duplicate(selectedId);
              void navigate({ to: "/studio", search: { page: id } });
            }}
          />
          {catalog.isBundled(page.id) ? (
            <StudioButton label="Restore file" onClick={() => catalog.reset(page.id)} />
          ) : (
            <StudioButton
              label="Delete"
              onClick={() => {
                catalog.remove(page.id);
                void navigate({ to: "/studio", search: { page: app.defaultPage } });
              }}
            />
          )}
          <StudioButton
            label="Reset data"
            onClick={() => usePageStore.getState().reset(page.id, page.state ?? {})}
          />
        </div>
        <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-sm">
          <span className="text-paper/70">Manifest JSON</span>
          <textarea
            value={text}
            spellCheck={false}
            aria-label="Page manifest JSON"
            onChange={(event) => {
              writing.current = true;
              setText(event.target.value);
            }}
            className={cn(
              focusRing,
              "min-h-96 w-full flex-1 resize-y rounded-xl border bg-ink p-3 font-mono text-xs leading-relaxed text-paper",
              issues.length ? "border-copper" : "border-paper/20",
            )}
          />
        </label>
        <div aria-live="polite" className="text-sm">
          {issues.length ? (
            <ul className="flex flex-col gap-1 text-paper">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="text-paper/70">Valid. Changes render as you type and stay in this browser.</p>
          )}
        </div>
        <details className="rounded-xl border border-paper/15 px-3 py-2">
          <summary className={cn(focusRing, "min-h-11 cursor-pointer py-2 text-sm")}>Component shelf</summary>
          <ul className="flex flex-col gap-2 pb-3 text-sm text-paper/75">
            {COMPONENT_SHELF.map((item) => (
              <li key={item.type}>
                <span className="text-paper">{item.type}</span> — {item.blurb}
              </li>
            ))}
          </ul>
        </details>
        <details className="rounded-xl border border-paper/15 px-3 py-2">
          <summary className={cn(focusRing, "min-h-11 cursor-pointer py-2 text-sm")}>Actions and bindings</summary>
          <ul className="flex flex-col gap-2 pb-3 text-sm text-paper/75">
            {ACTION_SHELF.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      </aside>
    </div>
  );
}

function StudioButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(focusRing, "min-h-11 rounded-lg border border-paper/20 px-3 text-sm text-paper hover:border-paper")}
    >
      {label}
    </button>
  );
}

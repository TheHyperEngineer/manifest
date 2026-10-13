import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import appJson from "@/configs/app.json";
import briefJson from "@/configs/pages/brief.json";
import directoryJson from "@/configs/pages/directory.json";
import galleryJson from "@/configs/pages/gallery.json";
import marketsJson from "@/configs/pages/markets.json";
import pipelineJson from "@/configs/pages/pipeline.json";
import tasksJson from "@/configs/pages/tasks.json";
import { assertPage } from "@/runtime/schema";
import { usePageStore } from "@/runtime/store";
import type { AppManifest, PageConfig } from "@/runtime/types";

const OVERRIDE_KEY = "manifest.overrides.v1";
const CUSTOM_KEY = "manifest.custom.v1";

export const app = appJson as AppManifest;

const bundled: Record<string, PageConfig> = Object.fromEntries(
  [briefJson, pipelineJson, directoryJson, tasksJson, marketsJson, galleryJson].map((page) => {
    const checked = assertPage(page, String((page as { id?: string }).id ?? "page"));
    return [checked.id, checked];
  }),
);

export const bundledIds = new Set(Object.keys(bundled));

type CatalogValue = {
  ready: boolean;
  epoch: number;
  pages: PageConfig[];
  get: (id: string) => PageConfig | undefined;
  isBundled: (id: string) => boolean;
  isOverride: (id: string) => boolean;
  save: (page: PageConfig) => void;
  reset: (id: string) => void;
  create: () => string;
  duplicate: (id: string) => string;
  remove: (id: string) => void;
};

const CatalogContext = createContext<CatalogValue | null>(null);

function readStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function blankPage(id: string): PageConfig {
  return {
    id,
    title: "Untitled page",
    kicker: "Custom",
    summary: "A page that exists only as JSON. Change it here, the preview follows.",
    icon: "FileJson",
    state: { note: "" },
    sources: [],
    root: {
      type: "stack",
      gap: "md",
      children: [
        { type: "kicker", text: "Custom" },
        { type: "heading", level: 1, text: "Untitled page" },
        {
          type: "text",
          tone: "muted",
          text: "This screen is the manifest on the right. Bindings, repeats, and actions are the same ones Northwind uses.",
        },
        { type: "input", label: "Note", bind: "state.note", placeholder: "Write in the page, not in code" },
        { type: "text", text: "You wrote: {{state.note | fallback:nothing yet}}" },
        {
          type: "button",
          label: "Leave a toast",
          tone: "quiet",
          on: { click: [{ do: "toast", message: "From {{state.note | fallback:the manifest}}" }] },
        },
      ],
    },
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, PageConfig>>({});
  const [custom, setCustom] = useState<PageConfig[]>([]);
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    setOverrides(readStore(OVERRIDE_KEY, {}));
    setCustom(readStore(CUSTOM_KEY, []));
    setReady(true);
    setEpoch(1);
    usePageStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
  }, [overrides, custom, ready]);

  const value = useMemo<CatalogValue>(() => {
    const pages: PageConfig[] = [];
    const seen = new Set<string>();
    for (const id of app.pages) {
      const base = bundled[id];
      if (!base) continue;
      pages.push(overrides[id] ?? base);
      seen.add(id);
    }
    for (const page of custom) {
      if (seen.has(page.id)) continue;
      pages.push(overrides[page.id] ?? page);
      seen.add(page.id);
    }
    const get = (id: string) => pages.find((page) => page.id === id);
    return {
      ready,
      epoch,
      pages,
      get,
      isBundled: (id) => bundledIds.has(id),
      isOverride: (id) => Boolean(overrides[id]),
      save: (page) => {
        if (bundledIds.has(page.id)) {
          setOverrides((current) => ({ ...current, [page.id]: page }));
          return;
        }
        setCustom((current) => {
          const exists = current.some((item) => item.id === page.id);
          return exists ? current.map((item) => (item.id === page.id ? page : item)) : [...current, page];
        });
      },
      reset: (id) => {
        setOverrides((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        setEpoch((n) => n + 1);
      },
      create: () => {
        let id = `page-${Math.random().toString(36).slice(2, 6)}`;
        const taken = new Set([...bundledIds, ...custom.map((page) => page.id)]);
        while (taken.has(id)) id = `page-${Math.random().toString(36).slice(2, 6)}`;
        const page = assertPage(blankPage(id), id);
        setCustom((current) => [...current, page]);
        setEpoch((n) => n + 1);
        return id;
      },
      duplicate: (id) => {
        const source = get(id);
        if (!source) return id;
        let nextId = `${id}-copy`;
        const taken = new Set(pages.map((page) => page.id));
        let n = 2;
        while (taken.has(nextId)) {
          nextId = `${id}-copy-${n}`;
          n += 1;
        }
        const copy = assertPage(
          {
            ...structuredClone(source),
            id: nextId,
            title: `${source.title} copy`.slice(0, 80),
          },
          nextId,
        );
        setCustom((current) => [...current, copy]);
        setEpoch((n) => n + 1);
        return nextId;
      },
      remove: (id) => {
        if (bundledIds.has(id)) return;
        setCustom((current) => current.filter((page) => page.id !== id));
        setOverrides((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        setEpoch((n) => n + 1);
      },
    };
  }, [custom, epoch, overrides, ready]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("Catalog is missing");
  return value;
}

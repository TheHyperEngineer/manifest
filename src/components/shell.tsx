import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { focusRing, cn } from "@/lib/utils";
import { app, useCatalog } from "@/runtime/catalog";
import { AppIcon } from "@/runtime/icons";

export function Shell({ children }: { children: ReactNode }) {
  const catalog = useCatalog();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search }) as { page?: string };
  const segment = pathname.split("/").filter(Boolean)[0] ?? "";
  const active = segment || app.defaultPage;
  const studioPage = typeof search.page === "string" ? search.page : app.defaultPage;
  const bare = active === "studio";

  return (
    <div className="min-h-dvh bg-paper text-ink md:flex">
      <a
        href="#content"
        className={cn(
          focusRing,
          "sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-paper",
        )}
      >
        Skip to content
      </a>
      <aside className="sticky top-0 z-20 bg-ink text-paper md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:px-4 md:py-6">
        <div className="flex items-center justify-between px-4 pt-4 md:px-2 md:pt-0">
          <div>
            <p className="font-display text-3xl leading-none">{app.product}</p>
            <p className="mt-1 text-sm text-paper/70">{app.name}</p>
          </div>
          <Link
            to="/studio"
            search={{ page: active === "studio" ? studioPage : active }}
            className={cn(
              focusRing,
              "inline-flex min-h-11 items-center text-sm text-paper/80 md:hidden",
            )}
          >
            Studio
          </Link>
        </div>
        <nav
          aria-label="Pages"
          className="mt-4 flex gap-2 overflow-x-auto px-4 pb-4 md:mt-8 md:flex-col md:gap-1 md:overflow-visible md:px-0 md:pb-0"
        >
          <Link
            to="/studio"
            search={{ page: active === "studio" ? studioPage : active }}
            aria-current={active === "studio" ? "page" : undefined}
            className={cn(
              focusRing,
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm md:w-full",
              active === "studio"
                ? "bg-paper/10 text-paper"
                : "text-paper/70 hover:bg-paper/5 hover:text-paper",
            )}
          >
            <AppIcon
              name="FileCode2"
              size={16}
              className={active === "studio" ? "text-paper" : "text-paper/70"}
            />
            <span className="truncate">Studio</span>
          </Link>
          {catalog.pages.map((page) => {
            const on = active === page.id;
            return (
              <Link
                key={page.id}
                to="/$pageId"
                params={{ pageId: page.id }}
                aria-current={on ? "page" : undefined}
                className={cn(
                  focusRing,
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm md:w-full",
                  on ? "bg-paper/10 text-paper" : "text-paper/70 hover:bg-paper/5 hover:text-paper",
                )}
              >
                <AppIcon
                  name={page.icon}
                  size={16}
                  className={on ? "text-paper" : "text-paper/70"}
                />
                <span className="truncate">{page.title}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden px-2 pt-6 md:block">
          <p className="text-sm leading-relaxed text-paper/70">{app.summary}</p>
          {bare ? (
            <Link
              to="/$pageId"
              params={{ pageId: studioPage }}
              className={cn(focusRing, "mt-4 inline-flex min-h-11 items-center text-sm text-paper")}
            >
              Back to page
            </Link>
          ) : (
            <Link
              to="/studio"
              search={{ page: active }}
              className={cn(focusRing, "mt-4 inline-flex min-h-11 items-center text-sm text-paper")}
            >
              Edit manifest
            </Link>
          )}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <main
          id="content"
          className={bare ? "min-w-0" : "mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10"}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

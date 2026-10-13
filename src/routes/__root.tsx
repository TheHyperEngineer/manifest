import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";

import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { AuthProvider } from "@/lib/auth/provider";

import appCss from "../styles.css?url";

const APP_NAME = "Manifest";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Manifest renders a full desk from JSON page files — layout, state, events, and live data — using one shelf of components.",
      },
      { name: "theme-color", content: "#1c1915" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Outfit:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: Root,
});

function Root() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <Providers>
            <Shell>
              <Outlet />
            </Shell>
          </Providers>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { CatalogProvider } from "@/runtime/catalog";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <CatalogProvider>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: "var(--color-ink)",
              color: "var(--color-paper)",
              border: "1px solid var(--color-copper)",
            },
          }}
        />
      </CatalogProvider>
    </QueryClientProvider>
  );
}

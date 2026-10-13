import { createFileRoute } from "@tanstack/react-router";

import { app } from "@/runtime/catalog";
import { PageView } from "@/runtime/page-view";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <PageView pageId={app.defaultPage} />;
}

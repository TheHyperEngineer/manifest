import { createFileRoute } from "@tanstack/react-router";

import { PageView } from "@/runtime/page-view";

export const Route = createFileRoute("/$pageId")({
  component: PageRoute,
});

function PageRoute() {
  const { pageId } = Route.useParams();
  return <PageView pageId={pageId} />;
}

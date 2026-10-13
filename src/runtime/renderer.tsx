import { isShown } from "@/runtime/path";
import { scopeOf } from "@/runtime/scope";
import type { RenderCtx } from "@/runtime/types";
import { Unknown, WIDGETS, type WidgetProps } from "@/runtime/widgets";

export function RenderNode({ node, ctx }: { node: WidgetProps["node"]; ctx: RenderCtx }) {
  if (!node || !isShown(node.show, scopeOf(ctx))) return null;
  const Widget = WIDGETS[node.type] ?? Unknown;
  return <Widget node={node} ctx={ctx} render={RenderNode} />;
}

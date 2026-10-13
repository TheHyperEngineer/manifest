import type { RenderCtx, Scope } from "@/runtime/types";

export function scopeOf(ctx: RenderCtx): Scope {
  return {
    state: ctx.state,
    sources: ctx.sources,
    item: ctx.item,
    index: ctx.index ?? 0,
    event: undefined,
    now: "",
  };
}

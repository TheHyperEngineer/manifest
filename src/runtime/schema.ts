import { z } from "zod";

import { templateUrlAllowed } from "@/runtime/allowlist";
import type { PageConfig } from "@/runtime/types";

const sourceSchema = z
  .object({
    id: z.string().min(1).max(40),
    kind: z.enum(["static", "http", "derive"]),
    data: z.unknown().optional(),
    url: z.string().optional(),
    pick: z.string().optional(),
    entries: z.boolean().optional(),
    from: z.string().optional(),
    fromState: z.string().optional(),
    first: z.boolean().optional(),
    count: z.boolean().optional(),
    sum: z.string().optional(),
  })
  .loose()
  .superRefine((val, ctx) => {
    if (val.kind === "static" && val.data === undefined) {
      ctx.addIssue({ code: "custom", message: "Static source needs data", path: ["data"] });
    }
    if (val.kind === "http") {
      if (!val.url) {
        ctx.addIssue({ code: "custom", message: "HTTP source needs a url", path: ["url"] });
      } else if (!templateUrlAllowed(val.url)) {
        ctx.addIssue({
          code: "custom",
          message: "URL must be https on api.frankfurter.dev or api.open-meteo.com",
          path: ["url"],
        });
      }
    }
    if (val.kind === "derive" && !val.from && !val.fromState) {
      ctx.addIssue({
        code: "custom",
        message: "Derive source needs from or fromState",
        path: ["from"],
      });
    }
  });

export const pageSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/, "Use a lowercase id"),
  title: z.string().min(1).max(80),
  kicker: z.string().max(80).optional(),
  summary: z.string().max(400).optional(),
  icon: z.string().max(40).optional(),
  state: z.record(z.string(), z.unknown()).optional(),
  sources: z.array(sourceSchema).max(24).optional(),
  root: z.object({ type: z.string().min(1) }).loose(),
});

export function parsePage(
  text: string,
): { ok: true; page: PageConfig } | { ok: false; issues: string[] } {
  if (text.length > 200_000) {
    return { ok: false, issues: ["Manifest is too large."] };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, issues: [`JSON: ${(error as Error).message}`] };
  }
  const result = pageSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.slice(0, 8).map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    };
  }
  return { ok: true, page: result.data as PageConfig };
}

export function assertPage(data: unknown, id: string): PageConfig {
  const result = pageSchema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 6)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid page ${id}. ${detail}`);
  }
  return result.data as PageConfig;
}

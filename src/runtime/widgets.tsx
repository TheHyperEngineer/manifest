import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { focusRing, cn } from "@/lib/utils";
import { AppIcon } from "@/runtime/icons";
import { displayValue, getPath, isShown, readPath, resolveValue } from "@/runtime/path";
import { scopeOf } from "@/runtime/scope";
import type { Node, RenderCtx } from "@/runtime/types";

export type WidgetProps = {
  node: Node;
  ctx: RenderCtx;
  render: (props: { node: Node; ctx: RenderCtx }) => ReactNode;
};

const fieldClass =
  "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:border-copper";

function str(node: Node, key: string, ctx: RenderCtx, fallback = ""): string {
  const value = resolveValue(node[key], scopeOf(ctx));
  if (value == null || value === "") return fallback;
  return String(value);
}

function gapClass(gap: unknown): string {
  if (gap === "xs") return "gap-2";
  if (gap === "sm") return "gap-3";
  if (gap === "lg") return "gap-6";
  if (gap === "xl") return "gap-8";
  return "gap-4";
}

function colClass(cols: number): string {
  if (cols >= 4) return "sm:grid-cols-2 lg:grid-cols-4";
  if (cols === 3) return "lg:grid-cols-3";
  if (cols === 2) return "sm:grid-cols-2";
  return "";
}

function spanClass(span: unknown): string {
  const n = Number(span);
  if (n === 3) return "lg:col-span-3";
  if (n === 2) return "lg:col-span-2";
  return "";
}

function alignClass(align: unknown): string {
  if (align === "center") return "items-center";
  if (align === "end") return "items-end";
  return "items-stretch";
}

function justifyClass(justify: unknown): string {
  if (justify === "center") return "justify-center";
  if (justify === "end") return "justify-end";
  if (justify === "between") return "justify-between";
  return "justify-start";
}

function Kids({ node, ctx, render }: WidgetProps) {
  return (
    <>
      {node.children?.map((child, index) => (
        <Fragment key={typeof child.id === "string" ? child.id : index}>
          {render({ node: child, ctx })}
        </Fragment>
      ))}
    </>
  );
}

function optionsOf(node: Node, ctx: RenderCtx): { label: string; value: string }[] {
  const raw = resolveValue(node.options, scopeOf(ctx));
  if (!Array.isArray(raw)) return [];
  return raw.map((option) => {
    if (option && typeof option === "object") {
      const row = option as Record<string, unknown>;
      const value = row.value ?? row.label ?? "";
      return { label: String(row.label ?? value), value: String(value) };
    }
    return { label: String(option), value: String(option) };
  });
}

function readControl(node: Node, ctx: RenderCtx): unknown {
  const scope = scopeOf(ctx);
  if (typeof node.bind === "string") return getPath(scope, node.bind);
  return resolveValue(node.value, scope);
}

function commit(node: Node, ctx: RenderCtx, value: unknown) {
  const actions: unknown[] = [];
  if (typeof node.bind === "string") actions.push({ do: "set", path: node.bind, value });
  if (Array.isArray(node.onChange)) actions.push(...node.onChange);
  else if (node.onChange && typeof node.onChange === "object") actions.push(node.onChange);
  ctx.run(actions, { item: ctx.item, event: value });
}

function clickActions(node: Node): unknown {
  const on = node.on;
  if (!on || typeof on !== "object") return undefined;
  return (on as { click?: unknown }).click;
}

function selected(node: Node, ctx: RenderCtx): boolean {
  if (node.selected == null) return false;
  return isShown(node.selected, scopeOf(ctx));
}

function sourceStatus(node: Node, ctx: RenderCtx) {
  if (typeof node.source !== "string") return undefined;
  return ctx.sourceStatus[node.source];
}

export function Stack(props: WidgetProps) {
  return (
    <div className={cn("flex min-w-0 flex-col", gapClass(props.node.gap))}>
      <Kids {...props} />
    </div>
  );
}

export function Row(props: WidgetProps) {
  const wrap = props.node.wrap !== false;
  return (
    <div
      className={cn(
        "flex min-w-0",
        wrap && "flex-wrap",
        gapClass(props.node.gap),
        alignClass(props.node.align),
        justifyClass(props.node.justify),
      )}
    >
      {props.node.children?.map((child, index) => (
        <div
          key={typeof child.id === "string" ? child.id : index}
          className={cn("min-w-0", child.grow ? "flex-1" : wrap ? "" : "shrink-0")}
        >
          {props.render({ node: child, ctx: props.ctx })}
        </div>
      ))}
    </div>
  );
}

export function Grid(props: WidgetProps) {
  const cols = Number(props.node.cols ?? 1);
  return (
    <div className={cn("grid grid-cols-1", gapClass(props.node.gap), colClass(cols))}>
      {props.node.children?.map((child, index) => (
        <div key={typeof child.id === "string" ? child.id : index} className={cn("min-w-0", spanClass(child.span))}>
          {props.render({ node: child, ctx: props.ctx })}
        </div>
      ))}
    </div>
  );
}

export function Repeat({ node, ctx, render }: WidgetProps) {
  const scope = scopeOf(ctx);
  const each = typeof node.each === "string" ? readPath(node.each, scope) : [];
  const rows = Array.isArray(each) ? each.slice(0, 200) : [];
  if (rows.length === 0) {
    return node.empty ? <>{render({ node: node.empty, ctx })}</> : null;
  }
  const layout = node.layout === "grid" ? "grid" : "stack";
  const cols = Number(node.cols ?? 2);
  return (
    <div
      className={cn(
        layout === "grid" ? cn("grid grid-cols-1", colClass(cols)) : "flex flex-col",
        gapClass(node.gap),
      )}
    >
      {rows.map((item, index) => {
        const row = item as { id?: unknown };
        const key = row && typeof row === "object" && row.id != null ? String(row.id) : index;
        if (!node.template) return null;
        return (
          <Fragment key={key}>
            {render({ node: node.template, ctx: { ...ctx, item, index } })}
          </Fragment>
        );
      })}
    </div>
  );
}

export function Card(props: WidgetProps) {
  const { node, ctx } = props;
  const title = str(node, "title", ctx);
  const click = clickActions(node);
  const status = sourceStatus(node, ctx);
  const isSelected = selected(node, ctx);
  return (
    <section
      className={cn(
        "flex h-full min-w-0 flex-col rounded-2xl border bg-surface p-4 md:p-5",
        isSelected ? "border-copper ring-2 ring-copper" : "border-line",
        click ? "cursor-pointer" : undefined,
        click ? focusRing : undefined,
      )}
      onClick={
        click
          ? (event) => {
              const target = event.target as HTMLElement | null;
              if (target?.closest("button, a, input, select, textarea")) return;
              ctx.run(click, { item: ctx.item });
            }
          : undefined
      }
      onKeyDown={
        click
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                ctx.run(click, { item: ctx.item });
              }
            }
          : undefined
      }
      role={click ? "button" : undefined}
      tabIndex={click ? 0 : undefined}
    >
      {status === "loading" ? (
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full w-1/3 animate-pulse bg-copper" />
        </div>
      ) : null}
      {title ? <h2 className="font-display text-2xl text-ink">{title}</h2> : null}
      {status === "error" && typeof node.source === "string" ? (
        <p role="alert" className="mt-2 text-sm text-copper">
          {ctx.sourceError[node.source] || "This source didn’t load."}
        </p>
      ) : null}
      <div className={cn("flex min-w-0 flex-col", gapClass(node.gap ?? "sm"), title && "mt-3")}>
        <Kids {...props} />
      </div>
    </section>
  );
}

export function Heading({ node, ctx }: WidgetProps) {
  const level = Math.min(3, Math.max(1, Number(node.level ?? 2)));
  const text = str(node, "text", ctx);
  const className =
    level === 1
      ? "font-display text-4xl font-medium tracking-tight text-ink md:text-5xl"
      : level === 2
        ? "font-display text-3xl font-medium tracking-tight text-ink"
        : "font-display text-xl text-ink";
  if (level === 1) return <h1 className={className}>{text}</h1>;
  if (level === 3) return <h3 className={className}>{text}</h3>;
  return <h2 className={className}>{text}</h2>;
}

export function Text({ node, ctx }: WidgetProps) {
  const tone = node.tone === "muted" ? "text-muted" : "text-ink";
  const size = node.size === "lg" ? "text-lg" : node.size === "sm" ? "text-sm" : "text-base";
  return <p className={cn(tone, size, "leading-relaxed")}>{str(node, "text", ctx)}</p>;
}

export function Kicker({ node, ctx }: WidgetProps) {
  return (
    <p className="text-xs font-medium tracking-widest text-copper uppercase">{str(node, "text", ctx)}</p>
  );
}

function badgeClass(tone: string): string {
  if (tone === "accent") return "bg-copper/10 text-copper";
  if (tone === "ink") return "bg-ink text-paper";
  return "bg-ink/5 text-ink";
}

function resolveTone(node: Node, ctx: RenderCtx, text: string): string {
  const map = node.toneMap;
  if (map && typeof map === "object" && text in (map as Record<string, unknown>)) {
    return String((map as Record<string, unknown>)[text] ?? "neutral");
  }
  const tone = str(node, "tone", ctx, "neutral");
  if (tone === "accent" || tone === "ink" || tone === "neutral") return tone;
  return "neutral";
}

export function Badge({ node, ctx }: WidgetProps) {
  const text = str(node, "text", ctx);
  return (
    <span className={cn("inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-medium", badgeClass(resolveTone(node, ctx, text)))}>
      {text}
    </span>
  );
}

export function Stat({ node, ctx }: WidgetProps) {
  const value = resolveValue(node.value, scopeOf(ctx));
  const pending =
    sourceStatus(node, ctx) === "loading" && (value == null || value === "" || value === "—");
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface px-4 py-4">
      <p className="text-sm text-muted">{str(node, "label", ctx)}</p>
      {pending ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded-md bg-line" aria-busy="true" />
      ) : (
        <p className="mt-2 font-display text-3xl font-medium tabular-nums text-ink">{displayValue(value)}</p>
      )}
      {node.hint != null ? <p className="mt-1 text-sm text-muted">{str(node, "hint", ctx)}</p> : null}
    </div>
  );
}

export function Divider() {
  return <hr className="border-line" />;
}

export function Empty({ node, ctx }: WidgetProps) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
      <p className="font-display text-2xl text-ink">{str(node, "title", ctx, "Nothing here")}</p>
      <p className="mt-2 text-sm text-muted">{str(node, "body", ctx)}</p>
    </div>
  );
}

export function Callout({ node, ctx }: WidgetProps) {
  return (
    <aside className="rounded-2xl border border-line bg-surface px-4 py-4">
      <p className="font-medium text-ink">{str(node, "title", ctx)}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{str(node, "body", ctx)}</p>
    </aside>
  );
}

export function Icon({ node }: WidgetProps) {
  const size = node.size === "lg" ? 28 : node.size === "sm" ? 16 : 20;
  return <AppIcon name={typeof node.name === "string" ? node.name : undefined} size={size} className="text-copper" />;
}

export function Avatar({ node, ctx }: WidgetProps) {
  const name = str(node, "name", ctx);
  const role = str(node, "role", ctx);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-sm text-paper" aria-hidden>
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{name}</span>
        {role ? <span className="block truncate text-sm text-muted">{role}</span> : null}
      </span>
    </div>
  );
}

export function Progress({ node, ctx }: WidgetProps) {
  const raw = Number(resolveValue(node.value, scopeOf(ctx)));
  const value = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
  const label = str(node, "label", ctx);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink">{label}</span>
        <span className="tabular-nums text-muted">{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label || "Progress"}>
        <div className="h-full rounded-full bg-copper" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function KeyValue({ node, ctx }: WidgetProps) {
  const items = resolveValue(node.items, scopeOf(ctx));
  const rows = Array.isArray(items) ? items : [];
  return (
    <dl className="flex flex-col">
      {rows.map((item, index) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return (
          <div key={index} className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 first:border-t-0">
            <dt className="text-sm text-muted">{String(row.label ?? "")}</dt>
            <dd className="text-right text-sm font-medium text-ink">{displayValue(row.value)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function Timeline({ node, ctx }: WidgetProps) {
  const items = resolveValue(node.items, scopeOf(ctx));
  const rows = Array.isArray(items) ? items : [];
  return (
    <ol className="flex flex-col">
      {rows.map((item, index) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return (
          <li key={index} className="relative flex gap-4 pb-5 last:pb-0">
            <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-copper" aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium text-ink">{String(row.title ?? "")}</span>
              {row.meta ? <span className="mt-0.5 block text-xs tracking-wide text-copper uppercase">{String(row.meta)}</span> : null}
              {row.body ? <span className="mt-1 block text-sm leading-relaxed text-muted">{String(row.body)}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Button({ node, ctx }: WidgetProps) {
  const scope = scopeOf(ctx);
  const label = str(node, "label", ctx, "Button");
  const hide = node.hideLabel === true;
  const tone = str(node, "tone", ctx, "primary");
  const icon = typeof node.icon === "string" ? node.icon : undefined;
  const disabled = node.disabled != null && isShown(node.disabled, scope);
  const quiet = tone === "quiet";
  const ghost = tone === "ghost";
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={hide ? label : undefined}
      onClick={() => ctx.run(clickActions(node), { item: ctx.item })}
      className={cn(
        focusRing,
        "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        hide ? "size-11" : "min-h-11 px-3 py-2",
        quiet && "border border-line bg-surface text-ink hover:border-ink",
        ghost && "bg-transparent text-ink hover:bg-ink/5",
        !quiet && !ghost && "bg-copper text-paper hover:bg-ink",
      )}
    >
      {icon ? <AppIcon name={icon} size={16} className={!quiet && !ghost ? "text-paper" : "text-current"} /> : null}
      {hide ? <span className="sr-only">{label}</span> : label}
    </button>
  );
}

function Field({ label, children }: { label?: string; children: ReactNode }) {
  if (!label) return <>{children}</>;
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export function Input({ node, ctx }: WidgetProps) {
  const value = readControl(node, ctx);
  return (
    <Field label={str(node, "label", ctx)}>
      <input
        className={fieldClass}
        value={value == null ? "" : String(value)}
        placeholder={str(node, "placeholder", ctx)}
        aria-label={str(node, "label", ctx) || str(node, "placeholder", ctx) || "Input"}
        onChange={(event) => commit(node, ctx, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && node.onEnter) {
            event.preventDefault();
            ctx.run(node.onEnter, { item: ctx.item, event: value });
          }
        }}
      />
    </Field>
  );
}

export function Textarea({ node, ctx }: WidgetProps) {
  const value = readControl(node, ctx);
  return (
    <Field label={str(node, "label", ctx)}>
      <textarea
        className={cn(fieldClass, "min-h-28 py-3")}
        rows={Number(node.rows ?? 4)}
        value={value == null ? "" : String(value)}
        placeholder={str(node, "placeholder", ctx)}
        onChange={(event) => commit(node, ctx, event.target.value)}
      />
    </Field>
  );
}

export function Select({ node, ctx }: WidgetProps) {
  const options = optionsOf(node, ctx);
  const value = String(readControl(node, ctx) ?? "");
  const label = str(node, "label", ctx);
  return (
    <Field label={label}>
      <select
        className={fieldClass}
        value={value}
        aria-label={label || "Choose"}
        onChange={(event) => commit(node, ctx, event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Segmented({ node, ctx }: WidgetProps) {
  const options = optionsOf(node, ctx);
  const current = String(readControl(node, ctx) ?? "");
  const label = str(node, "label", ctx, "Choices");
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
      {options.map((option) => {
        const on = option.value === current;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => commit(node, ctx, option.value)}
            className={cn(
              focusRing,
              "min-h-11 rounded-lg px-3 text-sm",
              on ? "bg-ink text-paper" : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ node, ctx }: WidgetProps) {
  const on = Boolean(readControl(node, ctx));
  const label = str(node, "label", ctx, "Toggle");
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => commit(node, ctx, !on)}
      className={cn(focusRing, "inline-flex min-h-11 items-center gap-3 text-left")}
    >
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full", on ? "bg-copper" : "bg-line")} aria-hidden>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-paper", on ? "left-5" : "left-0.5")} />
      </span>
      <span className="text-sm text-ink">{label}</span>
    </button>
  );
}

export function Slider({ node, ctx }: WidgetProps) {
  const raw = Number(readControl(node, ctx));
  const value = Number.isFinite(raw) ? raw : Number(node.min ?? 0);
  const label = str(node, "label", ctx, "Slider");
  return (
    <Field label={label}>
      <span className="flex items-center gap-3">
        <input
          type="range"
          className="w-full"
          style={{ accentColor: "var(--color-copper)" }}
          min={Number(node.min ?? 0)}
          max={Number(node.max ?? 100)}
          step={Number(node.step ?? 1)}
          value={value}
          aria-label={label}
          aria-valuemin={Number(node.min ?? 0)}
          aria-valuemax={Number(node.max ?? 100)}
          aria-valuenow={value}
          onChange={(event) => commit(node, ctx, Number(event.target.value))}
        />
        <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted">{value}</span>
      </span>
    </Field>
  );
}

export function Check({ node, ctx }: WidgetProps) {
  const checked = Boolean(resolveValue(node.checked, scopeOf(ctx)));
  const label = str(node, "label", ctx);
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => ctx.run(node.onChange, { item: ctx.item, event: !checked })}
      className={cn(focusRing, "inline-flex min-h-11 w-full min-w-0 items-center gap-3 text-left")}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded border",
          checked ? "border-copper bg-copper text-paper" : "border-line bg-surface",
        )}
        aria-hidden
      >
        {checked ? <AppIcon name="Check" size={14} className="text-paper" /> : null}
      </span>
      <span className={cn("text-sm", checked ? "text-muted line-through" : "text-ink")}>{label}</span>
    </button>
  );
}

export function Tabs({ node, ctx }: WidgetProps) {
  return <Segmented node={{ ...node, label: node.label ?? "Sections" }} ctx={ctx} render={() => null} />;
}

export function LinkWidget({ node, ctx }: WidgetProps) {
  const to = str(node, "to", ctx);
  const label = str(node, "label", ctx, "Open");
  const className = cn(focusRing, "inline-flex min-h-11 items-center gap-1 text-sm font-medium text-copper");
  const body = (
    <>
      {label}
      <AppIcon name="ArrowUpRight" size={16} className="text-copper" />
    </>
  );
  if (to === "studio") {
    return (
      <Link to="/studio" search={{ page: str(node, "page", ctx, ctx.pageId) }} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <Link to="/$pageId" params={{ pageId: to }} className={className}>
      {body}
    </Link>
  );
}

export function DialogWidget(props: WidgetProps) {
  const { node, ctx } = props;
  const title = str(node, "title", ctx, "Dialog");
  const trigger = str(node, "trigger", ctx, "Open");
  return (
    <Dialog.Root>
      <Dialog.Trigger className={cn(focusRing, "inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink")}>
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-2xl text-ink">{title}</Dialog.Title>
            <Dialog.Close className={cn(focusRing, "grid size-11 place-items-center rounded-lg text-ink")} aria-label="Close">
              ×
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {str(node, "body", ctx, title)}
          </Dialog.Description>
          <div className="mt-4 flex flex-col gap-3">
            <Kids {...props} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AccordionWidget({ node, ctx }: WidgetProps) {
  const items = resolveValue(node.items, scopeOf(ctx));
  const rows = Array.isArray(items) ? items : [];
  return (
    <Accordion.Root type="single" collapsible className="rounded-2xl border border-line bg-surface px-4">
      {rows.map((item, index) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return (
          <Accordion.Item key={index} value={`item-${index}`} className="border-b border-line last:border-b-0">
            <Accordion.Header>
              <Accordion.Trigger className={cn(focusRing, "group flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm font-medium text-ink")}>
                {String(row.title ?? "")}
                <ChevronDown className="size-4 shrink-0 text-muted transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="pb-3 text-sm leading-relaxed text-muted">
              {String(row.body ?? "")}
            </Accordion.Content>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );
}

export function Table({ node, ctx }: WidgetProps) {
  const scope = scopeOf(ctx);
  const raw = resolveValue(node.rows, scope);
  const rows = Array.isArray(raw) ? raw : [];
  const columns = Array.isArray(node.columns) ? (node.columns as Record<string, unknown>[]) : [];
  const caption = str(node, "caption", ctx, "Table");
  const selectedBind = typeof node.selectedBind === "string" ? node.selectedBind : "";
  const rowKey = typeof node.rowKey === "string" ? node.rowKey : "id";
  const selectedValue = selectedBind ? getPath(scope, selectedBind) : undefined;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-muted">
            {columns.map((column, index) => (
              <th key={index} scope="col" className={cn("px-3 py-3 font-medium", numeric(column) && "text-right")}>
                {String(column.label ?? column.key ?? "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => {
            const record = (item ?? {}) as Record<string, unknown>;
            const on = selectedValue != null && String(record[rowKey]) === String(selectedValue);
            return (
              <tr
                key={record[rowKey] != null ? String(record[rowKey]) : index}
                aria-selected={on}
                className={cn(
                  "border-b border-line last:border-b-0",
                  node.onRow ? "cursor-pointer" : undefined,
                  on ? "bg-copper/10" : "hover:bg-paper",
                )}
                onClick={
                  node.onRow
                    ? () => ctx.run(node.onRow, { item })
                    : undefined
                }
                onKeyDown={
                  node.onRow
                    ? (event) => {
                        if (event.key === "Enter") ctx.run(node.onRow, { item });
                      }
                    : undefined
                }
                tabIndex={node.onRow ? 0 : undefined}
              >
                {columns.map((column, columnIndex) => {
                  const key = String(column.key ?? "");
                  const cell = record[key];
                  return (
                    <td key={columnIndex} className={cn("px-3 py-3 align-middle", numeric(column) && "text-right tabular-nums")}>
                      {column.format === "badge" ? (
                        <Badge
                          node={{ type: "badge", text: cell == null ? "" : String(cell), toneMap: column.toneMap }}
                          ctx={{ ...ctx, item }}
                          render={() => null}
                        />
                      ) : column.format === "currency" ? (
                        displayValue(resolveValue(`{{item.${key} | currency}}`, { ...scope, item }))
                      ) : (
                        displayValue(cell)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">No rows</p> : null}
    </div>
  );
}

function numeric(column: Record<string, unknown>): boolean {
  return column.format === "currency" || column.format === "number";
}

export function Chart({ node, ctx }: WidgetProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const data = resolveValue(node.data, scopeOf(ctx));
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const x = str(node, "x", ctx, "label");
  const y = str(node, "y", ctx, "value");
  const variant = str(node, "variant", ctx, "area");
  const label = str(node, "label", ctx, "Chart");
  if (!ready) return <div className="h-56 w-full rounded-xl bg-paper" aria-hidden />;
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No points for this range.</p>;
  }
  const chart =
    variant === "bar" ? (
      <BarChart data={rows}>
        <XAxis dataKey={x} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis width={36} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tipStyle} />
        <Bar dataKey={y} fill="var(--color-copper)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    ) : variant === "line" ? (
      <LineChart data={rows}>
        <XAxis dataKey={x} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis width={36} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tipStyle} />
        <Line type="monotone" dataKey={y} stroke="var(--color-copper)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    ) : (
      <AreaChart data={rows}>
        <XAxis dataKey={x} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis width={36} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tipStyle} />
        <Area type="monotone" dataKey={y} stroke="var(--color-copper)" fill="var(--color-copper)" fillOpacity={0.16} strokeWidth={2} isAnimationActive={false} />
      </AreaChart>
    );
  return (
    <div className="h-56 w-full min-w-0" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {chart}
      </ResponsiveContainer>
    </div>
  );
}

const tipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-line)",
  borderRadius: 12,
  color: "var(--color-ink)",
  fontSize: 13,
};

export function Unknown({ node }: WidgetProps) {
  return (
    <p className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">
      Unknown component “{node.type}”
    </p>
  );
}

export const WIDGETS: Record<string, (props: WidgetProps) => ReactNode> = {
  stack: Stack,
  row: Row,
  grid: Grid,
  repeat: Repeat,
  card: Card,
  heading: Heading,
  text: Text,
  kicker: Kicker,
  badge: Badge,
  stat: Stat,
  divider: Divider,
  empty: Empty,
  callout: Callout,
  icon: Icon,
  avatar: Avatar,
  progress: Progress,
  keyvalue: KeyValue,
  timeline: Timeline,
  button: Button,
  input: Input,
  textarea: Textarea,
  select: Select,
  segmented: Segmented,
  switch: Switch,
  slider: Slider,
  check: Check,
  tabs: Tabs,
  link: LinkWidget,
  dialog: DialogWidget,
  accordion: AccordionWidget,
  table: Table,
  chart: Chart,
};

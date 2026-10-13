import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

import { focusRing, cn } from "@/lib/utils";
import { app, useCatalog } from "@/runtime/catalog";
import { ACTION_SHELF, COMPONENT_SHELF } from "@/runtime/glossary";
import { PageRuntime } from "@/runtime/page-view";
import { assertPage, parsePage } from "@/runtime/schema";
import { usePageStore } from "@/runtime/store";

type StudioTab = "editor" | "document";

type InvoiceMetadata = {
  vendor: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  total: string;
  currency: string;
  status: string;
  paymentTerms: string;
  extractedText: string;
  lineItems: Array<{ description: string; amount: string }>;
};

type GeneratedDocument = {
  fileName: string;
  kind: string;
  summary: string;
  preview: string;
  rows: Array<{ label: string; value: string }>;
  metadata?: InvoiceMetadata;
};

function extractInvoiceMetadata(text: string): InvoiceMetadata {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const getMatch = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const matched = normalized.match(pattern);
      if (matched?.[1]) return matched[1].trim();
    }
    return "";
  };

  const vendor =
    getMatch([
      /(?:from|vendor|supplier|bill from|billed by)[:\s]+([A-Z][A-Za-z0-9&.,' -]{2,80})/i,
      /([A-Z][A-Za-z0-9&.,' -]{3,80})\s+(?:LLC|INC|LTD|LIMITED|CO|CORP|COMPANY)/,
      /([A-Z][A-Za-z0-9&.,' -]{3,80})\s+\d{1,5}\s+[A-Za-z0-9. ]+/,
    ]) ||
    lines.find(
      (line) =>
        /[A-Z][A-Za-z0-9&.,' -]{4,}/.test(line) && !/invoice|bill|total|due|date/i.test(line),
    ) ||
    "Unspecified vendor";

  const invoiceNumber =
    getMatch([
      /(?:invoice|inv|bill)[#:\s-]*([A-Z0-9-]{3,30})/i,
      /(?:reference|ref)[#:\s-]*([A-Z0-9-]{3,30})/i,
      /(?:po|purchase order)[#:\s-]*([A-Z0-9-]{3,30})/i,
    ]) || "N/A";

  const issueDate =
    getMatch([
      /(?:issued|invoice date|date)[#:\s:]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
      /(?:issued on|date)[#:\s:]*([A-Z]{3,9}\s+\d{1,2},\s+\d{4})/i,
      /([0-9]{4}-[0-9]{2}-[0-9]{2})/,
    ]) || "N/A";

  const dueDate =
    getMatch([
      /(?:due|payment due)[#:\s:]*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
      /(?:due on|pay by)[#:\s:]*([A-Z]{3,9}\s+\d{1,2},\s+\d{4})/i,
      /([0-9]{4}-[0-9]{2}-[0-9]{2})/,
    ]) || "N/A";

  const currency =
    getMatch([/\b(USD|EUR|GBP|AUD|CAD|INR|JPY|CHF|SGD|AED)\b/i, /\$\s?([0-9,]+\.?[0-9]{0,2})/]) ||
    "USD";

  const total =
    getMatch([
      /(?:total|amount due|balance due)[^\d]{0,20}(\$?\d[0-9,]*\.?\d{0,2})/i,
      /(?:grand total|total due)[^\d]{0,20}(\$?\d[0-9,]*\.?\d{0,2})/i,
      /(\$?\d[0-9,]*\.?\d{0,2})\s*(?:USD|EUR|GBP|AUD|CAD|INR|JPY|CHF|SGD|AED)?\s*$/i,
    ]) || "0.00";

  const paymentTerms =
    getMatch([
      /(?:terms|payment terms)[#:\s:]*([A-Za-z0-9 .,-]{3,80})/i,
      /(?:net\s*\d+|upon receipt|due on receipt)/i,
    ]) || "Net 30";

  const status = /paid|payment received|settled|closed/i.test(normalized) ? "Paid" : "Open";

  const lineItems = lines
    .filter((line) => /(qty|service|item|description|product|hours|subtotal|tax)/i.test(line))
    .slice(0, 6)
    .map((line) => {
      const amountMatch = line.match(/(\$?\d[0-9,]*\.?\d{0,2})$/);
      return {
        description: line.replace(/\$?\d[0-9,]*\.?\d{0,2}$/g, "").trim() || "Line item",
        amount: amountMatch?.[1] || "$0.00",
      };
    });

  return {
    vendor: vendor.replace(/\s+/g, " ").trim(),
    invoiceNumber: invoiceNumber || "N/A",
    issueDate: issueDate || "N/A",
    dueDate: dueDate || "N/A",
    total: total || "0.00",
    currency,
    status,
    paymentTerms,
    extractedText: normalized,
    lineItems,
  };
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || "document"
  );
}

function humanizeKind(value: string) {
  if (!value) return "document";
  const normalized = value.replace(/^\./, "").toUpperCase();
  if (normalized === "PDF") return "PDF";
  if (normalized === "DOCX") return "DOCX";
  if (normalized === "DOC") return "DOC";
  if (normalized === "XLSX") return "XLSX";
  if (normalized === "XLS") return "XLS";
  if (normalized === "CSV") return "CSV";
  return normalized;
}

async function readTextDocument(file: File): Promise<GeneratedDocument> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const base = file.name.replace(/\.[^/.]+$/, "");

  if (["txt", "md", "csv"].includes(ext)) {
    const text = await file.text();
    const metadata = extractInvoiceMetadata(text);
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 420) || "No text extracted.";
    const rows = [
      { label: "File", value: file.name },
      { label: "Type", value: humanizeKind(ext) },
      { label: "Words", value: String((text.match(/\S+/g) ?? []).length) },
      { label: "Vendor", value: metadata.vendor },
      { label: "Invoice #", value: metadata.invoiceNumber },
      { label: "Total", value: `${metadata.currency} ${metadata.total}` },
      { label: "Preview", value: preview },
    ];
    return {
      fileName: file.name,
      kind: ext,
      summary:
        metadata.invoiceNumber !== "N/A"
          ? `Converted invoice ${metadata.invoiceNumber} into a digital manifest.`
          : `Converted ${humanizeKind(ext)} content into a searchable digital record.`,
      preview,
      rows,
      metadata,
    };
  }

  if (["docx", "doc"].includes(ext)) {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = (result.value ?? "").replace(/\s+/g, " ").trim();
    const metadata = extractInvoiceMetadata(text);
    const preview = text.slice(0, 420) || "No text extracted from the document.";
    return {
      fileName: file.name,
      kind: ext,
      summary:
        metadata.invoiceNumber !== "N/A"
          ? `Converted invoice ${metadata.invoiceNumber} into a structured page manifest.`
          : `Converted ${humanizeKind(ext)} content into a structured page manifest.`,
      preview,
      rows: [
        { label: "File", value: file.name },
        { label: "Type", value: humanizeKind(ext) },
        { label: "Vendor", value: metadata.vendor },
        { label: "Invoice #", value: metadata.invoiceNumber },
        { label: "Total", value: `${metadata.currency} ${metadata.total}` },
        { label: "Preview", value: preview },
      ],
      metadata,
    };
  }

  if (["xlsx", "xls"].includes(ext)) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheets = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
      }) as unknown[][];
      return { sheetName, rows: rows.slice(0, 5) };
    });
    const text = sheets
      .map(
        (sheet) =>
          `${sheet.sheetName}: ${sheet.rows.flat().filter(Boolean).slice(0, 12).join(" | ")}`,
      )
      .join("\n");
    const metadata = extractInvoiceMetadata(text);
    const preview =
      text.replace(/\s+/g, " ").trim().slice(0, 420) || "No spreadsheet content was detected.";
    return {
      fileName: file.name,
      kind: ext,
      summary: `Extracted spreadsheet rows into a digital manifest for ${base}.`,
      preview,
      rows: [
        { label: "File", value: file.name },
        { label: "Type", value: humanizeKind(ext) },
        { label: "Sheets", value: String(sheets.length) },
        { label: "Vendor", value: metadata.vendor },
        { label: "Invoice #", value: metadata.invoiceNumber },
        { label: "Total", value: `${metadata.currency} ${metadata.total}` },
        { label: "Preview", value: preview },
      ],
      metadata,
    };
  }

  if (ext === "pdf") {
    const buffer = await file.arrayBuffer();
    const fallbackPreview = `Digital placeholder created from ${file.name}. No accessible text layer was found in this PDF.`;
    let text = "";
    let pageCount = 0;

    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
      pageCount = document.numPages;
      const parts: string[] = [];
      for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
        const page = await document.getPage(pageIndex);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? String(item.str) : ""))
          .join(" ");
        if (pageText) parts.push(pageText);
      }
      text = parts.join("\n").replace(/\s+/g, " ").trim();
    } catch {
      text = "";
    }

    if (!text.trim()) {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        const page = await pdfDocument.getPage(1);
        const viewport = page.getViewport({ scale: 1.7 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas context unavailable");
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas: canvas, canvasContext: context, viewport }).promise;

        const result = await Tesseract.recognize(canvas, "eng", {
          logger: () => undefined,
        });
        text = (result.data?.text ?? "").replace(/\s+/g, " ").trim();
        pageCount = pdfDocument.numPages;
      } catch {
        text = "";
      }
    }

    const metadata = extractInvoiceMetadata(text);
    if (text.trim()) {
      const preview = text.slice(0, 420) || fallbackPreview;
      return {
        fileName: file.name,
        kind: ext,
        summary:
          metadata.invoiceNumber !== "N/A"
            ? `Converted invoice ${metadata.invoiceNumber} into a digital record.`
            : `Converted PDF content into a digital record for ${base}.`,
        preview,
        rows: [
          { label: "File", value: file.name },
          { label: "Type", value: humanizeKind(ext) },
          { label: "Pages", value: String(pageCount || 1) },
          { label: "Vendor", value: metadata.vendor },
          { label: "Invoice #", value: metadata.invoiceNumber },
          { label: "Total", value: `${metadata.currency} ${metadata.total}` },
          { label: "Preview", value: preview },
        ],
        metadata,
      };
    }

    return {
      fileName: file.name,
      kind: ext,
      summary: `Created a digital placeholder record for ${base}. The PDF does not expose a readable text layer or its content could not be parsed.`,
      preview: fallbackPreview,
      rows: [
        { label: "File", value: file.name },
        { label: "Type", value: humanizeKind(ext) },
        { label: "Status", value: "Text extraction unavailable" },
        { label: "Preview", value: fallbackPreview },
      ],
      metadata,
    };
  }

  const preview = `Uploaded a ${humanizeKind(ext || "document")} file named ${file.name}.`;
  return {
    fileName: file.name,
    kind: ext || "other",
    summary: `Prepared a digital manifest placeholder for ${base}.`,
    preview,
    rows: [
      { label: "File", value: file.name },
      { label: "Type", value: humanizeKind(ext || "document") },
      { label: "Preview", value: preview },
    ],
  };
}

function makeDocumentPage(
  fileName: string,
  generated: GeneratedDocument,
): ReturnType<typeof assertPage> {
  const safeName = fileName.replace(/\.[^/.]+$/, "") || "Digital document";
  const pageId = `doc-${slugify(safeName)}-${Math.random().toString(36).slice(2, 8)}`;
  const previewText =
    generated.preview.length > 280 ? `${generated.preview.slice(0, 280)}…` : generated.preview;
  const metadata = generated.metadata ?? extractInvoiceMetadata(generated.preview);
  const totalValue = Number(String(metadata.total).replace(/[^0-9.]/g, "")) || 0;
  const lineRows =
    metadata.lineItems.length > 0
      ? metadata.lineItems.map((item, index) => ({
          id: `line-${index + 1}`,
          description: item.description || `Line ${index + 1}`,
          quantity: 1,
          rate: Number(String(item.amount).replace(/[^0-9.]/g, "")) || totalValue || 0,
          amount: Number(String(item.amount).replace(/[^0-9.]/g, "")) || totalValue || 0,
        }))
      : [
          {
            id: "line-1",
            description: "Imported services",
            quantity: 1,
            rate: totalValue || 0,
            amount: totalValue || 0,
          },
        ];

  return assertPage(
    {
      id: pageId,
      title: `${safeName} digital version`,
      kicker: "Digital file",
      summary: generated.summary,
      icon: "FileText",
      state: {
        documentName: generated.fileName,
        documentKind: generated.kind,
        documentSummary: generated.summary,
        documentPreview: generated.preview,
        documentRows: generated.rows,
        invoice: {
          vendor: metadata.vendor,
          invoiceNumber: metadata.invoiceNumber,
          issueDate: metadata.issueDate,
          dueDate: metadata.dueDate,
          status: metadata.status,
          paymentTerms: metadata.paymentTerms,
          currency: metadata.currency,
          total: totalValue,
          notes: `Imported from ${generated.fileName}.`,
        },
        invoiceRows: lineRows,
      },
      root: {
        type: "stack",
        gap: "lg",
        children: [
          {
            type: "card",
            children: [
              {
                type: "row",
                align: "center",
                justify: "between",
                gap: "md",
                children: [
                  {
                    type: "stack",
                    gap: "sm",
                    children: [
                      { type: "kicker", text: humanizeKind(generated.kind) },
                      { type: "heading", level: 1, text: "{{state.invoice.vendor}}" },
                    ],
                  },
                  {
                    type: "avatar",
                    name: "{{state.invoice.vendor}}",
                    role: "Supplier",
                  },
                ],
              },
              { type: "text", tone: "muted", text: "{{state.documentSummary}}" },
              {
                type: "grid",
                cols: 4,
                gap: "md",
                children: [
                  {
                    type: "stat",
                    label: "Invoice",
                    value: "{{state.invoice.invoiceNumber}}",
                    hint: "Reference",
                  },
                  {
                    type: "stat",
                    label: "Issue",
                    value: "{{state.invoice.issueDate}}",
                    hint: "Issued",
                  },
                  {
                    type: "stat",
                    label: "Due",
                    value: "{{state.invoice.dueDate}}",
                    hint: "Payment due",
                  },
                  {
                    type: "stat",
                    label: "Total",
                    value: "{{state.invoice.total | currency}}",
                    hint: "{{state.invoice.currency}}",
                  },
                ],
              },
            ],
          },
          {
            type: "card",
            title: "Invoice form",
            children: [
              {
                type: "row",
                gap: "md",
                children: [
                  { type: "input", label: "Vendor", bind: "state.invoice.vendor", grow: true },
                  {
                    type: "input",
                    label: "Invoice #",
                    bind: "state.invoice.invoiceNumber",
                    grow: true,
                  },
                  {
                    type: "input",
                    label: "Status",
                    bind: "state.invoice.status",
                    grow: true,
                  },
                ],
              },
              {
                type: "row",
                gap: "md",
                children: [
                  {
                    type: "input",
                    label: "Issue date",
                    bind: "state.invoice.issueDate",
                    grow: true,
                  },
                  { type: "input", label: "Due date", bind: "state.invoice.dueDate", grow: true },
                  {
                    type: "input",
                    label: "Payment terms",
                    bind: "state.invoice.paymentTerms",
                    grow: true,
                  },
                ],
              },
              {
                type: "row",
                align: "center",
                justify: "between",
                gap: "md",
                children: [
                  { type: "heading", level: 2, text: "Line items" },
                  {
                    type: "button",
                    label: "Add row",
                    tone: "quiet",
                    on: {
                      click: [
                        {
                          do: "append",
                          path: "state.invoiceRows",
                          value: {
                            id: `line-${Date.now()}`,
                            description: "New line item",
                            quantity: 1,
                            rate: 0,
                            amount: 0,
                          },
                        },
                      ],
                    },
                  },
                ],
              },
              {
                type: "repeat",
                each: "state.invoiceRows",
                gap: "sm",
                template: {
                  type: "row",
                  gap: "md",
                  align: "center",
                  children: [
                    {
                      type: "input",
                      label: "Item",
                      value: "{{item.description}}",
                      grow: true,
                      onChange: [
                        {
                          do: "patch",
                          path: "state.invoiceRows",
                          where: { field: "id", eq: "{{item.id}}" },
                          set: { description: "{{event}}" },
                        },
                      ],
                    },
                    {
                      type: "input",
                      label: "Qty",
                      value: "{{item.quantity}}",
                      onChange: [
                        {
                          do: "patch",
                          path: "state.invoiceRows",
                          where: { field: "id", eq: "{{item.id}}" },
                          set: { quantity: "{{event}}" },
                        },
                      ],
                    },
                    {
                      type: "input",
                      label: "Rate",
                      value: "{{item.rate}}",
                      onChange: [
                        {
                          do: "patch",
                          path: "state.invoiceRows",
                          where: { field: "id", eq: "{{item.id}}" },
                          set: { rate: "{{event}}" },
                        },
                      ],
                    },
                    {
                      type: "input",
                      label: "Amount",
                      value: "{{item.amount}}",
                      onChange: [
                        {
                          do: "patch",
                          path: "state.invoiceRows",
                          where: { field: "id", eq: "{{item.id}}" },
                          set: { amount: "{{event}}" },
                        },
                      ],
                    },
                  ],
                },
              },
              {
                type: "table",
                caption: "Invoice totals",
                rows: "{{state.invoiceRows}}",
                rowKey: "id",
                columns: [
                  { key: "description", label: "Description" },
                  { key: "quantity", label: "Qty" },
                  { key: "rate", label: "Rate", format: "currency" },
                  { key: "amount", label: "Amount", format: "currency" },
                ],
              },
              {
                type: "textarea",
                label: "Notes",
                bind: "state.invoice.notes",
                rows: 4,
              },
              {
                type: "keyvalue",
                items: [
                  { label: "Subtotal", value: "{{state.invoice.total | currency}}" },
                  { label: "Tax", value: "{{state.invoice.total | currency}}" },
                  { label: "Balance due", value: "{{state.invoice.total | currency}}" },
                ],
              },
              {
                type: "text",
                tone: "muted",
                text: `Original preview: ${previewText}`,
              },
            ],
          },
        ],
      },
    },
    pageId,
  );
}

export const Route = createFileRoute("/studio")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "string" && search.page ? search.page : app.defaultPage,
  }),
  component: StudioRoute,
});

function StudioRoute() {
  const { page: requested } = Route.useSearch();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const selectedId = catalog.get(requested) ? requested : app.defaultPage;
  const page = catalog.get(selectedId);
  const [text, setText] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [sidebarTab, setSidebarTab] = useState<StudioTab>("editor");
  const [documentStatus, setDocumentStatus] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [documentDraft, setDocumentDraft] = useState<GeneratedDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const writing = useRef(false);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  const previewDocumentManifest = (generated: GeneratedDocument) => {
    const metadata = generated.metadata ?? extractInvoiceMetadata(generated.preview);
    return JSON.stringify(
      {
        fileName: generated.fileName,
        kind: generated.kind,
        summary: generated.summary,
        preview: generated.preview,
        metadata: {
          vendor: metadata.vendor,
          invoiceNumber: metadata.invoiceNumber,
          issueDate: metadata.issueDate,
          dueDate: metadata.dueDate,
          total: metadata.total,
          currency: metadata.currency,
          status: metadata.status,
          paymentTerms: metadata.paymentTerms,
          lineItems: metadata.lineItems,
        },
        rows: generated.rows,
      },
      null,
      2,
    );
  };

  useEffect(() => {
    if (!catalog.ready) return;
    const current = catalogRef.current.get(selectedId);
    if (!current) return;
    writing.current = false;
    setText(JSON.stringify(current, null, 2));
    setIssues([]);
  }, [catalog.ready, catalog.epoch, selectedId]);

  useEffect(() => {
    if (!writing.current || !text) return;
    const handle = window.setTimeout(() => {
      const cat = catalogRef.current;
      const parsed = parsePage(text);
      if (!parsed.ok) {
        setIssues(parsed.issues);
        return;
      }
      if (parsed.page.id !== selectedId) {
        setIssues([`Keep "id" as "${selectedId}". Duplicate the page to use another id.`]);
        return;
      }
      setIssues([]);
      const current = cat.get(selectedId);
      if (current && JSON.stringify(current) === JSON.stringify(parsed.page)) return;
      cat.save(parsed.page);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [selectedId, text]);

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setDocumentStatus("Processing file…");
    try {
      const generated = await readTextDocument(file);
      setDocumentDraft(generated);
      setDocumentStatus(
        `Draft ready for ${file.name}. Review the preview and save the digital version.`,
      );
    } catch (error) {
      console.error(error);
      setDocumentDraft(null);
      setDocumentStatus(`Unable to generate a digital record for ${file.name}.`);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const saveDocumentDraft = () => {
    if (!documentDraft) return;
    const page = makeDocumentPage(documentDraft.fileName, documentDraft);
    catalog.save(page);
    setDocumentStatus(`Created a digital version for ${documentDraft.fileName}.`);
    setSidebarTab("editor");
    setDocumentDraft(null);
    void navigate({ to: "/studio", search: { page: page.id } });
  };

  if (!page) return null;

  return (
    <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 overflow-auto px-4 py-6 md:px-8 md:py-8">
        <p className="text-xs font-medium tracking-widest text-copper uppercase">Live render</p>
        <div className="mt-4">
          <PageRuntime page={page} />
        </div>
      </div>
      <aside
        className="flex flex-col gap-3 bg-ink p-4 text-paper lg:h-dvh lg:overflow-auto"
        style={{ colorScheme: "dark" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
          onChange={handleDocumentUpload}
          className="hidden"
          aria-label="Upload document"
          disabled={isUploading}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-2xl">Studio</p>
          <p className="text-xs text-paper/70">
            {catalog.isOverride(page.id) || !catalog.isBundled(page.id)
              ? "Edited here"
              : "Shipped file"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg border border-paper/20 p-1">
          <button
            type="button"
            onClick={() => setSidebarTab("editor")}
            className={cn(
              focusRing,
              "min-h-11 rounded-md px-3 text-sm transition",
              sidebarTab === "editor" ? "bg-paper text-ink" : "text-paper/70 hover:bg-paper/5",
            )}
          >
            Page editor
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab("document")}
            className={cn(
              focusRing,
              "min-h-11 rounded-md px-3 text-sm transition",
              sidebarTab === "document" ? "bg-paper text-ink" : "text-paper/70 hover:bg-paper/5",
            )}
          >
            Import file
          </button>
        </div>

        {sidebarTab === "editor" ? (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-paper/70">Page</span>
              <select
                className={cn(
                  focusRing,
                  "min-h-11 rounded-lg border border-paper/20 bg-ink px-3 text-paper",
                )}
                value={selectedId}
                aria-label="Page"
                onChange={(event) => {
                  void navigate({ to: "/studio", search: { page: event.target.value } });
                }}
              >
                {catalog.pages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <StudioButton
                label="New"
                onClick={() => {
                  const id = catalog.create();
                  void navigate({ to: "/studio", search: { page: id } });
                }}
              />
              <StudioButton
                label="Duplicate"
                onClick={() => {
                  const id = catalog.duplicate(selectedId);
                  void navigate({ to: "/studio", search: { page: id } });
                }}
              />
              {catalog.isBundled(page.id) ? (
                <StudioButton label="Restore file" onClick={() => catalog.reset(page.id)} />
              ) : (
                <StudioButton
                  label="Delete"
                  onClick={() => {
                    catalog.remove(page.id);
                    void navigate({ to: "/studio", search: { page: app.defaultPage } });
                  }}
                />
              )}
              <StudioButton
                label="Reset data"
                onClick={() => usePageStore.getState().reset(page.id, page.state ?? {})}
              />
            </div>
            <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-sm">
              <span className="text-paper/70">Manifest JSON</span>
              <textarea
                value={text}
                spellCheck={false}
                aria-label="Page manifest JSON"
                onChange={(event) => {
                  writing.current = true;
                  setText(event.target.value);
                }}
                className={cn(
                  focusRing,
                  "min-h-96 w-full flex-1 resize-y rounded-xl border bg-ink p-3 font-mono text-xs leading-relaxed text-paper",
                  issues.length ? "border-copper" : "border-paper/20",
                )}
              />
            </label>
            <div aria-live="polite" className="text-sm">
              {issues.length ? (
                <ul className="flex flex-col gap-1 text-paper">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-paper/70">
                  Valid. Changes render as you type and stay in this browser.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-paper/20 bg-paper/5 p-3">
              <p className="text-xs font-medium tracking-widest text-paper/70 uppercase">
                Document intake
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                aria-label="Upload document"
                className={cn(
                  focusRing,
                  "mt-3 flex w-full cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-paper/25 bg-ink px-3 py-4 text-sm text-paper/80 hover:border-paper/40 disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <span className="sr-only">Upload document</span>
                <span>Upload a PDF, DOCX, XLSX, or text file</span>
                <span className="rounded-lg border border-paper/20 bg-paper/5 px-3 py-2 text-center text-xs font-medium text-paper">
                  {isUploading ? "Processing file…" : "Choose file"}
                </span>
              </button>
            </div>

            {documentStatus ? (
              <div className="rounded-xl border border-paper/15 bg-paper/5 p-3 text-sm text-paper/80">
                {documentStatus}
              </div>
            ) : null}

            {documentDraft ? (
              <div className="flex flex-col gap-3 rounded-xl border border-paper/15 bg-paper/5 p-3">
                <div className="grid grid-cols-2 gap-2 text-xs text-paper/80">
                  <div className="rounded-lg border border-paper/15 bg-ink/60 p-2">
                    <div className="text-paper/60">File</div>
                    <div className="mt-1 font-medium text-paper">{documentDraft.fileName}</div>
                  </div>
                  <div className="rounded-lg border border-paper/15 bg-ink/60 p-2">
                    <div className="text-paper/60">Type</div>
                    <div className="mt-1 font-medium text-paper">
                      {humanizeKind(documentDraft.kind)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-paper/15 bg-ink/60 p-2">
                    <div className="text-paper/60">Vendor</div>
                    <div className="mt-1 font-medium text-paper">
                      {documentDraft.metadata?.vendor ?? "Unknown"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-paper/15 bg-ink/60 p-2">
                    <div className="text-paper/60">Invoice</div>
                    <div className="mt-1 font-medium text-paper">
                      {documentDraft.metadata?.invoiceNumber ?? "N/A"}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-paper/15 bg-ink p-3 text-sm text-paper/80">
                  <div className="mb-2 text-xs uppercase tracking-widest text-paper/60">
                    Extracted preview
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{documentDraft.preview}</p>
                </div>

                <div className="rounded-xl border border-paper/15 bg-ink p-3 text-sm text-paper/80">
                  <div className="mb-2 text-xs uppercase tracking-widest text-paper/60">
                    Manifest JSON
                  </div>
                  <textarea
                    readOnly
                    value={previewDocumentManifest(documentDraft)}
                    className="min-h-48 w-full resize-y rounded-lg border border-paper/15 bg-ink p-2 font-mono text-[11px] leading-relaxed text-paper"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveDocumentDraft}
                    className={cn(
                      focusRing,
                      "min-h-11 flex-1 rounded-lg bg-paper px-3 text-sm font-medium text-ink",
                    )}
                  >
                    Save digital version
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocumentDraft(null)}
                    className={cn(
                      focusRing,
                      "min-h-11 rounded-lg border border-paper/20 px-3 text-sm text-paper",
                    )}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : null}

            <details className="rounded-xl border border-paper/15 px-3 py-2">
              <summary className={cn(focusRing, "min-h-11 cursor-pointer py-2 text-sm")}>
                Component shelf
              </summary>
              <ul className="flex flex-col gap-2 pb-3 text-sm text-paper/75">
                {COMPONENT_SHELF.map((item) => (
                  <li key={item.type}>
                    <span className="text-paper">{item.type}</span> — {item.blurb}
                  </li>
                ))}
              </ul>
            </details>
            <details className="rounded-xl border border-paper/15 px-3 py-2">
              <summary className={cn(focusRing, "min-h-11 cursor-pointer py-2 text-sm")}>
                Actions and bindings
              </summary>
              <ul className="flex flex-col gap-2 pb-3 text-sm text-paper/75">
                {ACTION_SHELF.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </aside>
    </div>
  );
}

function StudioButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        focusRing,
        "min-h-11 rounded-lg border border-paper/20 px-3 text-sm text-paper hover:border-paper",
      )}
    >
      {label}
    </button>
  );
}

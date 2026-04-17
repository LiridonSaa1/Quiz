import React, { useState, useMemo, useEffect, useCallback } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import { cn } from "../../lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { apiUrl, readApiError } from "../../lib/apiUrl";
import {
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  ChevronDown,
  Eye,
  Download,
  X,
  FileText,
  Building2,
  Mail,
  Phone,
  MapPin,
  Hash,
} from "lucide-react";

type InvoiceStatus = "paid" | "pending" | "overdue" | "draft";

interface InvoiceItem {
  description: string;
  qty: number;
  unit_price: number;
}

interface Invoice {
  id: string;
  payment_id?: string;
  invoice_number: string;
  student_name: string;
  student_email: string;
  student_address: string;
  student_phone: string;
  course_title: string;
  status: InvoiceStatus;
  currency: string;
  issued_date: Date;
  due_date: Date;
  paid_date?: Date;
  items: InvoiceItem[];
  notes: string;
}

interface InvoiceBrandProfile {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
}

const DEFAULT_BRAND: InvoiceBrandProfile = {
  name: "QuizMaster Academy",
  email: "billing@quizmaster.edu",
  phone: "+1 (555) 010-2030",
  address: "123 Education Blvd, Suite 400, New York, NY 10001",
  website: "www.quizmaster.edu",
  logoUrl: null,
  primaryColor: "#6366f1",
  accentColor: "#8b5cf6",
};

const normalizeWeb = (value: string) =>
  String(value || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

const safeColor = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;

const toBrandProfile = (settings: any, branding: any): InvoiceBrandProfile => {
  const g = settings?.general || {};
  const colors = branding?.colors || {};
  return {
    name: String(g.school_name || DEFAULT_BRAND.name),
    email: String(g.contact_email || DEFAULT_BRAND.email),
    phone: String(g.support_phone || DEFAULT_BRAND.phone),
    address: String(g.address || DEFAULT_BRAND.address),
    website: normalizeWeb(String(g.website || DEFAULT_BRAND.website)),
    logoUrl: typeof branding?.logoUrl === "string" && branding.logoUrl.trim() ? branding.logoUrl : null,
    primaryColor: safeColor(colors.primary, DEFAULT_BRAND.primaryColor),
    accentColor: safeColor(colors.accent, DEFAULT_BRAND.accentColor),
  };
};

function parseYmdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date(ymd);
  return new Date(y, m - 1, d);
}

function mapApiRowToInvoice(row: any): Invoice {
  const issued = String(row.issued_date || "").slice(0, 10);
  const due = String(row.due_date || "").slice(0, 10);
  const paid = row.paid_date ? String(row.paid_date).slice(0, 10) : null;
  return {
    id: String(row.id),
    payment_id: row.payment_id ? String(row.payment_id) : undefined,
    invoice_number: String(row.invoice_number || ""),
    student_name: String(row.student_name || "—"),
    student_email: String(row.student_email || ""),
    student_address: String(row.student_address || ""),
    student_phone: String(row.student_phone || ""),
    course_title: String(row.course_title || ""),
    status: row.status as InvoiceStatus,
    currency: String(row.currency || "USD"),
    issued_date: parseYmdToLocalDate(issued),
    due_date: parseYmdToLocalDate(due),
    paid_date: paid ? parseYmdToLocalDate(paid) : undefined,
    items: Array.isArray(row.items)
      ? row.items.map((it: any) => ({
          description: String(it?.description ?? ""),
          qty: Math.max(1, Number(it?.qty) || 1),
          unit_price: Number(it?.unit_price) || 0,
        }))
      : [],
    notes: String(row.notes || ""),
  };
}

const STATUS_CFG: Record<
  InvoiceStatus,
  {
    label: string;
    bg: string;
    text: string;
    dot: string;
    icon: React.ElementType;
  }
> = {
  paid: {
    label: "Paid",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
  },
  pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    icon: Clock,
  },
  overdue: {
    label: "Overdue",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-500",
    icon: AlertCircle,
  },
  draft: {
    label: "Draft",
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
    icon: FileText,
  },
};

const AVATAR_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-indigo-600",
  "from-teal-500 to-cyan-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-green-600",
];
const getAvatarColor = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const fmtCurrency = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
const invoiceTotal = (inv: Invoice) =>
  inv.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
const invoiceTax = (inv: Invoice) =>
  Math.round(invoiceTotal(inv) * 0 * 100) / 100;
const invoiceGrand = (inv: Invoice) => invoiceTotal(inv) + invoiceTax(inv);

function printInvoice(inv: Invoice, brand: InvoiceBrandProfile) {
  const subtotal = invoiceTotal(inv);
  const tax = invoiceTax(inv);
  const grand = invoiceGrand(inv);
  const sc = STATUS_CFG[inv.status];
  const cur = inv.currency || "USD";
  const money = (n: number) => fmtCurrency(n, cur);
  const esc = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const lines = (value: unknown) => esc(value).replace(/\n/g, "<br/>");
  const logoMarkup = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="Logo" style="max-width:100%;max-height:100%;object-fit:contain;" />`
    : `<svg viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${esc(inv.invoice_number)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #1e293b; font-size: 13px; }
    .page { position: relative; max-width: 760px; margin: 0 auto; padding: 36px 34px 48px; }
    .watermark {
      position: absolute;
      top: 44%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-24deg);
      font-size: 82px;
      font-weight: 900;
      letter-spacing: 8px;
      color: rgba(100, 116, 139, 0.06);
      user-select: none;
      pointer-events: none;
      z-index: 0;
    }
    .sheet {
      position: relative;
      z-index: 1;
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
      background: #fff;
    }
    .section-pad { padding: 0 26px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding: 24px 26px; background: linear-gradient(180deg, #ffffff, #f8fafc); border-bottom: 1px solid #e2e8f0; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { width: 44px; height: 44px; background: linear-gradient(135deg,${brand.primaryColor},${brand.accentColor}); border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .logo svg { width: 24px; height: 24px; fill: none; stroke: white; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .brand-name { font-size: 20px; font-weight: 800; color: #1e293b; letter-spacing: -0.3px; }
    .brand-url  { font-size: 11px; color: #94a3b8; margin-top: 1px; }
    .inv-meta { text-align: right; }
    .inv-title { font-size: 28px; font-weight: 800; color: ${brand.primaryColor}; letter-spacing: -0.5px; }
    .inv-num   { font-size: 13px; color: #64748b; margin-top: 4px; font-family: monospace; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-top: 6px; background: ${inv.status === "paid" ? "#d1fae5" : inv.status === "overdue" ? "#fee2e2" : inv.status === "pending" ? "#fef3c7" : "#f1f5f9"}; color: ${inv.status === "paid" ? "#065f46" : inv.status === "overdue" ? "#991b1b" : inv.status === "pending" ? "#92400e" : "#475569"}; }
    .divider { border: none; border-top: 1.5px solid #e2e8f0; margin: 16px 26px 20px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 16px; }
    .party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 10px; }
    .party-name  { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
    .party-detail { font-size: 12px; color: #64748b; margin-bottom: 3px; line-height: 1.6; }
    .dates { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #e2e8f0; }
    .date-block { text-align: center; }
    .date-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px; }
    .date-val   { font-size: 14px; font-weight: 700; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    th { background: ${brand.primaryColor}; color: white; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 10px 14px; text-align: left; }
    th:last-child, td:last-child { text-align: right; }
    td { padding: 12px 14px; font-size: 13px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #f8fafc; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 0; }
    .totals-box { width: 100%; }
    .summary-grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 14px; margin-bottom: 16px; }
    .summary-card { border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; padding: 12px 14px; }
    .summary-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 700; margin-bottom: 8px; }
    .summary-row { display: flex; justify-content: space-between; font-size: 12px; color: #475569; padding: 5px 0; border-bottom: 1px dashed #e2e8f0; }
    .summary-row:last-child { border-bottom: none; }
    .summary-row b { color: #0f172a; }
    .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #64748b; border-bottom: 1px dashed #e2e8f0; }
    .total-row:last-child { border-bottom: none; font-size: 16px; font-weight: 800; color: #1e293b; padding-top: 12px; }
    .total-row span:last-child { font-weight: 700; color: #334155; }
    .total-row:last-child span:last-child { color: ${brand.primaryColor}; font-size: 18px; }
    .notes-section { background: #f8fafc; border-left: 3px solid ${brand.primaryColor}; border-radius: 0 8px 8px 0; padding: 14px 18px; margin-bottom: 16px; }
    .notes-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${brand.primaryColor}; margin-bottom: 6px; }
    .course-chip { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 999px; background: #eef2ff; color: ${brand.primaryColor}; font-size: 11px; font-weight: 700; margin-bottom: 14px; }
    .notes-text  { font-size: 12px; color: #64748b; line-height: 1.6; }
    .signature-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
    .signature-box { border: 1px dashed #cbd5e1; border-radius: 12px; min-height: 106px; padding: 10px 12px; }
    .signature-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 700; }
    .signature-line { margin-top: 52px; border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 11px; color: #64748b; }
    .footer { display: flex; justify-content: space-between; align-items: center; padding: 14px 26px 20px; border-top: 1px solid #e2e8f0; }
    .footer-left  { font-size: 11px; color: #94a3b8; line-height: 1.8; }
    .footer-right { text-align: right; font-size: 11px; color: #94a3b8; }
    .thank-you { font-size: 15px; font-weight: 700; color: ${brand.primaryColor}; }
    /* Single-page print: compact layout + no extra page from margins */
    @page {
      size: A4 portrait;
      margin: 8mm;
    }
    @media print {
      html, body {
        height: auto !important;
        overflow: hidden !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        font-size: 10.5px !important;
        line-height: 1.35;
      }
      .page {
        max-width: 100% !important;
        padding: 0 !important;
        margin: 0 auto !important;
      }
      .watermark {
        font-size: 56px !important;
        top: 42% !important;
        letter-spacing: 4px !important;
      }
      .sheet {
        box-shadow: none !important;
        border-radius: 12px !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .header {
        padding: 12px 16px !important;
      }
      .logo {
        width: 36px !important;
        height: 36px !important;
        border-radius: 10px !important;
      }
      .logo svg { width: 20px !important; height: 20px !important; }
      .brand-name { font-size: 15px !important; }
      .inv-title { font-size: 20px !important; }
      .inv-num { font-size: 11px !important; margin-top: 2px !important; }
      .status-badge { margin-top: 4px !important; padding: 2px 8px !important; font-size: 10px !important; }
      .divider { margin: 8px 16px 10px !important; }
      .section-pad { padding: 0 16px !important; }
      .parties {
        gap: 14px !important;
        margin-bottom: 8px !important;
      }
      .party-label { margin-bottom: 4px !important; font-size: 9px !important; }
      .party-name { font-size: 12px !important; margin-bottom: 3px !important; }
      .party-detail { font-size: 10px !important; line-height: 1.45 !important; margin-bottom: 2px !important; }
      .course-chip {
        padding: 4px 10px !important;
        font-size: 10px !important;
        margin-bottom: 8px !important;
      }
      .dates {
        gap: 8px !important;
        padding: 10px !important;
        margin-bottom: 8px !important;
      }
      .date-label { font-size: 9px !important; margin-bottom: 3px !important; }
      .date-val { font-size: 12px !important; }
      table { margin-bottom: 8px !important; }
      th {
        padding: 5px 8px !important;
        font-size: 9px !important;
      }
      td {
        padding: 5px 8px !important;
        font-size: 10px !important;
      }
      .summary-grid {
        gap: 8px !important;
        margin-bottom: 8px !important;
      }
      .summary-card { padding: 8px 10px !important; }
      .summary-title { margin-bottom: 4px !important; font-size: 9px !important; }
      .summary-row { padding: 3px 0 !important; font-size: 10px !important; }
      .total-row {
        padding: 3px 0 !important;
        font-size: 11px !important;
      }
      .total-row:last-child {
        padding-top: 6px !important;
        font-size: 13px !important;
      }
      .total-row:last-child span:last-child { font-size: 14px !important; }
      .notes-section {
        padding: 8px 12px !important;
        margin-bottom: 8px !important;
        max-height: 56px;
        overflow: hidden;
      }
      .notes-text { font-size: 10px !important; line-height: 1.4 !important; }
      .signature-wrap {
        gap: 8px !important;
        margin-bottom: 8px !important;
      }
      .signature-box {
        min-height: 64px !important;
        padding: 6px 8px !important;
      }
      .signature-line {
        margin-top: 28px !important;
        padding-top: 4px !important;
        font-size: 9px !important;
      }
      .footer {
        padding: 8px 16px 10px !important;
      }
      .footer-left, .footer-right { font-size: 9px !important; line-height: 1.5 !important; }
      .thank-you { font-size: 12px !important; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="watermark">INVOICE</div>
  <div class="sheet">
  <div class="header">
    <div class="brand">
      <div class="logo">
        ${logoMarkup}
      </div>
      <div>
        <div class="brand-name">${esc(brand.name)}</div>
        <div class="brand-url">${esc(brand.website)}</div>
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-title">INVOICE</div>
      <div class="inv-num">${esc(inv.invoice_number)}</div>
      <div class="status-badge">${sc.label.toUpperCase()}</div>
    </div>
  </div>

  <hr class="divider"/>
  <div class="section-pad">
  <div class="parties">
    <div>
      <div class="party-label">From</div>
      <div class="party-name">${esc(brand.name)}</div>
      <div class="party-detail">${esc(brand.email)}</div>
      <div class="party-detail">${esc(brand.phone)}</div>
      <div class="party-detail">${lines(brand.address)}</div>
    </div>
    <div>
      <div class="party-label">Bill To</div>
      <div class="party-name">${esc(inv.student_name)}</div>
      <div class="party-detail">${esc(inv.student_email)}</div>
      <div class="party-detail">${esc(inv.student_phone)}</div>
      <div class="party-detail">${lines(inv.student_address)}</div>
    </div>
  </div>
  <div class="course-chip">Course: ${esc(inv.course_title || "General services")}</div>

  <div class="dates">
    <div class="date-block">
      <div class="date-label">Issue Date</div>
      <div class="date-val">${format(inv.issued_date, "MMM d, yyyy")}</div>
    </div>
    <div class="date-block">
      <div class="date-label">Due Date</div>
      <div class="date-val">${format(inv.due_date, "MMM d, yyyy")}</div>
    </div>
    <div class="date-block">
      <div class="date-label">${inv.paid_date ? "Paid On" : "Status"}</div>
      <div class="date-val">${inv.paid_date ? format(inv.paid_date, "MMM d, yyyy") : sc.label}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:60%">Description</th>
        <th style="text-align:center">Qty</th>
        <th>Unit Price</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${inv.items
        .map(
          (item) => `
      <tr>
        <td>${esc(item.description)}</td>
        <td style="text-align:center">${item.qty}</td>
        <td style="text-align:right">${money(item.unit_price)}</td>
        <td style="text-align:right">${money(item.qty * item.unit_price)}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-title">Payment Summary</div>
      <div class="summary-row"><span>Invoice Number</span><b>${esc(inv.invoice_number)}</b></div>
      <div class="summary-row"><span>Status</span><b>${esc(sc.label)}</b></div>
      <div class="summary-row"><span>Due Date</span><b>${format(inv.due_date, "MMM d, yyyy")}</b></div>
      <div class="summary-row"><span>Currency</span><b>${esc(cur)}</b></div>
    </div>
    <div class="summary-card">
      <div class="summary-title">Amount Due</div>
      <div class="totals">
        <div class="totals-box">
          <div class="total-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
          <div class="total-row"><span>Tax (0%)</span><span>${money(tax)}</span></div>
          <div class="total-row"><span>Total Due</span><span>${money(grand)}</span></div>
        </div>
      </div>
    </div>
  </div>

  ${inv.notes ? `<div class="notes-section"><div class="notes-label">Notes</div><div class="notes-text">${lines(inv.notes)}</div></div>` : ""}
  <div class="signature-wrap">
    <div class="signature-box">
      <div class="signature-label">Authorized Signature</div>
      <div class="signature-line">Name, Signature & Date</div>
    </div>
    <div class="signature-box">
      <div class="signature-label">Client Signature</div>
      <div class="signature-line">Name, Signature & Date</div>
    </div>
  </div>
  </div>

  <div class="footer">
    <div class="footer-left">
      <div>${esc(brand.name)}</div>
      <div>${lines(brand.address)}</div>
      <div>${esc(brand.email)} · ${esc(brand.phone)}</div>
    </div>
    <div class="footer-right">
      <div class="thank-you">Thank You!</div>
      <div>Questions? ${esc(brand.email)}</div>
    </div>
  </div>
  </div>
</div>
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [brand, setBrand] = useState<InvoiceBrandProfile>(DEFAULT_BRAND);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>(
    "all",
  );
  const [selected, setSelected] = useState<Invoice | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/admin/invoices"));
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load invoices");
      setInvoices((json.invoices || []).map(mapApiRowToInvoice));
    } catch (e: any) {
      toast.error(e.message || "Failed to load invoices");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, brandingRes] = await Promise.all([
          fetch(apiUrl("/api/admin/config/settings")),
          fetch(apiUrl("/api/admin/config/branding")),
        ]);
        const [settingsJson, brandingJson] = await Promise.all([
          settingsRes.json(),
          brandingRes.json(),
        ]);
        setBrand(
          toBrandProfile(
            settingsJson?.success ? settingsJson.value : null,
            brandingJson?.success ? brandingJson.value : null,
          ),
        );
      } catch {
        setBrand(DEFAULT_BRAND);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid");
    const pending = invoices.filter((i) => i.status === "pending");
    const overdue = invoices.filter((i) => i.status === "overdue");
    const sumCurrency =
      invoices.length &&
      invoices.every((i) => i.currency === invoices[0].currency)
        ? invoices[0].currency
        : "USD";
    return {
      total: invoices.length,
      totalAmt: invoices.reduce((s, i) => s + invoiceGrand(i), 0),
      paidAmt: paid.reduce((s, i) => s + invoiceGrand(i), 0),
      paidCount: paid.length,
      pendingAmt: pending.reduce((s, i) => s + invoiceGrand(i), 0),
      pendingCount: pending.length,
      overdueAmt: overdue.reduce((s, i) => s + invoiceGrand(i), 0),
      overdueCount: overdue.length,
      sumCurrency,
    };
  }, [invoices]);

  const filtered = useMemo(
    () =>
      invoices.filter((i) => {
        const q = search.toLowerCase();
        const matchSearch =
          !q ||
          i.student_name.toLowerCase().includes(q) ||
          i.invoice_number.toLowerCase().includes(q) ||
          i.course_title.toLowerCase().includes(q);
        const matchStatus = statusFilter === "all" || i.status === statusFilter;
        return matchSearch && matchStatus;
      }),
    [invoices, search, statusFilter],
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage and download student invoices
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500" />
            <div className="p-5">
              <div className="p-2.5 rounded-xl ring-4 inline-flex mb-4 bg-indigo-100 text-indigo-600 ring-indigo-100">
                <Receipt className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{stats.total}</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">Total Invoices</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {fmtCurrency(stats.totalAmt, stats.sumCurrency)} total value
              </p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
            <div className="p-5">
              <div className="p-2.5 rounded-xl ring-4 inline-flex mb-4 bg-emerald-100 text-emerald-600 ring-emerald-100">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{stats.paidCount}</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">Paid</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {fmtCurrency(stats.paidAmt, stats.sumCurrency)} collected
              </p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-amber-500 to-orange-500" />
            <div className="p-5">
              <div className="p-2.5 rounded-xl ring-4 inline-flex mb-4 bg-amber-100 text-amber-600 ring-amber-100">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{stats.pendingCount}</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">Pending</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {fmtCurrency(stats.pendingAmt, stats.sumCurrency)} outstanding
              </p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-rose-500 to-pink-500" />
            <div className="p-5">
              <div className="p-2.5 rounded-xl ring-4 inline-flex mb-4 bg-rose-100 text-rose-600 ring-rose-100">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{stats.overdueCount}</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">Overdue</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {fmtCurrency(stats.overdueAmt, stats.sumCurrency)} overdue
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by student, invoice, or course..."
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="draft">Draft</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Invoice
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Student
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">
                    Course
                  </th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">
                    Due Date
                  </th>
                  <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-12 text-slate-400 text-sm"
                    >
                      Loading invoices…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-12 text-slate-400 text-sm"
                    >
                      No invoices found. Register a payment to generate an invoice.
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => {
                    const sc = STATUS_CFG[inv.status];
                    return (
                      <tr
                        key={inv.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {inv.invoice_number}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0",
                                getAvatarColor(inv.student_name),
                              )}
                            >
                              {inv.student_name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">
                                {inv.student_name}
                              </p>
                              <p className="text-xs text-slate-400">
                                {inv.student_email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          <span className="text-slate-600 text-sm">
                            {inv.course_title}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="font-bold text-slate-900">
                            {fmtCurrency(invoiceGrand(inv), inv.currency)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
                              sc.bg,
                              sc.text,
                            )}
                          >
                            <span
                              className={cn("w-1.5 h-1.5 rounded-full", sc.dot)}
                            />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <span
                            className={cn(
                              "text-sm",
                              inv.status === "overdue"
                                ? "text-rose-600 font-semibold"
                                : "text-slate-400",
                            )}
                          >
                            {format(inv.due_date, "MMM d, yyyy")}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setSelected(inv)}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                              title="View Invoice"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => printInvoice(inv, brand)}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {filtered.length} of {invoices.length} invoices
              </span>
              <span className="text-xs font-semibold text-slate-700">
                Showing:{" "}
                {fmtCurrency(
                  filtered.reduce((s, i) => s + invoiceGrand(i), 0),
                  filtered.length &&
                    filtered.every((i) => i.currency === filtered[0].currency)
                    ? filtered[0].currency
                    : "USD",
                )}{" "}
                total
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Invoice Preview
                </h2>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  {selected.invoice_number}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printInvoice(selected, brand)}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Invoice Body */}
            <div className="p-8 space-y-6">
              {/* Brand + Invoice Title */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 14l9-5-9-5-9 5 9 5z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{brand.name}</p>
                    <p className="text-xs text-slate-400">{brand.website}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-indigo-600 tracking-tight">
                    INVOICE
                  </p>
                  <p className="font-mono text-sm text-slate-500 mt-1">
                    {selected.invoice_number}
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-1",
                      STATUS_CFG[selected.status].bg,
                      STATUS_CFG[selected.status].text,
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        STATUS_CFG[selected.status].dot,
                      )}
                    />
                    {STATUS_CFG[selected.status].label}
                  </span>
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* From / To */}
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    From
                  </p>
                  <p className="font-bold text-slate-900">{brand.name}</p>
                  <div className="mt-1.5 space-y-1">
                    {[
                      { icon: Mail, text: brand.email },
                      { icon: Phone, text: brand.phone },
                      { icon: MapPin, text: brand.address },
                    ].map(({ icon: Icon, text }) => (
                      <div
                        key={text}
                        className="flex items-start gap-1.5 text-xs text-slate-500"
                      >
                        <Icon className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
                        {text}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Bill To
                  </p>
                  <p className="font-bold text-slate-900">
                    {selected.student_name}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {[
                      { icon: Mail, text: selected.student_email },
                      { icon: Phone, text: selected.student_phone },
                      { icon: MapPin, text: selected.student_address },
                    ].map(({ icon: Icon, text }) => (
                      <div
                        key={text}
                        className="flex items-start gap-1.5 text-xs text-slate-500"
                      >
                        <Icon className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
                        {text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 rounded-xl p-4">
                {[
                  ["Issue Date", format(selected.issued_date, "MMM d, yyyy")],
                  ["Due Date", format(selected.due_date, "MMM d, yyyy")],
                  [
                    selected.paid_date ? "Paid On" : "Status",
                    selected.paid_date
                      ? format(selected.paid_date, "MMM d, yyyy")
                      : STATUS_CFG[selected.status].label,
                  ],
                ].map(([label, val]) => (
                  <div key={label} className="text-center">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">
                      {label}
                    </p>
                    <p className="text-sm font-bold text-slate-800">{val}</p>
                  </div>
                ))}
              </div>

              {/* Items Table */}
              <div className="rounded-xl overflow-hidden border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-indigo-600 text-white">
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide">
                        Description
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wide w-14">
                        Qty
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wide w-24">
                        Unit Price
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wide w-24">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {selected.items.map((item, i) => (
                      <tr
                        key={i}
                        className={i % 2 === 1 ? "bg-slate-50/50" : ""}
                      >
                        <td className="px-4 py-3 text-slate-700">
                          {item.description}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500">
                          {item.qty}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {fmtCurrency(item.unit_price, selected.currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">
                          {fmtCurrency(item.qty * item.unit_price, selected.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Subtotal</span>
                    <span className="font-semibold text-slate-700">
                      {fmtCurrency(invoiceTotal(selected), selected.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-500 pb-2 border-b border-dashed border-slate-200">
                    <span>Tax (0%)</span>
                    <span className="font-semibold text-slate-700">
                      {fmtCurrency(invoiceTax(selected), selected.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-slate-900 pt-1">
                    <span>Total Due</span>
                    <span className="text-indigo-600 text-lg">
                      {fmtCurrency(invoiceGrand(selected), selected.currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selected.notes && (
                <div className="bg-indigo-50 border-l-4 border-indigo-400 rounded-r-xl p-4">
                  <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1">
                    Notes
                  </p>
                  <p className="text-sm text-slate-600">{selected.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

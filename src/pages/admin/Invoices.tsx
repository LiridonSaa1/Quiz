import React, { useState, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { format, subDays, subMonths, addDays } from 'date-fns';
import {
  Receipt, CheckCircle2, Clock, AlertCircle, Search,
  ChevronDown, Eye, Download, X, FileText, Building2,
  Mail, Phone, MapPin, Hash
} from 'lucide-react';

type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft';

interface InvoiceItem {
  description: string;
  qty: number;
  unit_price: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  student_name: string;
  student_email: string;
  student_address: string;
  student_phone: string;
  course_title: string;
  status: InvoiceStatus;
  issued_date: Date;
  due_date: Date;
  paid_date?: Date;
  items: InvoiceItem[];
  notes: string;
}

const SCHOOL = {
  name: 'QuizMaster Academy',
  email: 'billing@quizmaster.edu',
  phone: '+1 (555) 010-2030',
  address: '123 Education Blvd, Suite 400, New York, NY 10001',
  website: 'www.quizmaster.edu',
};

const MOCK_INVOICES: Invoice[] = [
  {
    id: '1', invoice_number: 'INV-2026-0001', student_name: 'Arta Krasniqi', student_email: 'arta@example.com',
    student_address: '45 Maple St, Brooklyn, NY 11201', student_phone: '+1 (555) 111-2222',
    course_title: 'Advanced Mathematics', status: 'paid',
    issued_date: subDays(new Date(), 30), due_date: subDays(new Date(), 15), paid_date: subDays(new Date(), 14),
    items: [{ description: 'Advanced Mathematics — Full Course Enrollment', qty: 1, unit_price: 199 }],
    notes: 'Thank you for choosing QuizMaster Academy.',
  },
  {
    id: '2', invoice_number: 'INV-2026-0002', student_name: 'Besmir Hoxha', student_email: 'besmir@example.com',
    student_address: '88 Oak Ave, Manhattan, NY 10002', student_phone: '+1 (555) 333-4444',
    course_title: 'Web Development Bootcamp', status: 'paid',
    issued_date: subDays(new Date(), 25), due_date: subDays(new Date(), 10), paid_date: subDays(new Date(), 9),
    items: [
      { description: 'Web Development Bootcamp — Full Course Enrollment', qty: 1, unit_price: 299 },
      { description: 'Supplementary Study Materials', qty: 1, unit_price: 50 },
    ],
    notes: 'Payment received. Access granted.',
  },
  {
    id: '3', invoice_number: 'INV-2026-0003', student_name: 'Drita Berisha', student_email: 'drita@example.com',
    student_address: '12 Pine Rd, Queens, NY 11101', student_phone: '+1 (555) 555-6666',
    course_title: 'UI/UX Design Fundamentals', status: 'pending',
    issued_date: subDays(new Date(), 5), due_date: addDays(new Date(), 10),
    items: [{ description: 'UI/UX Design Fundamentals — Full Course Enrollment', qty: 1, unit_price: 149 }],
    notes: 'Payment due within 15 days of invoice date.',
  },
  {
    id: '4', invoice_number: 'INV-2026-0004', student_name: 'Flamur Gashi', student_email: 'flamur@example.com',
    student_address: '7 Cedar Ln, Bronx, NY 10451', student_phone: '+1 (555) 777-8888',
    course_title: 'Data Science Essentials', status: 'overdue',
    issued_date: subDays(new Date(), 40), due_date: subDays(new Date(), 10),
    items: [
      { description: 'Data Science Essentials — Full Course Enrollment', qty: 1, unit_price: 249 },
      { description: 'Python Toolkit License', qty: 1, unit_price: 30 },
    ],
    notes: 'Please settle this invoice immediately to avoid service interruption.',
  },
  {
    id: '5', invoice_number: 'INV-2026-0005', student_name: 'Genta Osmani', student_email: 'genta@example.com',
    student_address: '99 Birch Blvd, Staten Island, NY 10301', student_phone: '+1 (555) 999-0000',
    course_title: 'English for Beginners', status: 'draft',
    issued_date: new Date(), due_date: addDays(new Date(), 30),
    items: [{ description: 'English for Beginners — Full Course Enrollment', qty: 1, unit_price: 89 }],
    notes: 'Draft invoice — not yet sent to student.',
  },
  {
    id: '6', invoice_number: 'INV-2026-0006', student_name: 'Ilir Morina', student_email: 'ilir@example.com',
    student_address: '3 Walnut Way, Jersey City, NJ 07302', student_phone: '+1 (555) 211-3322',
    course_title: 'Photography Masterclass', status: 'paid',
    issued_date: subMonths(new Date(), 1), due_date: subDays(new Date(), 20), paid_date: subDays(new Date(), 21),
    items: [{ description: 'Photography Masterclass — Full Course Enrollment', qty: 1, unit_price: 129 }],
    notes: 'Thank you for your prompt payment.',
  },
  {
    id: '7', invoice_number: 'INV-2026-0007', student_name: 'Jehona Pllana', student_email: 'jehona@example.com',
    student_address: '55 Elm St, Hoboken, NJ 07030', student_phone: '+1 (555) 444-5566',
    course_title: 'Web Development Bootcamp', status: 'overdue',
    issued_date: subDays(new Date(), 50), due_date: subDays(new Date(), 20),
    items: [
      { description: 'Web Development Bootcamp — Full Course Enrollment', qty: 1, unit_price: 299 },
      { description: 'Course Extension (1 month)', qty: 1, unit_price: 50 },
    ],
    notes: 'Overdue — please contact billing@quizmaster.edu.',
  },
  {
    id: '8', invoice_number: 'INV-2026-0008', student_name: 'Kushtrim Aliu', student_email: 'kushtrim@example.com',
    student_address: '21 Spruce Ave, Newark, NJ 07102', student_phone: '+1 (555) 667-7889',
    course_title: 'Advanced Mathematics', status: 'pending',
    issued_date: subDays(new Date(), 3), due_date: addDays(new Date(), 12),
    items: [{ description: 'Advanced Mathematics — Full Course Enrollment', qty: 1, unit_price: 199 }],
    notes: 'Payment due within 15 days of invoice date.',
  },
];

const STATUS_CFG: Record<InvoiceStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  paid:    { label: 'Paid',    bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  pending: { label: 'Pending', bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: Clock },
  overdue: { label: 'Overdue', bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500',    icon: AlertCircle },
  draft:   { label: 'Draft',   bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   icon: FileText },
};

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600', 'from-blue-500 to-indigo-600',
  'from-teal-500 to-cyan-600', 'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600', 'from-emerald-500 to-green-600',
];
const getAvatarColor = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const fmtCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const invoiceTotal = (inv: Invoice) => inv.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
const invoiceTax = (inv: Invoice) => Math.round(invoiceTotal(inv) * 0.08 * 100) / 100;
const invoiceGrand = (inv: Invoice) => invoiceTotal(inv) + invoiceTax(inv);

function printInvoice(inv: Invoice) {
  const subtotal = invoiceTotal(inv);
  const tax = invoiceTax(inv);
  const grand = invoiceGrand(inv);
  const sc = STATUS_CFG[inv.status];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${inv.invoice_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #1e293b; font-size: 13px; }
    .page { max-width: 720px; margin: 0 auto; padding: 48px 48px 60px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { width: 44px; height: 44px; background: linear-gradient(135deg,#6366f1,#8b5cf6); border-radius: 12px; display: flex; align-items: center; justify-content: center; }
    .logo svg { width: 24px; height: 24px; fill: none; stroke: white; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .brand-name { font-size: 20px; font-weight: 800; color: #1e293b; letter-spacing: -0.3px; }
    .brand-url  { font-size: 11px; color: #94a3b8; margin-top: 1px; }
    .inv-meta { text-align: right; }
    .inv-title { font-size: 28px; font-weight: 800; color: #6366f1; letter-spacing: -0.5px; }
    .inv-num   { font-size: 13px; color: #64748b; margin-top: 4px; font-family: monospace; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-top: 6px; background: ${inv.status === 'paid' ? '#d1fae5' : inv.status === 'overdue' ? '#fee2e2' : inv.status === 'pending' ? '#fef3c7' : '#f1f5f9'}; color: ${inv.status === 'paid' ? '#065f46' : inv.status === 'overdue' ? '#991b1b' : inv.status === 'pending' ? '#92400e' : '#475569'}; }
    .divider { border: none; border-top: 1.5px solid #e2e8f0; margin: 32px 0; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 32px; }
    .party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 10px; }
    .party-name  { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
    .party-detail { font-size: 12px; color: #64748b; margin-bottom: 3px; line-height: 1.6; }
    .dates { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 32px; }
    .date-block { text-align: center; }
    .date-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px; }
    .date-val   { font-size: 14px; font-weight: 700; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #6366f1; color: white; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 10px 14px; text-align: left; }
    th:last-child, td:last-child { text-align: right; }
    td { padding: 12px 14px; font-size: 13px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #f8fafc; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 32px; }
    .totals-box { width: 260px; }
    .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #64748b; border-bottom: 1px dashed #e2e8f0; }
    .total-row:last-child { border-bottom: none; font-size: 16px; font-weight: 800; color: #1e293b; padding-top: 12px; }
    .total-row span:last-child { font-weight: 700; color: #334155; }
    .total-row:last-child span:last-child { color: #6366f1; font-size: 18px; }
    .notes-section { background: #f8fafc; border-left: 3px solid #6366f1; border-radius: 0 8px 8px 0; padding: 14px 18px; margin-bottom: 32px; }
    .notes-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6366f1; margin-bottom: 6px; }
    .notes-text  { font-size: 12px; color: #64748b; line-height: 1.6; }
    .footer { display: flex; justify-content: space-between; align-items: center; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    .footer-left  { font-size: 11px; color: #94a3b8; line-height: 1.8; }
    .footer-right { text-align: right; font-size: 11px; color: #94a3b8; }
    .thank-you { font-size: 15px; font-weight: 700; color: #6366f1; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { padding: 32px; } }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">
      <div class="logo">
        <svg viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>
      </div>
      <div>
        <div class="brand-name">${SCHOOL.name}</div>
        <div class="brand-url">${SCHOOL.website}</div>
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-title">INVOICE</div>
      <div class="inv-num">${inv.invoice_number}</div>
      <div class="status-badge">${sc.label.toUpperCase()}</div>
    </div>
  </div>

  <hr class="divider"/>

  <div class="parties">
    <div>
      <div class="party-label">From</div>
      <div class="party-name">${SCHOOL.name}</div>
      <div class="party-detail">${SCHOOL.email}</div>
      <div class="party-detail">${SCHOOL.phone}</div>
      <div class="party-detail">${SCHOOL.address}</div>
    </div>
    <div>
      <div class="party-label">Bill To</div>
      <div class="party-name">${inv.student_name}</div>
      <div class="party-detail">${inv.student_email}</div>
      <div class="party-detail">${inv.student_phone}</div>
      <div class="party-detail">${inv.student_address}</div>
    </div>
  </div>

  <div class="dates">
    <div class="date-block">
      <div class="date-label">Issue Date</div>
      <div class="date-val">${format(inv.issued_date, 'MMM d, yyyy')}</div>
    </div>
    <div class="date-block">
      <div class="date-label">Due Date</div>
      <div class="date-val">${format(inv.due_date, 'MMM d, yyyy')}</div>
    </div>
    <div class="date-block">
      <div class="date-label">${inv.paid_date ? 'Paid On' : 'Status'}</div>
      <div class="date-val">${inv.paid_date ? format(inv.paid_date, 'MMM d, yyyy') : sc.label}</div>
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
      ${inv.items.map(item => `
      <tr>
        <td>${item.description}</td>
        <td style="text-align:center">${item.qty}</td>
        <td style="text-align:right">${fmtCurrency(item.unit_price)}</td>
        <td style="text-align:right">${fmtCurrency(item.qty * item.unit_price)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="total-row"><span>Subtotal</span><span>${fmtCurrency(subtotal)}</span></div>
      <div class="total-row"><span>Tax (8%)</span><span>${fmtCurrency(tax)}</span></div>
      <div class="total-row"><span>Total Due</span><span>${fmtCurrency(grand)}</span></div>
    </div>
  </div>

  ${inv.notes ? `<div class="notes-section"><div class="notes-label">Notes</div><div class="notes-text">${inv.notes}</div></div>` : ''}

  <div class="footer">
    <div class="footer-left">
      <div>${SCHOOL.name}</div>
      <div>${SCHOOL.address}</div>
      <div>${SCHOOL.email} · ${SCHOOL.phone}</div>
    </div>
    <div class="footer-right">
      <div class="thank-you">Thank You!</div>
      <div>Questions? ${SCHOOL.email}</div>
    </div>
  </div>
</div>
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export default function AdminInvoices() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [selected, setSelected] = useState<Invoice | null>(null);

  const stats = useMemo(() => {
    const paid    = MOCK_INVOICES.filter(i => i.status === 'paid');
    const pending = MOCK_INVOICES.filter(i => i.status === 'pending');
    const overdue = MOCK_INVOICES.filter(i => i.status === 'overdue');
    return {
      total:      MOCK_INVOICES.length,
      totalAmt:   MOCK_INVOICES.reduce((s, i) => s + invoiceGrand(i), 0),
      paidAmt:    paid.reduce((s, i) => s + invoiceGrand(i), 0),
      paidCount:  paid.length,
      pendingAmt: pending.reduce((s, i) => s + invoiceGrand(i), 0),
      pendingCount: pending.length,
      overdueAmt: overdue.reduce((s, i) => s + invoiceGrand(i), 0),
      overdueCount: overdue.length,
    };
  }, []);

  const filtered = useMemo(() => MOCK_INVOICES.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = !q || i.student_name.toLowerCase().includes(q) || i.invoice_number.toLowerCase().includes(q) || i.course_title.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || i.status === statusFilter;
    return matchSearch && matchStatus;
  }), [search, statusFilter]);

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage and download student invoices</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
              <Receipt className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">Total Invoices</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtCurrency(stats.totalAmt)} total value</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.paidCount}</p>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">Paid</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtCurrency(stats.paidAmt)} collected</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mb-3">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.pendingCount}</p>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">Pending</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtCurrency(stats.pendingAmt)} outstanding</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.overdueCount}</p>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">Overdue</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtCurrency(stats.overdueAmt)} overdue</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by student, invoice, or course..."
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
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
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Course</th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Due Date</th>
                  <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-sm">No invoices found.</td></tr>
                ) : filtered.map(inv => {
                  const sc = STATUS_CFG[inv.status];
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs font-semibold text-slate-700">{inv.invoice_number}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(inv.student_name))}>
                            {inv.student_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{inv.student_name}</p>
                            <p className="text-xs text-slate-400">{inv.student_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <span className="text-slate-600 text-sm">{inv.course_title}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="font-bold text-slate-900">{fmtCurrency(invoiceGrand(inv))}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', sc.bg, sc.text)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className={cn('text-sm', inv.status === 'overdue' ? 'text-rose-600 font-semibold' : 'text-slate-400')}>
                          {format(inv.due_date, 'MMM d, yyyy')}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setSelected(inv)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors" title="View Invoice">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => printInvoice(inv)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Download PDF">
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">{filtered.length} of {MOCK_INVOICES.length} invoices</span>
              <span className="text-xs font-semibold text-slate-700">
                Showing: {fmtCurrency(filtered.reduce((s, i) => s + invoiceGrand(i), 0))} total
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Invoice Preview</h2>
                <p className="text-xs font-mono text-slate-400 mt-0.5">{selected.invoice_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => printInvoice(selected)} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
                <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
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
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{SCHOOL.name}</p>
                    <p className="text-xs text-slate-400">{SCHOOL.website}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-indigo-600 tracking-tight">INVOICE</p>
                  <p className="font-mono text-sm text-slate-500 mt-1">{selected.invoice_number}</p>
                  <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-1', STATUS_CFG[selected.status].bg, STATUS_CFG[selected.status].text)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_CFG[selected.status].dot)} />
                    {STATUS_CFG[selected.status].label}
                  </span>
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* From / To */}
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">From</p>
                  <p className="font-bold text-slate-900">{SCHOOL.name}</p>
                  <div className="mt-1.5 space-y-1">
                    {[
                      { icon: Mail, text: SCHOOL.email },
                      { icon: Phone, text: SCHOOL.phone },
                      { icon: MapPin, text: SCHOOL.address },
                    ].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-start gap-1.5 text-xs text-slate-500">
                        <Icon className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
                        {text}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Bill To</p>
                  <p className="font-bold text-slate-900">{selected.student_name}</p>
                  <div className="mt-1.5 space-y-1">
                    {[
                      { icon: Mail, text: selected.student_email },
                      { icon: Phone, text: selected.student_phone },
                      { icon: MapPin, text: selected.student_address },
                    ].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-start gap-1.5 text-xs text-slate-500">
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
                  ['Issue Date', format(selected.issued_date, 'MMM d, yyyy')],
                  ['Due Date', format(selected.due_date, 'MMM d, yyyy')],
                  [selected.paid_date ? 'Paid On' : 'Status', selected.paid_date ? format(selected.paid_date, 'MMM d, yyyy') : STATUS_CFG[selected.status].label],
                ].map(([label, val]) => (
                  <div key={label} className="text-center">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-sm font-bold text-slate-800">{val}</p>
                  </div>
                ))}
              </div>

              {/* Items Table */}
              <div className="rounded-xl overflow-hidden border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-indigo-600 text-white">
                      <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide">Description</th>
                      <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wide w-14">Qty</th>
                      <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wide w-24">Unit Price</th>
                      <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wide w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {selected.items.map((item, i) => (
                      <tr key={i} className={i % 2 === 1 ? 'bg-slate-50/50' : ''}>
                        <td className="px-4 py-3 text-slate-700">{item.description}</td>
                        <td className="px-4 py-3 text-center text-slate-500">{item.qty}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{fmtCurrency(item.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtCurrency(item.qty * item.unit_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Subtotal</span><span className="font-semibold text-slate-700">{fmtCurrency(invoiceTotal(selected))}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-500 pb-2 border-b border-dashed border-slate-200">
                    <span>Tax (8%)</span><span className="font-semibold text-slate-700">{fmtCurrency(invoiceTax(selected))}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-slate-900 pt-1">
                    <span>Total Due</span><span className="text-indigo-600 text-lg">{fmtCurrency(invoiceGrand(selected))}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selected.notes && (
                <div className="bg-indigo-50 border-l-4 border-indigo-400 rounded-r-xl p-4">
                  <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-1">Notes</p>
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

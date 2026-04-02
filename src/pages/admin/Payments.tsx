import React, { useState, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { format, subDays, subMonths } from 'date-fns';
import {
  DollarSign, TrendingUp, Clock, CheckCircle2, XCircle,
  Search, Filter, ChevronDown, Eye, RefreshCw, Download,
  ArrowUpRight, ArrowDownRight, CreditCard, Banknote, ReceiptText
} from 'lucide-react';

type PaymentStatus = 'completed' | 'pending' | 'failed' | 'refunded';
type PaymentMethod = 'card' | 'bank' | 'paypal';

interface Payment {
  id: string;
  invoice_number: string;
  student_name: string;
  student_email: string;
  course_title: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  date: Date;
  description: string;
}

const MOCK_PAYMENTS: Payment[] = [
  { id: '1',  invoice_number: 'INV-2026-0001', student_name: 'Arta Krasniqi',     student_email: 'arta@example.com',    course_title: 'Advanced Mathematics',   amount: 199, currency: 'USD', status: 'completed', method: 'card',   date: subDays(new Date(), 1),  description: 'Course enrollment fee' },
  { id: '2',  invoice_number: 'INV-2026-0002', student_name: 'Besmir Hoxha',      student_email: 'besmir@example.com',  course_title: 'Web Development Bootcamp', amount: 349, currency: 'USD', status: 'completed', method: 'paypal', date: subDays(new Date(), 2),  description: 'Course enrollment fee' },
  { id: '3',  invoice_number: 'INV-2026-0003', student_name: 'Drita Berisha',     student_email: 'drita@example.com',   course_title: 'UI/UX Design Fundamentals', amount: 149, currency: 'USD', status: 'pending',   method: 'bank',   date: subDays(new Date(), 3),  description: 'Course enrollment fee' },
  { id: '4',  invoice_number: 'INV-2026-0004', student_name: 'Flamur Gashi',      student_email: 'flamur@example.com',  course_title: 'Data Science Essentials', amount: 279, currency: 'USD', status: 'completed', method: 'card',   date: subDays(new Date(), 5),  description: 'Course enrollment fee' },
  { id: '5',  invoice_number: 'INV-2026-0005', student_name: 'Genta Osmani',      student_email: 'genta@example.com',   course_title: 'English for Beginners',  amount: 89,  currency: 'USD', status: 'failed',    method: 'card',   date: subDays(new Date(), 6),  description: 'Course enrollment fee' },
  { id: '6',  invoice_number: 'INV-2026-0006', student_name: 'Ilir Morina',       student_email: 'ilir@example.com',    course_title: 'Advanced Mathematics',   amount: 199, currency: 'USD', status: 'refunded',  method: 'paypal', date: subDays(new Date(), 8),  description: 'Course enrollment fee' },
  { id: '7',  invoice_number: 'INV-2026-0007', student_name: 'Jehona Pllana',     student_email: 'jehona@example.com',  course_title: 'Photography Masterclass', amount: 129, currency: 'USD', status: 'completed', method: 'card',   date: subDays(new Date(), 10), description: 'Course enrollment fee' },
  { id: '8',  invoice_number: 'INV-2026-0008', student_name: 'Kushtrim Aliu',     student_email: 'kushtrim@example.com',course_title: 'Web Development Bootcamp', amount: 349, currency: 'USD', status: 'completed', method: 'bank',   date: subDays(new Date(), 12), description: 'Course enrollment fee' },
  { id: '9',  invoice_number: 'INV-2026-0009', student_name: 'Lirije Sadiku',     student_email: 'lirije@example.com',  course_title: 'Data Science Essentials', amount: 279, currency: 'USD', status: 'pending',   method: 'card',   date: subDays(new Date(), 14), description: 'Course enrollment fee' },
  { id: '10', invoice_number: 'INV-2026-0010', student_name: 'Mentor Bajrami',    student_email: 'mentor@example.com',  course_title: 'UI/UX Design Fundamentals', amount: 149, currency: 'USD', status: 'completed', method: 'card',   date: subDays(new Date(), 16), description: 'Course enrollment fee' },
  { id: '11', invoice_number: 'INV-2026-0011', student_name: 'Njomza Rama',       student_email: 'njomza@example.com',  course_title: 'Photography Masterclass', amount: 129, currency: 'USD', status: 'completed', method: 'paypal', date: subDays(new Date(), 18), description: 'Course enrollment fee' },
  { id: '12', invoice_number: 'INV-2026-0012', student_name: 'Oren Lushta',       student_email: 'oren@example.com',    course_title: 'English for Beginners',  amount: 89,  currency: 'USD', status: 'failed',    method: 'bank',   date: subDays(new Date(), 20), description: 'Course enrollment fee' },
  { id: '13', invoice_number: 'INV-2026-0013', student_name: 'Pranvera Kelmendi', student_email: 'pranvera@example.com',course_title: 'Advanced Mathematics',   amount: 199, currency: 'USD', status: 'completed', method: 'card',   date: subMonths(new Date(), 1), description: 'Course enrollment fee' },
  { id: '14', invoice_number: 'INV-2026-0014', student_name: 'Qendresa Hyseni',   student_email: 'qendresa@example.com',course_title: 'Web Development Bootcamp', amount: 349, currency: 'USD', status: 'completed', method: 'card',   date: subMonths(new Date(), 1), description: 'Course enrollment fee' },
  { id: '15', invoice_number: 'INV-2026-0015', student_name: 'Rinor Vllasaliu',   student_email: 'rinor@example.com',   course_title: 'Data Science Essentials', amount: 279, currency: 'USD', status: 'pending',   method: 'paypal', date: subMonths(new Date(), 1), description: 'Course enrollment fee' },
];

const STATUS_CFG: Record<PaymentStatus, { label: string; bg: string; text: string; dot: string; icon: React.ElementType }> = {
  completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  pending:   { label: 'Pending',   bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: Clock },
  failed:    { label: 'Failed',    bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500',    icon: XCircle },
  refunded:  { label: 'Refunded',  bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400',   icon: RefreshCw },
};

const METHOD_CFG: Record<PaymentMethod, { label: string; icon: React.ElementType; color: string }> = {
  card:   { label: 'Credit Card', icon: CreditCard, color: 'text-indigo-600' },
  bank:   { label: 'Bank Transfer', icon: Banknote,   color: 'text-teal-600' },
  paypal: { label: 'PayPal',      icon: ReceiptText,  color: 'text-blue-600' },
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

export default function AdminPayments() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [selected, setSelected] = useState<Payment | null>(null);

  const stats = useMemo(() => {
    const completed = MOCK_PAYMENTS.filter(p => p.status === 'completed');
    const pending = MOCK_PAYMENTS.filter(p => p.status === 'pending');
    const failed = MOCK_PAYMENTS.filter(p => p.status === 'failed');
    const refunded = MOCK_PAYMENTS.filter(p => p.status === 'refunded');
    const totalRevenue = completed.reduce((s, p) => s + p.amount, 0);
    const thisMonth = completed.filter(p => p.date >= subMonths(new Date(), 1)).reduce((s, p) => s + p.amount, 0);
    return { totalRevenue, thisMonth, pendingCount: pending.length, pendingAmt: pending.reduce((s, p) => s + p.amount, 0), failedCount: failed.length, refundedAmt: refunded.reduce((s, p) => s + p.amount, 0), total: MOCK_PAYMENTS.length };
  }, []);

  const filtered = useMemo(() => MOCK_PAYMENTS.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.student_name.toLowerCase().includes(q) || p.invoice_number.toLowerCase().includes(q) || p.course_title.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchMethod = methodFilter === 'all' || p.method === methodFilter;
    return matchSearch && matchStatus && matchMethod;
  }), [search, statusFilter, methodFilter]);

  return (
    <AdminLayout>
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
            <p className="text-sm text-slate-500 mt-0.5">Track all student payment transactions</p>
          </div>
          <button className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={DollarSign} label="Total Revenue" value={fmtCurrency(stats.totalRevenue)} sub={`${stats.total} transactions`} iconBg="bg-indigo-100 text-indigo-600" trend={12} />
          <StatCard icon={TrendingUp} label="This Month" value={fmtCurrency(stats.thisMonth)} sub="Completed payments" iconBg="bg-emerald-100 text-emerald-600" trend={8} />
          <StatCard icon={Clock} label="Pending" value={fmtCurrency(stats.pendingAmt)} sub={`${stats.pendingCount} payments`} iconBg="bg-amber-100 text-amber-600" />
          <StatCard icon={RefreshCw} label="Refunded" value={fmtCurrency(stats.refundedAmt)} sub={`${stats.failedCount} failed`} iconBg="bg-rose-100 text-rose-600" />
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
            <SelectFilter value={statusFilter} onChange={v => setStatusFilter(v as any)} options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'completed', label: 'Completed' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' },
            ]} />
            <SelectFilter value={methodFilter} onChange={v => setMethodFilter(v as any)} options={[
              { value: 'all', label: 'All Methods' },
              { value: 'card', label: 'Credit Card' },
              { value: 'bank', label: 'Bank Transfer' },
              { value: 'paypal', label: 'PayPal' },
            ]} />
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
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Method</th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Date</th>
                  <th className="px-5 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400 text-sm">No payments found.</td></tr>
                ) : filtered.map(p => {
                  const sc = STATUS_CFG[p.status];
                  const mc = METHOD_CFG[p.method];
                  const MethodIcon = mc.icon;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs font-semibold text-slate-700">{p.invoice_number}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', getAvatarColor(p.student_name))}>
                            {p.student_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{p.student_name}</p>
                            <p className="text-xs text-slate-400">{p.student_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <span className="text-slate-600 text-sm">{p.course_title}</span>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          <MethodIcon className={cn('w-4 h-4', mc.color)} />
                          <span className="text-slate-500 text-sm">{mc.label}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="font-bold text-slate-900">{fmtCurrency(p.amount)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', sc.bg, sc.text)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className="text-slate-400 text-sm">{format(p.date, 'MMM d, yyyy')}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => setSelected(p)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">{filtered.length} of {MOCK_PAYMENTS.length} payments</span>
              <span className="text-xs font-semibold text-slate-700">
                Total: {fmtCurrency(filtered.reduce((s, p) => s + (p.status === 'completed' ? p.amount : 0), 0))} collected
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Payment Details</h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{selected.invoice_number}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {[
                ['Student', selected.student_name],
                ['Email', selected.student_email],
                ['Course', selected.course_title],
                ['Amount', fmtCurrency(selected.amount)],
                ['Method', METHOD_CFG[selected.method].label],
                ['Date', format(selected.date, 'MMMM d, yyyy')],
                ['Description', selected.description],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-start">
                  <span className="text-sm text-slate-500">{k}</span>
                  <span className="text-sm font-semibold text-slate-800 text-right max-w-[60%]">{v}</span>
                </div>
              ))}
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Status</span>
                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', STATUS_CFG[selected.status].bg, STATUS_CFG[selected.status].text)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_CFG[selected.status].dot)} />
                  {STATUS_CFG[selected.status].label}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function StatCard({ icon: Icon, label, value, sub, iconBg, trend }: { icon: React.ElementType; label: string; value: string; sub: string; iconBg: string; trend?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <span className="flex items-center gap-0.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            <ArrowUpRight className="w-3 h-3" />{trend}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm font-semibold text-slate-700 mt-0.5">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function SelectFilter({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700 cursor-pointer"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import AdminLayout from "../../components/layout/AdminLayout";
import { cn } from "../../lib/utils";
import { format, subMonths } from "date-fns";
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  ChevronDown,
  Eye,
  RefreshCw,
  Plus,
  ArrowUpRight,
  CreditCard,
  Banknote,
  ReceiptText,
} from "lucide-react";
import { toast } from "sonner";
import { apiUrl, readApiError } from "../../lib/apiUrl";

type PaymentStatus = "completed" | "pending" | "failed" | "refunded";
type PaymentMethod = "card" | "bank" | "paypal" | "cash";

interface Payment {
  id: string;
  reference: string;
  teacher_id: string | null;
  teacher_name: string;
  student_id: string | null;
  student_name: string;
  student_email: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  payment_date: string;
  description: string;
  created_at?: string;
}

interface TeacherOption {
  id: string;
  name: string;
}

interface StudentOption {
  id: string;
  name: string;
  email: string;
  teacherId: string | null;
}

const STATUS_CFG: Record<
  PaymentStatus,
  {
    label: string;
    bg: string;
    text: string;
    dot: string;
    icon: React.ElementType;
  }
> = {
  completed: {
    label: "Completed",
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
  failed: {
    label: "Failed",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-500",
    icon: XCircle,
  },
  refunded: {
    label: "Refunded",
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
    icon: RefreshCw,
  },
};

const METHOD_CFG: Record<
  PaymentMethod,
  { label: string; icon: React.ElementType; color: string }
> = {
  card: { label: "Credit Card", icon: CreditCard, color: "text-indigo-600" },
  bank: { label: "Bank Transfer", icon: Banknote, color: "text-teal-600" },
  paypal: { label: "PayPal", icon: ReceiptText, color: "text-blue-600" },
  cash: { label: "Cash", icon: DollarSign, color: "text-emerald-600" },
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

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

export default function AdminPayments() {
  const { t } = useTranslation();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PaymentStatus>(
    "all",
  );
  const [methodFilter, setMethodFilter] = useState<"all" | PaymentMethod>(
    "all",
  );
  const [selected, setSelected] = useState<Payment | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState({
    teacher_id: "",
    student_id: "",
    amount: "",
    currency: "EUR",
    status: "completed" as PaymentStatus,
    method: "bank" as PaymentMethod,
    payment_date: format(new Date(), "yyyy-MM-dd"),
    description: "",
    reference: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/admin/payments"));
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load payments");
      setPayments(
        (json.payments || []).map((p: any) => ({
          ...p,
          amount: Number(p.amount || 0),
          reference: p.reference || `PAY-${String(p.id || "").slice(0, 8)}`,
        })),
      );
      setTeacherOptions(json.teacherOptions || []);
      setStudentOptions(json.studentOptions || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const completed = payments.filter((p) => p.status === "completed");
    const pending = payments.filter((p) => p.status === "pending");
    const failed = payments.filter((p) => p.status === "failed");
    const refunded = payments.filter((p) => p.status === "refunded");
    const totalRevenue = completed.reduce((s, p) => s + p.amount, 0);
    const thisMonth = completed
      .filter((p) => new Date(p.payment_date) >= subMonths(new Date(), 1))
      .reduce((s, p) => s + p.amount, 0);
    return {
      totalRevenue,
      thisMonth,
      pendingCount: pending.length,
      pendingAmt: pending.reduce((s, p) => s + p.amount, 0),
      failedCount: failed.length,
      refundedAmt: refunded.reduce((s, p) => s + p.amount, 0),
      total: payments.length,
    };
  }, [payments]);

  const studentsForTeacher = useMemo(
    () => studentOptions.filter((s) => s.teacherId === form.teacher_id),
    [studentOptions, form.teacher_id],
  );

  const filtered = useMemo(
    () =>
      payments.filter((p) => {
        const q = search.toLowerCase();
        const matchSearch =
          !q ||
          p.student_name.toLowerCase().includes(q) ||
          p.reference.toLowerCase().includes(q) ||
          p.teacher_name.toLowerCase().includes(q);
        const matchStatus = statusFilter === "all" || p.status === statusFilter;
        const matchMethod = methodFilter === "all" || p.method === methodFilter;
        return matchSearch && matchStatus && matchMethod;
      }),
    [payments, search, statusFilter, methodFilter],
  );

  const resetForm = () =>
    setForm({
      teacher_id: "",
      student_id: "",
      amount: "",
      currency: "EUR",
      status: "completed",
      method: "bank",
      payment_date: format(new Date(), "yyyy-MM-dd"),
      description: "",
      reference: "",
    });

  const openRegisterModal = () => {
    resetForm();
    setShowRegister(true);
  };

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.teacher_id) return toast.error("Please select a teacher");
    if (!form.student_id) return toast.error("Please select a student");
    if (!form.amount || Number(form.amount) <= 0) {
      return toast.error("Amount must be greater than 0");
    }
    if (!form.payment_date) return toast.error("Please select a payment date");

    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/admin/payments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          reference: form.reference.trim(),
          description: form.description.trim(),
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to create payment");
      if (json.invoice_number) {
        toast.success(`Payment registered · Invoice ${json.invoice_number}`);
      } else {
        toast.success("Payment registered");
      }
      setShowRegister(false);
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to register payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Track and register teacher-student payments
            </p>
          </div>
          <button
            onClick={openRegisterModal}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Register Payment
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={DollarSign}
            label="Total Revenue"
            value={fmtCurrency(stats.totalRevenue)}
            sub={`${stats.total} transactions`}
            iconBg="bg-indigo-100 text-indigo-600"
            trend={12}
            grad="from-indigo-500 to-violet-500"
            ring="ring-indigo-100"
          />
          <StatCard
            icon={TrendingUp}
            label="This Month"
            value={fmtCurrency(stats.thisMonth)}
            sub="Completed payments"
            iconBg="bg-emerald-100 text-emerald-600"
            trend={8}
            grad="from-emerald-500 to-teal-500"
            ring="ring-emerald-100"
          />
          <StatCard
            icon={Clock}
            label="Pending"
            value={fmtCurrency(stats.pendingAmt)}
            sub={`${stats.pendingCount} payments`}
            iconBg="bg-amber-100 text-amber-600"
            grad="from-amber-500 to-orange-500"
            ring="ring-amber-100"
          />
          <StatCard
            icon={RefreshCw}
            label="Refunded"
            value={fmtCurrency(stats.refundedAmt)}
            sub={`${stats.failedCount} failed`}
            iconBg="bg-rose-100 text-rose-600"
            grad="from-rose-500 to-pink-500"
            ring="ring-rose-100"
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by student, teacher, reference, or description..."
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
            <SelectFilter
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as any)}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "completed", label: "Completed" },
                { value: "pending", label: "Pending" },
                { value: "failed", label: "Failed" },
                { value: "refunded", label: "Refunded" },
              ]}
            />
            <SelectFilter
              value={methodFilter}
              onChange={(v) => setMethodFilter(v as any)}
              options={[
                { value: "all", label: "All Methods" },
                { value: "card", label: "Credit Card" },
                { value: "bank", label: "Bank Transfer" },
                { value: "paypal", label: "PayPal" },
                { value: "cash", label: "Cash" },
              ]}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Reference
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Student
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">
                    Teacher
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">
                    Method
                  </th>
                  <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">
                    Date
                  </th>
                  <th className="px-5 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-center py-12 text-slate-400 text-sm"
                    >
                      Loading payments...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-center py-12 text-slate-400 text-sm"
                    >
                      No payments found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => {
                    const sc = STATUS_CFG[p.status];
                    const mc = METHOD_CFG[p.method];
                    const MethodIcon = mc.icon;
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {p.reference || `PAY-${p.id.slice(0, 8)}`}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0",
                                getAvatarColor(p.student_name),
                              )}
                            >
                              {p.student_name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">
                                {p.student_name}
                              </p>
                              <p className="text-xs text-slate-400">
                                {p.student_email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          <span className="text-slate-600 text-sm">
                            {p.teacher_name}
                          </span>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            <MethodIcon className={cn("w-4 h-4", mc.color)} />
                            <span className="text-slate-500 text-sm">
                              {mc.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="font-bold text-slate-900">
                            {fmtCurrency(p.amount)}
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
                          <span className="text-slate-400 text-sm">
                            {format(new Date(p.payment_date), "MMM d, yyyy")}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => setSelected(p)}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
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
                {filtered.length} of {payments.length} payments
              </span>
              <span className="text-xs font-semibold text-slate-700">
                Total:{" "}
                {fmtCurrency(
                  filtered.reduce(
                    (s, p) => s + (p.status === "completed" ? p.amount : 0),
                    0,
                  ),
                )}{" "}
                collected
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Payment Details
                </h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {selected.reference || `PAY-${selected.id.slice(0, 8)}`}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {[
                ["Student", selected.student_name],
                ["Email", selected.student_email],
                ["Teacher", selected.teacher_name],
                ["Amount", fmtCurrency(selected.amount)],
                ["Method", METHOD_CFG[selected.method].label],
                ["Date", format(new Date(selected.payment_date), "MMMM d, yyyy")],
                ["Description", selected.description],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-start">
                  <span className="text-sm text-slate-500">{k}</span>
                  <span className="text-sm font-semibold text-slate-800 text-right max-w-[60%]">
                    {v}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Status</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
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
          </div>
        </div>
      )}

      {/* Register Payment Modal */}
      {showRegister && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowRegister(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Register Payment</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select teacher, then student, and save payment details
                </p>
              </div>
              <button
                onClick={() => setShowRegister(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePayment} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Teacher
                  </label>
                  <select
                    value={form.teacher_id}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        teacher_id: e.target.value,
                        student_id: "",
                      }))
                    }
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white"
                    required
                  >
                    <option value="">Select teacher</option>
                    {teacherOptions.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Student
                  </label>
                  <select
                    value={form.student_id}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, student_id: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white disabled:bg-slate-50 disabled:text-slate-400"
                    required
                    disabled={!form.teacher_id}
                  >
                    <option value="">
                      {form.teacher_id ? "Select student" : "Select teacher first"}
                    </option>
                    {studentsForTeacher.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} ({student.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Amount
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={form.payment_date}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, payment_date: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Method
                  </label>
                  <select
                    value={form.method}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        method: e.target.value as PaymentMethod,
                      }))
                    }
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white"
                  >
                    <option value="bank">Bank Transfer</option>
                    <option value="card">Credit Card</option>
                    <option value="paypal">PayPal</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        status: e.target.value as PaymentStatus,
                      }))
                    }
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white"
                  >
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Currency
                  </label>
                  <input
                    value={form.currency}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        currency: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    placeholder="USD"
                    maxLength={5}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Reference
                  </label>
                  <input
                    value={form.reference}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, reference: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    placeholder="Optional payment reference"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Description
                  </label>
                  <input
                    value={form.description}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    placeholder="What is this payment for?"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegister(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconBg,
  trend,
  grad,
  ring,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  iconBg: string;
  trend?: number;
  grad: string;
  ring: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
      <div className={cn("h-0.5 bg-gradient-to-r", grad)} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className={cn("p-2.5 rounded-xl ring-4 inline-flex", iconBg, ring)}>
            <Icon className="w-5 h-5" />
          </div>
          {trend !== undefined && (
            <span className="flex items-center gap-0.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-0.5">
              <ArrowUpRight className="w-3 h-3" />
              {trend}%
            </span>
          )}
        </div>
        <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
        <p className="text-sm font-medium text-slate-700 mt-0.5">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function SelectFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 bg-white text-slate-700 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  );
}

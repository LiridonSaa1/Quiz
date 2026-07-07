import React, { useEffect, useState, useCallback } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import { authFetch, apiUrl } from "../../lib/apiUrl";
import { toast } from "sonner";
import {
  Users, CheckCircle2, XCircle, Search, ChevronLeft, ChevronRight,
  Plus, Trash2, RefreshCw, Euro, Calendar, Bell,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { format, addMonths, subMonths } from "date-fns";

interface StudentRow {
  id: string;
  name: string;
  email: string;
  teacher_id: string | null;
  teacher_name: string;
  paid: boolean;
  payment: { id: string; amount: number; notes: string; paid_at: string } | null;
}

export default function AdminStudentPayments() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [formAmount, setFormAmount] = useState("0");
  const [formNotes, setFormNotes] = useState("");
  const [sendInvoice, setSendInvoice] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(apiUrl(`/api/admin/student-payments?month=${currentMonth}`));
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed");
      setStudents(json.students || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { load(); }, [load]);

  const displayMonth = (() => {
    const [yr, mo] = currentMonth.split("-");
    return new Date(Number(yr), Number(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
  })();

  const changeMonth = (dir: 1 | -1) => {
    const [yr, mo] = currentMonth.split("-").map(Number);
    const d = new Date(yr, mo - 1 + dir, 1);
    setCurrentMonth(d.toISOString().slice(0, 7));
  };

  const openMarkPaid = (s: StudentRow) => {
    setSelectedStudent(s);
    setFormAmount(s.payment?.amount?.toString() || "0");
    setFormNotes(s.payment?.notes || "");
    setSendInvoice(true);
    setShowModal(true);
  };

  const handleMarkPaid = async () => {
    if (!selectedStudent) return;
    setSubmitting(selectedStudent.id);
    try {
      const res = await authFetch(apiUrl("/api/admin/student-payments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: selectedStudent.id,
          month_year: currentMonth,
          amount: Number(formAmount) || 0,
          notes: formNotes,
          send_invoice: sendInvoice,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed");
      toast.success(
        json.invoice_sent
          ? `Pagesa e ${selectedStudent.name} u shënua! Fatura u dërgua me email.`
          : `Pagesa e ${selectedStudent.name} u shënua!`
      );
      setShowModal(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSubmitting(null);
    }
  };

  const handleRemovePayment = async (s: StudentRow) => {
    if (!s.payment) return;
    if (!confirm(`Fshi pagesën e ${s.name} për ${displayMonth}?`)) return;
    setSubmitting(s.id);
    try {
      const res = await authFetch(apiUrl(`/api/admin/student-payments/${s.payment.id}`), { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed");
      toast.success("Pagesa u fshi");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSubmitting(null);
    }
  };

  const filtered = students.filter((s) => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()) || s.teacher_name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "paid" && s.paid) || (filter === "unpaid" && !s.paid);
    return matchSearch && matchFilter;
  });

  const paidCount = students.filter((s) => s.paid).length;
  const unpaidCount = students.length - paidCount;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Pagesat Mujore</h1>
            <p className="text-slate-500 text-sm mt-1">Menaxhoni pagesat e studentëve për çdo muaj</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Rifresko
          </button>
          <button
            onClick={async () => {
              setSendingReminders(true);
              try {
                const res = await authFetch(apiUrl("/api/admin/student-payments/send-reminders"), { method: "POST" });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || "Failed");
                toast.success(`Kujtuese dërguar: ${json.sent} studentëve (${json.skipped} anashkaluar)`);
              } catch (e: any) {
                toast.error(e.message || "Dërgimi dështoi");
              } finally {
                setSendingReminders(false);
              }
            }}
            disabled={sendingReminders}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50"
          >
            <Bell className="w-4 h-4" />
            {sendingReminders ? "Duke dërguar..." : "Dërgo Kujtues"}
          </button>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm w-fit">
          <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-violet-500" />
            <span className="font-semibold text-slate-800 min-w-[160px] text-center">{displayMonth}</span>
          </div>
          <button onClick={() => changeMonth(1)} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">Gjithsej Studentë</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{students.length}</p>
          </div>
          <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-emerald-600 font-medium">Kanë Paguar</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{paidCount}</p>
          </div>
          <div className="bg-white border border-red-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-red-600 font-medium">Nuk Kanë Paguar</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{unpaidCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kërko student ose mësues..."
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>
          <div className="flex gap-2">
            {(["all", "paid", "unpaid"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn("px-4 py-2 rounded-xl text-sm font-medium transition", filter === f ? "bg-violet-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50")}
              >
                {f === "all" ? "Të Gjithë" : f === "paid" ? "Paguar" : "Pa Paguar"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-slate-400">Duke ngarkuar...</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-slate-400">Nuk u gjetën studentë</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Studenti</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Mësuesi</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Statusi</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Shuma</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Veprimet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.email}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{s.teacher_name}</td>
                      <td className="px-5 py-4">
                        {s.paid ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Paguar
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                            <XCircle className="w-3 h-3" /> Pa Paguar
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {s.payment ? (
                          <span className="font-semibold">{s.payment.amount > 0 ? `€${s.payment.amount}` : "—"}</span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">
                        {s.payment?.paid_at ? format(new Date(s.payment.paid_at), "dd/MM/yyyy") : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {s.paid ? (
                            <button
                              onClick={() => handleRemovePayment(s)}
                              disabled={submitting === s.id}
                              className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition disabled:opacity-50"
                              title="Fshi pagesën"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => openMarkPaid(s)}
                              disabled={submitting === s.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                              <Plus className="w-3.5 h-3.5" /> Shëno Paguar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Mark paid modal */}
      {showModal && selectedStudent && (
        <div className="fixed inset-0 lg:left-60 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Shëno Pagesën</h2>
            <p className="text-sm text-slate-500 mb-5">
              {selectedStudent.name} — {displayMonth}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Shuma (€)</label>
                <input
                  type="number"
                  min="0"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Shënime (opsionale)</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                  placeholder="Shënime..."
                />
              </div>
            </div>
              <label className="flex items-center gap-3 cursor-pointer select-none p-3 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition">
                <input
                  type="checkbox"
                  checked={sendInvoice}
                  onChange={(e) => setSendInvoice(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">Dërgo faturë me email</p>
                  <p className="text-xs text-slate-500">Studenti do të marrë faturën e pagesës direkt në email</p>
                </div>
              </label>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Anulo
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={!!submitting}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {submitting ? "Duke ruajtur..." : "Konfirmo Pagesën"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

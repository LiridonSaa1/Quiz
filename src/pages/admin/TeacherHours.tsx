import React, { useEffect, useState, useCallback } from "react";
import AdminLayout from "../../components/layout/AdminLayout";
import { authFetch, apiUrl } from "../../lib/apiUrl";
import { toast } from "sonner";
import {
  Clock, Euro, ChevronLeft, ChevronRight, Plus, Trash2,
  RefreshCw, FileText, Calendar, Download, Pencil, X, Check,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { format } from "date-fns";

interface HourRow {
  id: string;
  teacher_id: string;
  teacher_name: string;
  work_date: string;
  hours: number;
  rate_per_hour: number;
  notes: string;
  total: number;
}

interface TeacherOption {
  id: string;
  display_name: string;
  email: string;
}

interface Summary {
  teacher_id: string;
  teacher_name: string;
  total_hours: number;
  total_amount: number;
}

export default function TeacherHours() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<HourRow[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeacher, setFilterTeacher] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceTeacher, setInvoiceTeacher] = useState("");
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Add form
  const [addTeacher, setAddTeacher] = useState("");
  const [addDate, setAddDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [addHours, setAddHours] = useState("1");
  const [addRate, setAddRate] = useState("40");
  const [addNotes, setAddNotes] = useState("");

  const displayMonth = (() => {
    const [yr, mo] = currentMonth.split("-");
    return new Date(Number(yr), Number(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
  })();

  const monthStart = (() => {
    const [yr, mo] = currentMonth.split("-");
    return `${yr}-${mo}-01`;
  })();
  const monthEnd = (() => {
    const [yr, mo] = currentMonth.split("-");
    return new Date(Number(yr), Number(mo), 0).toISOString().slice(0, 10);
  })();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/admin/teacher-hours?month=${currentMonth}${filterTeacher ? `&teacher_id=${filterTeacher}` : ""}`;
      const res = await authFetch(apiUrl(url));
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed");
      setRows(json.hours || []);
      setSummary(json.summary || []);
      setTeachers(json.teachers || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [currentMonth, filterTeacher]);

  useEffect(() => { load(); }, [load]);

  const changeMonth = (dir: 1 | -1) => {
    const [yr, mo] = currentMonth.split("-").map(Number);
    const d = new Date(yr, mo - 1 + dir, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    setCurrentMonth(`${y}-${m}`);
  };

  const handleAdd = async () => {
    if (!addTeacher) return toast.error("Zgjidh mësuesin");
    if (!addDate) return toast.error("Zgjidh datën");
    if (addDate < monthStart || addDate > monthEnd)
      return toast.error(`Data duhet të jetë brenda ${displayMonth}`);
    if (!Number(addHours)) return toast.error("Ore duhet të jetë > 0");
    setSubmitting(true);
    try {
      const res = await authFetch(apiUrl("/api/admin/teacher-hours"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacher_id: addTeacher, work_date: addDate, hours: Number(addHours), rate_per_hour: Number(addRate) || 40, notes: addNotes }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed");
      toast.success("Orët u regjistruan!");
      setShowAddModal(false);
      setAddHours("1");
      setAddNotes("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (r: HourRow) => {
    setEditingId(r.id);
    setEditHours(r.hours.toString());
    setEditRate(r.rate_per_hour.toString());
    setEditNotes(r.notes || "");
  };

  const saveEdit = async (id: string) => {
    setSubmitting(true);
    try {
      const res = await authFetch(apiUrl(`/api/admin/teacher-hours/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: Number(editHours), rate_per_hour: Number(editRate), notes: editNotes }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed");
      toast.success("U përditësua");
      setEditingId(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Fshi këtë regjistrim?")) return;
    try {
      const res = await authFetch(apiUrl(`/api/admin/teacher-hours/${id}`), { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed");
      toast.success("U fshi");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const openInvoice = async () => {
    if (!invoiceTeacher) return toast.error("Zgjidh mësuesin");
    setInvoiceLoading(true);
    try {
      const res = await authFetch(apiUrl(`/api/admin/teacher-hours/invoice?teacher_id=${invoiceTeacher}&month=${currentMonth}`));
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed");
      setInvoiceData(json);
      setShowInvoice(true);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setInvoiceLoading(false);
    }
  };

  const printInvoice = () => { window.print(); };

  const totalHours = rows.reduce((s, r) => s + Number(r.hours), 0);
  const totalAmount = rows.reduce((s, r) => s + Number(r.total), 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Orët e Mësuesve</h1>
            <p className="text-slate-500 text-sm mt-1">Regjistroni orët ditore dhe gjeneroni fatura mujore</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAddDate(monthStart); setShowAddModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition"
            >
              <Plus className="w-4 h-4" /> Shto Orë
            </button>
            <button
              onClick={load}
              className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
            >
              <RefreshCw className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Month + filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-sm">
            <button onClick={() => changeMonth(-1)} className="p-1 rounded-lg hover:bg-slate-100 transition">
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-violet-500" />
              <span className="font-semibold text-slate-800 min-w-[150px] text-center text-sm">{displayMonth}</span>
            </div>
            <button onClick={() => changeMonth(1)} className="p-1 rounded-lg hover:bg-slate-100 transition">
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          <select
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
          >
            <option value="">Të gjithë mësuesit</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.display_name || t.email}</option>
            ))}
          </select>

          {/* Invoice generator */}
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={invoiceTeacher}
              onChange={(e) => setInvoiceTeacher(e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
            >
              <option value="">Zgjidh mësuesin për faturë</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.display_name || t.email}</option>
              ))}
            </select>
            <button
              onClick={openInvoice}
              disabled={invoiceLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              {invoiceLoading ? "Duke ngarkuar..." : "Gjenero Faturë"}
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {summary.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summary.map((s) => (
              <div key={s.teacher_id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <p className="font-semibold text-slate-800 text-sm mb-3">{s.teacher_name}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">{Number(s.total_hours).toFixed(1)} orë</span>
                  </div>
                  <div className="flex items-center gap-1 font-bold text-emerald-600">
                    <span className="text-lg">€{Number(s.total_amount).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Totals */}
        <div className="flex gap-4">
          <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-3 flex items-center gap-3">
            <Clock className="w-5 h-5 text-violet-500" />
            <div>
              <p className="text-xs text-violet-500 font-medium">Gjithsej Orë</p>
              <p className="text-xl font-bold text-violet-700">{totalHours.toFixed(1)}</p>
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 flex items-center gap-3">
            <Euro className="w-5 h-5 text-emerald-500" />
            <div>
              <p className="text-xs text-emerald-500 font-medium">Gjithsej Shuma</p>
              <p className="text-xl font-bold text-emerald-700">€{totalAmount.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-slate-400">Duke ngarkuar...</div>
          ) : rows.length === 0 ? (
            <div className="py-20 text-center text-slate-400">Nuk ka regjistrime për këtë periudhë</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Mësuesi</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Orë</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Çmimi/Orë</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Totali</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Shënime</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Veprimet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{r.teacher_name}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{format(new Date(r.work_date), "dd/MM/yyyy")}</td>
                      <td className="px-5 py-3">
                        {editingId === r.id ? (
                          <input type="number" min="0.5" step="0.5" value={editHours} onChange={(e) => setEditHours(e.target.value)}
                            className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm" />
                        ) : (
                          <span className="text-sm text-slate-800">{r.hours}h</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {editingId === r.id ? (
                          <input type="number" min="1" value={editRate} onChange={(e) => setEditRate(e.target.value)}
                            className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm" />
                        ) : (
                          <span className="text-sm text-slate-600">€{r.rate_per_hour}/h</span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold text-emerald-600 text-sm">€{Number(r.total).toFixed(2)}</td>
                      <td className="px-5 py-3">
                        {editingId === r.id ? (
                          <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                            className="w-32 px-2 py-1 border border-slate-200 rounded-lg text-sm" />
                        ) : (
                          <span className="text-xs text-slate-400">{r.notes || "—"}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {editingId === r.id ? (
                            <>
                              <button onClick={() => saveEdit(r.id)} disabled={submitting}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingId(null)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(r)} className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600 transition">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
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

      {/* Add hours modal */}
      {showAddModal && (
        <div className="fixed inset-0 lg:left-60 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-5">Shto Orë Pune</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mësuesi</label>
                <select value={addTeacher} onChange={(e) => setAddTeacher(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                  <option value="">Zgjidh mësuesin...</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.display_name || t.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Data <span className="text-xs text-violet-500 font-normal">({displayMonth})</span>
                </label>
                <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)}
                  min={monthStart} max={monthEnd}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Orë</label>
                  <input type="number" min="0.5" step="0.5" value={addHours} onChange={(e) => setAddHours(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">€ / Orë</label>
                  <input type="number" min="1" value={addRate} onChange={(e) => setAddRate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500">
                  Totali: <span className="font-bold text-emerald-600">€{((Number(addHours) || 0) * (Number(addRate) || 40)).toFixed(2)}</span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Shënime</label>
                <input value={addNotes} onChange={(e) => setAddNotes(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="Opsionale..." />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                Anulo
              </button>
              <button onClick={handleAdd} disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition disabled:opacity-50">
                {submitting ? "Duke ruajtur..." : "Shto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice modal */}
      {showInvoice && invoiceData && (
        <div className="fixed inset-0 lg:left-60 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden">

            {/* Toolbar (hidden on print) */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 print:hidden">
              <span className="text-sm font-medium text-slate-500">Pamja e Faturës</span>
              <div className="flex gap-2">
                <button onClick={printInvoice}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition">
                  <Download className="w-4 h-4" /> Printo / Shkarko PDF
                </button>
                <button onClick={() => setShowInvoice(false)}
                  className="p-2 rounded-xl hover:bg-slate-100 transition text-slate-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Invoice body */}
            <div className="p-8">

              {/* Header row: brand left, badge right */}
              <div className="flex items-start justify-between mb-8">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-lg font-bold text-slate-900">{invoiceData.business?.name || "QuizMaster"}</span>
                  </div>
                  {invoiceData.business?.website && (
                    <p className="text-xs text-slate-400 ml-11">{invoiceData.business.website}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 bg-violet-100 text-violet-700 text-xs font-bold rounded-full uppercase tracking-wider mb-2">
                    Faturë
                  </span>
                  <p className="text-xs text-slate-400">
                    Nr. <span className="font-semibold text-slate-700">#{invoiceData.rows?.[0]?.id?.slice(0,8).toUpperCase() ?? "—"}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Gjeneruar: <span className="font-medium text-slate-600">{format(new Date(), "dd/MM/yyyy")}</span>
                  </p>
                </div>
              </div>

              {/* From / To */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Nga</p>
                  <p className="font-bold text-slate-800">{invoiceData.business?.name || "QuizMaster Academy"}</p>
                  {invoiceData.business?.email && (
                    <p className="text-sm text-slate-500 mt-0.5">{invoiceData.business.email}</p>
                  )}
                  {invoiceData.business?.phone && (
                    <p className="text-sm text-slate-500">{invoiceData.business.phone}</p>
                  )}
                  {invoiceData.business?.address && (
                    <p className="text-sm text-slate-500">{invoiceData.business.address}</p>
                  )}
                </div>
                <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-2">Për</p>
                  <p className="font-bold text-slate-800">{invoiceData.teacher?.display_name || invoiceData.teacher?.email}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{invoiceData.teacher?.email}</p>
                  <p className="text-sm text-slate-500">Mësues</p>
                </div>
              </div>

              {/* Period */}
              <div className="flex items-center gap-2 mb-5">
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-700">
                    Periudha: {(() => {
                      const [yr, mo] = invoiceData.month_year.split("-");
                      return new Date(Number(yr), Number(mo) - 1, 1).toLocaleString("sq-AL", { month: "long", year: "numeric" });
                    })()}
                  </span>
                </div>
              </div>

              {/* Table or empty */}
              {invoiceData.rows?.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p>Nuk ka regjistrime për këtë muaj</p>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl overflow-hidden border border-slate-200 mb-6">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Data</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Shënime</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider">Orë</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider">€/Orë</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider">Totali</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(invoiceData.rows || []).map((r: any, i: number) => (
                          <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                            <td className="px-4 py-3 text-sm text-slate-700 font-medium">{format(new Date(r.work_date), "dd/MM/yyyy")}</td>
                            <td className="px-4 py-3 text-sm text-slate-500">{r.notes || "—"}</td>
                            <td className="px-4 py-3 text-sm text-slate-700 text-right font-medium">{Number(r.hours).toFixed(1)}h</td>
                            <td className="px-4 py-3 text-sm text-slate-500 text-right">€{Number(r.rate_per_hour).toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">€{Number(r.total).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals block */}
                  <div className="flex justify-end">
                    <div className="w-72 space-y-2">
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Orë totale</span>
                        <span className="font-semibold">{Number(invoiceData.total_hours).toFixed(1)} orë</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Numri i regjistrimeve</span>
                        <span className="font-semibold">{invoiceData.rows?.length}</span>
                      </div>
                      <div className="border-t border-slate-200 pt-3 mt-2 flex justify-between items-center">
                        <span className="text-base font-bold text-slate-900">Shuma Totale</span>
                        <span className="text-2xl font-bold text-emerald-600">€{Number(invoiceData.total_amount).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Footer */}
              <div className="mt-10 pt-6 border-t border-dashed border-slate-200 text-center">
                <p className="text-xs text-slate-400">Faleminderit për punën tuaj të dedikuar.</p>
                <p className="text-xs text-slate-300 mt-1">{invoiceData.business?.name || "QuizMaster"} · {format(new Date(), "yyyy")}</p>
              </div>

            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

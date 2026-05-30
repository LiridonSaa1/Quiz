import React, { useEffect, useState, useCallback } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings, BookOpen, Loader2, CheckCircle2, Shield,
  ArrowRightLeft, User, Search, X, ChevronRight, AlertTriangle,
  RefreshCw, Clock, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { authFetch, readApiError } from '../../lib/apiUrl';

interface TransferRow {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  from_teacher_id: string;
  from_teacher_name: string;
  to_teacher_id: string;
  to_teacher_name: string;
  transferred_by: string;
  transferred_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface TeacherSettings {
  headwayImportEnabled: boolean;
}

interface StudentRow {
  id: string;
  display_name: string | null;
  email: string;
  status: string;
}

interface TeacherRow {
  id: string;
  display_name: string | null;
  email: string;
}

const DEFAULT_SETTINGS: TeacherSettings = { headwayImportEnabled: true };

function avatar(name: string | null, email: string) {
  const initials = (name || email || '?').trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return initials;
}

export default function TeacherSettings() {
  const [settings, setSettings] = useState<TeacherSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState('');

  // Students
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Teachers (for transfer target)
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);

  // Transfer modal
  const [transferStudent, setTransferStudent] = useState<StudentRow | null>(null);
  const [targetTeacherId, setTargetTeacherId] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Confirm modal
  const [showConfirm, setShowConfirm] = useState(false);

  // Transfer history
  const [history, setHistory] = useState<TransferRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const uid = session.user.id;
      setUserId(uid);
      try {
        const { data } = await supabase
          .from('platform_config')
          .select('value')
          .eq('key', `teacher_settings:${uid}`)
          .maybeSingle();
        if (data?.value) setSettings({ ...DEFAULT_SETTINGS, ...data.value });
      } catch { /* use defaults */ }
      setLoading(false);
      loadStudents(uid);
      loadTeachers();
    };
    load();
  }, []);

  const loadStudents = useCallback(async (uid: string) => {
    setStudentsLoading(true);
    try {
      const res = await authFetch(`/api/teacher/students?userId=${encodeURIComponent(uid)}`);
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();
      const rows: StudentRow[] = (json.students || []).map((s: any) => ({
        id: s.id,
        display_name: s.display_name || s.name || null,
        email: s.email || '',
        status: s.status || 'active',
      }));
      setStudents(rows);
    } catch (e: any) {
      console.error('Failed to load students', e);
    }
    setStudentsLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await authFetch('/api/teacher/transfer-history?limit=50');
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();
      setHistory(json.transfers || []);
    } catch (e: any) {
      console.error('Failed to load transfer history', e);
    }
    setHistoryLoading(false);
    setHistoryLoaded(true);
  }, []);

  const loadTeachers = useCallback(async () => {
    setTeachersLoading(true);
    try {
      const res = await authFetch('/api/teacher/peer-teachers');
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();
      setTeachers((json.teachers || []).map((t: any) => ({
        id: t.id,
        display_name: t.display_name || null,
        email: t.email || '',
      })));
    } catch (e: any) {
      console.error('Failed to load teachers', e);
    }
    setTeachersLoading(false);
  }, []);

  const saveSettings = async (patch: Partial<TeacherSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_config')
        .upsert({ key: `teacher_settings:${userId}`, value: next }, { onConflict: 'key' });
      if (error) throw error;
      toast.success('Settings saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save settings');
      setSettings(settings);
    }
    setSaving(false);
  };

  const openTransferModal = (student: StudentRow) => {
    setTransferStudent(student);
    setTargetTeacherId('');
    setTeacherSearch('');
    setShowConfirm(false);
  };

  const closeTransferModal = () => {
    setTransferStudent(null);
    setTargetTeacherId('');
    setTeacherSearch('');
    setShowConfirm(false);
  };

  const handleTransfer = async () => {
    if (!transferStudent || !targetTeacherId) return;
    setTransferring(true);
    try {
      const res = await authFetch(`/api/teacher/students/${encodeURIComponent(transferStudent.id)}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ targetTeacherId }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const json = await res.json();
      toast.success(json.message || 'Student transferred successfully');
      setStudents(prev => prev.filter(s => s.id !== transferStudent.id));
      closeTransferModal();
      // Refresh history so the new entry appears immediately
      if (historyLoaded) loadHistory();
    } catch (e: any) {
      toast.error(e?.message || 'Transfer failed');
    }
    setTransferring(false);
  };

  const filteredStudents = students.filter(s => {
    const q = studentSearch.toLowerCase();
    return !q || (s.display_name || '').toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  const filteredTeachers = teachers.filter(t => {
    const q = teacherSearch.toLowerCase();
    return !q || (t.display_name || '').toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
  });

  const targetTeacher = teachers.find(t => t.id === targetTeacherId);

  return (
    <TeacherLayout>
      <div
        className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7"
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        {/* Header */}
        <div
          className="relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%)' }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          />
          <div className="relative px-6 sm:px-8 lg:px-10 py-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center shadow-xl">
                <Settings className="w-6 h-6 text-violet-200" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">Teacher Settings</h1>
                <p className="text-violet-200 text-sm mt-1">Manage your preferences and student roster</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 lg:px-10 py-8 max-w-3xl space-y-6">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Headway Toggle ── */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Headway Resources</h2>
                    <p className="text-xs text-slate-500">Control access to OUP Headway content importing</p>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <label className={cn(
                    'flex items-center justify-between gap-4 cursor-pointer rounded-2xl border px-5 py-4 transition-all select-none',
                    settings.headwayImportEnabled ? 'border-violet-200 bg-violet-50/60' : 'border-slate-200 bg-slate-50/60'
                  )}>
                    <div className="flex items-start gap-3">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        settings.headwayImportEnabled ? 'bg-violet-100' : 'bg-slate-100')}>
                        <Shield className={cn('w-4 h-4', settings.headwayImportEnabled ? 'text-violet-600' : 'text-slate-400')} />
                      </div>
                      <div>
                        <p className={cn('text-sm font-semibold leading-tight', settings.headwayImportEnabled ? 'text-violet-800' : 'text-slate-700')}>
                          Allow Headway module & lesson import
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          When enabled, you can import content from OUP Headway levels into your courses.
                        </p>
                        <div className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold mt-2',
                          settings.headwayImportEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500')}>
                          {settings.headwayImportEnabled
                            ? <><CheckCircle2 className="w-3 h-3" /> Enabled</>
                            : <><Shield className="w-3 h-3" /> Disabled</>}
                        </div>
                      </div>
                    </div>
                    <input type="checkbox" checked={settings.headwayImportEnabled}
                      onChange={e => saveSettings({ headwayImportEnabled: e.target.checked })} className="sr-only" />
                    <div onClick={() => saveSettings({ headwayImportEnabled: !settings.headwayImportEnabled })}
                      className={cn('relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 cursor-pointer',
                        settings.headwayImportEnabled ? 'bg-violet-500' : 'bg-slate-300')}>
                      {saving && (
                        <div className="absolute inset-0 rounded-full bg-white/30 flex items-center justify-center">
                          <Loader2 className="w-3 h-3 text-white animate-spin" />
                        </div>
                      )}
                      <div className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                        settings.headwayImportEnabled ? 'translate-x-7' : 'translate-x-1')} />
                    </div>
                  </label>
                </div>
              </motion.div>

              {/* ── Student Transfer ── */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                      <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Transfer Students</h2>
                      <p className="text-xs text-slate-500">Move a student from your roster to another teacher</p>
                    </div>
                  </div>
                  <button
                    onClick={() => userId && loadStudents(userId)}
                    disabled={studentsLoading}
                    className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                    title="Refresh student list"
                  >
                    <RefreshCw className={cn('w-4 h-4', studentsLoading && 'animate-spin')} />
                  </button>
                </div>

                <div className="p-6">
                  {/* Search */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      placeholder="Search students by name or email…"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                    />
                    {studentSearch && (
                      <button onClick={() => setStudentSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {studentsLoading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="text-center py-10">
                      <User className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-500">
                        {students.length === 0 ? 'No students in your roster' : 'No students match your search'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {students.length === 0 ? 'Students linked to your account will appear here' : 'Try a different name or email'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredStudents.map((s) => {
                        const initials = avatar(s.display_name, s.email);
                        const colors = [
                          'from-violet-400 to-indigo-500',
                          'from-emerald-400 to-teal-500',
                          'from-rose-400 to-pink-500',
                          'from-amber-400 to-orange-500',
                          'from-sky-400 to-blue-500',
                        ];
                        const color = colors[(s.id || '').charCodeAt(0) % colors.length];
                        return (
                          <motion.div
                            key={s.id}
                            layout
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-all group"
                          >
                            <div className={cn(
                              'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm',
                              color
                            )}>
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {s.display_name || s.email}
                              </p>
                              {s.display_name && (
                                <p className="text-xs text-slate-400 truncate">{s.email}</p>
                              )}
                            </div>
                            <div className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0',
                              s.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                            )}>
                              {s.status}
                            </div>
                            <button
                              onClick={() => openTransferModal(s)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all shrink-0 opacity-0 group-hover:opacity-100"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              Transfer
                            </button>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}

                  {filteredStudents.length > 0 && (
                    <p className="text-xs text-slate-400 mt-3 text-center">
                      {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''} · hover a row to transfer
                    </p>
                  )}
                </div>
              </motion.div>

              {/* ── Transfer History ── */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = !showHistory;
                    setShowHistory(next);
                    if (next && !historyLoaded) loadHistory();
                  }}
                  className="w-full px-6 py-4 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                      <History className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="text-left">
                      <h2 className="text-sm font-bold text-slate-900">Transfer History</h2>
                      <p className="text-xs text-slate-500">Your sent and received student transfers</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {history.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                        {history.length}
                      </span>
                    )}
                    <ChevronRight className={cn('w-4 h-4 text-slate-400 transition-transform', showHistory && 'rotate-90')} />
                  </div>
                </button>

                <AnimatePresence>
                  {showHistory && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-slate-100"
                    >
                      {historyLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                        </div>
                      ) : history.length === 0 ? (
                        <div className="py-10 text-center px-6">
                          <ArrowRightLeft className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                          <p className="text-sm text-slate-400">No transfers yet</p>
                          <p className="text-xs text-slate-300 mt-1">Transfers you send or receive will appear here</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {history.map((tr) => {
                            const isSent = tr.from_teacher_id === userId;
                            const initials = (tr.student_name || tr.student_email || '?').trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                            const colors = ['from-violet-400 to-indigo-500', 'from-emerald-400 to-teal-500', 'from-rose-400 to-pink-500', 'from-amber-400 to-orange-500', 'from-sky-400 to-blue-500'];
                            const color = colors[(tr.student_id || '').charCodeAt(0) % colors.length];

                            return (
                              <div key={tr.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                                <div className={cn('w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0', color)}>
                                  {initials}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 truncate">{tr.student_name || tr.student_email}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                                      isSent ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                                      {isSent ? '↑ Sent' : '↓ Received'}
                                    </span>
                                    <span className="text-xs text-slate-400 truncate">
                                      {isSent
                                        ? `→ ${tr.to_teacher_name || 'Unknown'}`
                                        : `← ${tr.from_teacher_name || 'Unknown'}`}
                                    </span>
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className="inline-flex items-center gap-1 text-xs text-slate-400">
                                    <Clock className="w-3 h-3" />
                                    {timeAgo(tr.transferred_at)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <div className="px-5 py-2.5 bg-slate-50 text-xs text-slate-400 text-center">
                            {history.length} record{history.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </>
          )}
        </div>
      </div>

      {/* ── Transfer Modal ── */}
      <AnimatePresence>
        {transferStudent && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={closeTransferModal}
            />
            <motion.div
              className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              {/* Modal header */}
              <div
                className="px-7 pt-7 pb-5"
                style={{ background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 100%)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
                      <ArrowRightLeft className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-extrabold text-white leading-tight">Transfer Student</h2>
                      <p className="text-indigo-200 text-xs mt-0.5">
                        Moving <span className="font-bold text-white">{transferStudent.display_name || transferStudent.email}</span>
                      </p>
                    </div>
                  </div>
                  <button onClick={closeTransferModal}
                    className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors mt-0.5">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-7 space-y-5">
                {!showConfirm ? (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                        Select Target Teacher
                      </label>
                      {/* Search teachers */}
                      <div className="relative mb-3">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={teacherSearch}
                          onChange={e => setTeacherSearch(e.target.value)}
                          placeholder="Search teachers…"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      </div>

                      {teachersLoading ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                        </div>
                      ) : filteredTeachers.length === 0 ? (
                        <div className="text-center py-6">
                          <User className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                          <p className="text-sm text-slate-400">No other teachers found</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 custom-scroll">
                          {filteredTeachers.map(t => {
                            const initials = avatar(t.display_name, t.email);
                            const selected = targetTeacherId === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setTargetTeacherId(t.id)}
                                className={cn(
                                  'w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border text-left transition-all',
                                  selected
                                    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-400/30'
                                    : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50'
                                )}
                              >
                                <div className={cn(
                                  'w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0',
                                  selected ? 'bg-indigo-500' : 'bg-slate-200 text-slate-600'
                                )}>
                                  {selected ? <CheckCircle2 className="w-4 h-4" /> : initials}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={cn('text-sm font-semibold truncate', selected ? 'text-indigo-800' : 'text-slate-800')}>
                                    {t.display_name || t.email}
                                  </p>
                                  {t.display_name && (
                                    <p className="text-xs text-slate-400 truncate">{t.email}</p>
                                  )}
                                </div>
                                {selected && <ChevronRight className="w-4 h-4 text-indigo-500 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        onClick={closeTransferModal}
                        className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!targetTeacherId}
                        onClick={() => setShowConfirm(true)}
                        className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                        style={{
                          background: targetTeacherId ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : '#e2e8f0',
                          boxShadow: targetTeacherId ? '0 4px 16px rgba(79,70,229,0.3)' : 'none',
                        }}
                      >
                        Continue <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  /* Confirmation step */
                  <>
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-amber-800">Confirm Transfer</p>
                        <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                          <span className="font-semibold">{transferStudent.display_name || transferStudent.email}</span>
                          {' '}will be removed from your roster and assigned to{' '}
                          <span className="font-semibold">{targetTeacher?.display_name || targetTeacher?.email}</span>.
                          This action can be undone by transferring the student back.
                        </p>
                      </div>
                    </div>

                    {/* Transfer summary card */}
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Student</p>
                          <p className="text-sm font-bold text-slate-800">{transferStudent.display_name || transferStudent.email}</p>
                        </div>
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 shrink-0">
                          <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="flex-1 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">New Teacher</p>
                          <p className="text-sm font-bold text-indigo-700">{targetTeacher?.display_name || targetTeacher?.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowConfirm(false)}
                        className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleTransfer}
                        disabled={transferring}
                        className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"
                        style={{
                          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                          boxShadow: '0 4px 16px rgba(79,70,229,0.35)',
                        }}
                      >
                        {transferring
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Transferring…</>
                          : <><ArrowRightLeft className="w-4 h-4" /> Confirm Transfer</>}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TeacherLayout>
  );
}

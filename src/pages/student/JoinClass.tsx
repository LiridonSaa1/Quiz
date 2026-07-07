import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import StudentLayout from '../../components/layout/StudentLayout';
import { authFetch } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Users, Link2, CheckCircle2, Loader2, ArrowRight, BookOpen, Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ClassInfo {
  id: string;
  name: string;
  description?: string;
  courseName?: string;
  status: string;
  studentCount: number;
  capacity: number;
}

export default function JoinClass() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [lookupError, setLookupError] = useState('');

  useEffect(() => {
    const urlCode = searchParams.get('code');
    if (urlCode) {
      setCode(urlCode);
      handleLookup(urlCode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLookup = async (overrideCode?: string) => {
    const c = (overrideCode ?? code).trim().toUpperCase();
    if (!c) { toast.error(t('joinClass.enterCodeMsg')); return; }
    setLoading(true);
    setLookupError('');
    setClassInfo(null);
    try {
      const res = await authFetch(`/api/classes/invite/${encodeURIComponent(c)}`);
      const json = await res.json();
      if (!res.ok || !json.success) { setLookupError(json.error || t('joinClass.enterCodeMsg')); return; }
      setClassInfo(json.class);
    } catch { setLookupError(t('common.error')); }
    finally { setLoading(false); }
  };

  const handleJoin = async () => {
    if (!classInfo) return;
    setJoining(true);
    try {
      const res = await authFetch('/api/student/classes/join-by-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) { toast.error(json.error || t('common.error')); return; }
      setJoined(true);
      toast.success(t('joinClass.redirecting', { name: classInfo.name }));
      setTimeout(() => navigate('/student/courses'), 1800);
    } catch { toast.error(t('common.error')); }
    finally { setJoining(false); }
  };

  return (
    <StudentLayout>
      <div className="min-h-full bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6">
        <div className="mx-auto max-w-lg pt-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-200">
              <Link2 className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900">{t('joinClass.joinClassTitle')}</h1>
            <p className="mt-2 text-slate-500">{t('joinClass.enterInviteCode')}</p>
          </div>

          <div className="rounded-3xl border border-indigo-100 bg-white p-8 shadow-xl shadow-indigo-100/40">
            {!joined ? (
              <>
                <div className="mb-6">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">{t('joinClass.inviteCode')}</label>
                  <input
                    value={code}
                    onChange={e => { setCode(e.target.value.toUpperCase()); setClassInfo(null); setLookupError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleLookup()}
                    placeholder="e.g. ABCD1234"
                    maxLength={12}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-center font-mono text-2xl font-bold uppercase tracking-widest text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  {lookupError && (
                    <p className="mt-2 text-center text-sm text-red-500">{lookupError}</p>
                  )}
                </div>

                {!classInfo && (
                  <button
                    onClick={() => handleLookup()}
                    disabled={loading || !code.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:shadow-xl disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {loading ? t('joinClass.lookingUp') : t('joinClass.findClass')}
                  </button>
                )}

                {classInfo && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                          <Users className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-slate-900">{classInfo.name}</h3>
                          {classInfo.description && <p className="mt-0.5 text-sm text-slate-500">{classInfo.description}</p>}
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                            {classInfo.courseName && (
                              <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{classInfo.courseName}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />{classInfo.studentCount} / {classInfo.capacity} students
                            </span>
                            <span className={cn(
                              'rounded-full px-2 py-0.5 font-semibold capitalize',
                              classInfo.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            )}>{classInfo.status}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => { setClassInfo(null); setCode(''); }}
                        className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition">
                        {t('joinClass.cancelBtn')}
                      </button>
                      <button onClick={handleJoin} disabled={joining}
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 hover:shadow-xl transition disabled:opacity-50">
                        {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                        {joining ? t('joinClass.joiningBtn') : t('joinClass.joinClassBtn')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-6 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-black text-slate-900">{t('joinClass.youreIn')}</h2>
                <p className="mt-2 text-slate-500">{t('joinClass.redirecting', { name: classInfo?.name || '' })}</p>
              </motion.div>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            <p className="font-semibold text-slate-700 mb-1">{t('joinClass.howToGetCode')}</p>
            <p>{t('joinClass.askTeacher')}</p>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}

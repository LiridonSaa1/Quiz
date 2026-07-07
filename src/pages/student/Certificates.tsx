import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence } from 'motion/react';
import { Award, CheckCircle2, XCircle, Hash, Calendar, BookOpen, Sparkles, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Certificate {
  id: string;
  course_id: string | null;
  title: string;
  issued_at: string;
  certificate_number: string;
  grade: string | null;
  score: number | null;
  status: 'issued' | 'revoked';
  created_at: string;
  courseTitle: string;
}

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-700 bg-emerald-50', A: 'text-emerald-700 bg-emerald-50', 'A-': 'text-emerald-600 bg-emerald-50',
  'B+': 'text-blue-700 bg-blue-50',       B: 'text-blue-700 bg-blue-50',       'B-': 'text-blue-600 bg-blue-50',
  'C+': 'text-amber-700 bg-amber-50',     C: 'text-amber-700 bg-amber-50',
  D: 'text-orange-700 bg-orange-50',      F: 'text-rose-700 bg-rose-50',
};

const CERT_GRADIENTS = [
  'from-amber-400 via-yellow-400 to-orange-500',
  'from-violet-500 via-purple-500 to-fuchsia-500',
  'from-emerald-400 via-teal-500 to-cyan-500',
  'from-blue-500 via-indigo-500 to-violet-500',
  'from-rose-500 via-pink-500 to-fuchsia-500',
];

export default function StudentCertificates() {
  const { t } = useTranslation();
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState('Student');

  const renderCertificateHtml = (cert: Certificate, t: any) => {
    const accent = '#6d28d9';
    const bg = '#ffffff';
    const gradeLabel = t('common.grade');
    const scoreLabel = t('common.score');
    const gradeHtml = cert.grade
      ? `<div style="padding:8px 14px;border:1px solid #c4b5fd;border-radius:999px;background:#f5f3ff;color:${accent};font-size:12px;font-weight:700;">${gradeLabel}: ${cert.grade}</div>`
      : '';
    const scoreHtml = cert.score != null
      ? `<div style="padding:8px 14px;border:1px solid #c4b5fd;border-radius:999px;background:#f5f3ff;color:${accent};font-size:12px;font-weight:700;">${scoreLabel}: ${cert.score}%</div>`
      : '';

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Certificate - ${cert.title}</title>
    <style>
      body { margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; font-family: Inter, system-ui, Arial, sans-serif; }
      .toolbar { max-width: 980px; margin: 0 auto 12px auto; display: flex; justify-content: flex-end; gap: 8px; }
      .toolbar button { border: 1px solid #cbd5e1; background: #ffffff; color: #334155; border-radius: 8px; padding: 8px 12px; cursor: pointer; font-weight: 600; }
      .toolbar button.primary { background: #111827; border-color: #111827; color: #ffffff; }
      @media print { .toolbar { display: none; } body { background: #fff; padding: 0; } }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button class="primary" onclick="window.print()">${t('certificates.printSavePdf')}</button>
      <button onclick="window.close()">${t('certificates.close')}</button>
    </div>
    <div style="max-width:960px;margin:0 auto;background:${bg};border:2px solid ${accent};border-radius:20px;padding:48px;position:relative;box-shadow:0 24px 60px rgba(15,23,42,0.18);">
      <div style="position:absolute;inset:10px;border:1px solid ${accent};opacity:0.35;border-radius:16px;pointer-events:none;"></div>
      <div style="position:absolute;top:18px;left:18px;width:42px;height:42px;border-top:3px solid ${accent};border-left:3px solid ${accent};border-radius:10px;"></div>
      <div style="position:absolute;top:18px;right:18px;width:42px;height:42px;border-top:3px solid ${accent};border-right:3px solid ${accent};border-radius:10px;"></div>
      <div style="position:absolute;bottom:18px;left:18px;width:42px;height:42px;border-bottom:3px solid ${accent};border-left:3px solid ${accent};border-radius:10px;"></div>
      <div style="position:absolute;bottom:18px;right:18px;width:42px;height:42px;border-bottom:3px solid ${accent};border-right:3px solid ${accent};border-radius:10px;"></div>
      <div style="text-align:center;position:relative;">
        <div style="display:inline-flex;align-items:center;gap:10px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,0.75);border:1px solid rgba(15,23,42,0.12);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${accent};font-weight:800;">${t('certificates.certificateOfAchievement')}</div>
        <div style="margin-top:14px;font-size:12px;color:#475569;letter-spacing:0.08em;text-transform:uppercase;">${t('certificates.presentedTo')}</div>
        <h1 style="margin:10px 0 0 0;font-size:56px;line-height:1.08;color:#0f172a;font-family:Georgia,'Times New Roman',serif;">${studentName}</h1>
        <div style="margin-top:14px;font-size:13px;color:#64748b;">${t('certificates.forCompletion')}</div>
        <h2 style="margin:10px auto 0 auto;font-size:36px;line-height:1.15;color:${accent};font-family:Georgia,'Times New Roman',serif;max-width:1080px;word-break:break-word;overflow-wrap:anywhere;">${cert.title}</h2>
        ${cert.courseTitle ? `<div style="margin-top:8px;color:#475569;">${cert.courseTitle}</div>` : ''}
        <div style="display:flex;gap:32px;justify-content:center;margin-top:24px;">${gradeHtml}${scoreHtml}</div>
        <div style="display:flex;align-items:end;justify-content:space-between;margin-top:34px;padding-top:18px;border-top:1px solid #cbd5e1;">
          <div style="text-align:left;font-size:12px;color:#64748b;">
            Issued on ${format(new Date(cert.issued_at), 'MMMM d, yyyy')}<br/>
            <span style="font-family:ui-monospace,Menlo,Consolas,monospace;">${cert.certificate_number}</span>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
            <div style="width:84px;height:84px;border-radius:999px;background:radial-gradient(circle at 30% 30%, #8b5cf6,#4c1d95);box-shadow:inset 0 0 0 3px rgba(255,255,255,0.55),0 10px 24px rgba(15,23,42,0.22);display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;font-weight:800;">★</div>
            <div style="font-size:11px;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;">${t('certificates.verified')}</div>
          </div>
          <div style="text-align:right;">
            <div style="width:180px;border-top:2px solid #94a3b8;margin-left:auto;"></div>
            <div style="font-size:11px;color:#64748b;margin-top:6px;">${t('certificates.authorizedSignature')}</div>
          </div>
        </div>
      </div>
    </div>
    <script>window.focus();</script>
  </body>
</html>`;
  };

  const downloadCertificate = (cert: Certificate) => {
    if (cert.status !== 'issued') {
      toast.error(t('certificates.onlyIssuedDownload'));
      return;
    }

    const win = window.open('', '_blank', 'width=1200,height=900');
    if (!win) {
      toast.error(t('certificates.popupBlocked'));
      return;
    }

    win.document.open();
    win.document.write(renderCertificateHtml(cert, t));
    win.document.close();
  };

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      setStudentName(
        String(
          session.user.user_metadata?.displayName ||
          session.user.user_metadata?.display_name ||
          session.user.email?.split('@')[0] ||
          'Student'
        )
      );

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', uid)
        .maybeSingle();
      if (profile?.display_name) {
        setStudentName(String(profile.display_name));
      }

      const { data: certsData } = await supabase
        .from('certificates').select('*').eq('student_id', uid).order('issued_at', { ascending: false });

      const courseIds = [...new Set((certsData || []).map((c: any) => c.course_id).filter(Boolean))] as string[];
      const courseMap: Record<string, string> = {};
      if (courseIds.length > 0) {
        const { data: courses } = await supabase.from('courses').select('id, title').in('id', courseIds);
        (courses || []).forEach((c: any) => { courseMap[c.id] = c.title; });
      }

      setCerts((certsData || []).map((c: any) => ({ ...c, courseTitle: courseMap[c.course_id] || 'Course' })));
      setLoading(false);
    };
    load();
  }, []);

  const issued = certs.filter(c => c.status === 'issued');

  return (
    <StudentLayout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-yellow-950 to-slate-900 p-8 shadow-2xl">
          <motion.div className="absolute top-0 right-0 w-80 h-80 bg-yellow-500/20 rounded-full blur-3xl pointer-events-none"
            animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 7, repeat: Infinity }} />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 mb-3">
                <Award className="w-3.5 h-3.5 text-yellow-300" />
                <span className="text-white/80 text-xs font-semibold">{t('nav.certificates')}</span>
              </div>
              <h1 className="text-3xl font-black text-white">{t('certificates.myCertificates')}</h1>
              <p className="text-slate-400 text-sm mt-1">
                {t('certificates.earned', { count: issued.length })}
              </p>
            </div>
            <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-yellow-900/40 shrink-0">
              <Award className="w-8 h-8 text-white" />
            </motion.div>
          </div>
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3].map(i => <div key={i} className="h-64 bg-white rounded-3xl border border-slate-100 animate-pulse" />)}
          </div>
        ) : certs.length === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center">
            <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity }}
              className="w-20 h-20 bg-yellow-50 rounded-3xl flex items-center justify-center mb-5 shadow-lg">
              <Award className="w-10 h-10 text-yellow-400" />
            </motion.div>
            <h3 className="text-xl font-black text-slate-900 mb-2">{t('certificates.noCertificatesYet')}</h3>
            <p className="text-slate-400 text-sm max-w-xs">{t('certificates.completeCourses')}</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
              {certs.map((cert, i) => (
                <motion.div key={cert.id}
                  initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  whileHover={{ y: -6, transition: { duration: 0.2 } }}
                  className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-slate-200/80 transition-shadow overflow-hidden">
                  {/* Certificate banner */}
                  <div className={cn('relative h-36 bg-gradient-to-br', CERT_GRADIENTS[i % CERT_GRADIENTS.length], 'flex items-center justify-center overflow-hidden')}>
                    <motion.div className="absolute inset-0 opacity-10">
                      <svg width="100%" height="100%">
                        <defs><pattern id={`cp-${i}`} x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                          <circle cx="12" cy="12" r="6" fill="none" stroke="white" strokeWidth="0.8" />
                        </pattern></defs>
                        <rect width="100%" height="100%" fill={`url(#cp-${i})`} />
                      </svg>
                    </motion.div>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/20 rounded-full blur-2xl" />
                    <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 3, repeat: Infinity }}
                      className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border-2 border-white/40 shadow-xl">
                      <Award className="w-7 h-7 text-white" />
                    </motion.div>
                    {cert.status === 'revoked' && (
                      <div className="absolute top-3 right-3 bg-red-500/90 text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> {t('certificates.revoked')}
                      </div>
                    )}
                    {cert.status === 'issued' && (
                      <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 border border-white/30">
                        <CheckCircle2 className="w-3 h-3" /> {t('certificates.issued')}
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-5">
                    <h3 className="text-sm font-black text-slate-900 leading-tight mb-1">{cert.title}</h3>
                    <div className="flex items-center gap-1.5 mb-4">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs text-slate-400 font-medium">{cert.courseTitle}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs text-slate-400"><Hash className="w-3 h-3" /> {cert.certificate_number}</span>
                        {cert.grade && (
                          <span className={cn('text-xs font-black px-2 py-0.5 rounded-lg', GRADE_COLORS[cert.grade] || 'bg-slate-100 text-slate-600')}>
                            {cert.grade}
                          </span>
                        )}
                      </div>
                      {cert.score != null && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Sparkles className="w-3 h-3" /> Score: <strong className="text-slate-700">{cert.score}%</strong>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Calendar className="w-3 h-3" /> {format(new Date(cert.issued_at), 'MMM d, yyyy')}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={cert.status !== 'issued'}
                      onClick={() => downloadCertificate(cert)}
                      className={cn(
                        'mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
                        cert.status === 'issued'
                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      )}
                    >
                      <Download className="w-4 h-4" />
                      {t('certificates.downloadCertificate')}
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}

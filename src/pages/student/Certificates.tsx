import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import StudentLayout from '../../components/layout/StudentLayout';
import { motion, AnimatePresence } from 'motion/react';
import { Award, CheckCircle2, XCircle, Hash, Calendar, BookOpen, Sparkles, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';

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
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;

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
                <span className="text-white/80 text-xs font-semibold">Certificates</span>
              </div>
              <h1 className="text-3xl font-black text-white">My Certificates</h1>
              <p className="text-slate-400 text-sm mt-1">
                {issued.length} certificate{issued.length !== 1 ? 's' : ''} earned
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
            <h3 className="text-xl font-black text-slate-900 mb-2">No certificates yet</h3>
            <p className="text-slate-400 text-sm max-w-xs">Complete courses and pass quizzes to earn certificates!</p>
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
                        <XCircle className="w-3 h-3" /> Revoked
                      </div>
                    )}
                    {cert.status === 'issued' && (
                      <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 border border-white/30">
                        <CheckCircle2 className="w-3 h-3" /> Issued
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

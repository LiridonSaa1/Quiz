import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import StudentLayout from '../../components/layout/StudentLayout';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import {
  ArrowLeft, Calendar, BookOpen, ClipboardList, CheckCircle2,
  Clock, AlertCircle, Send, Award, MessageSquare, RefreshCw, FileText,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns';
import { motion } from 'motion/react';
import { toast } from 'sonner';

type AssignmentStatus = 'draft' | 'published' | 'closed';

type AssignmentRow = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  due_date: string | null;
  max_score: number | null;
  status: AssignmentStatus;
  course_id: string | null;
  course_title: string;
  allow_late_submission: boolean;
  created_at: string | null;
};

type Submission = {
  id: string;
  content: string;
  status: 'submitted' | 'graded';
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
  graded_at: string | null;
  is_late: boolean;
};

function useCountdown(dueDate: string | null) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number; expired: boolean } | null>(null);

  useEffect(() => {
    if (!dueDate) return;
    const tick = () => {
      const now = new Date().getTime();
      const due = new Date(dueDate).getTime();
      const diff = due - now;
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ days, hours, minutes, seconds, expired: false });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dueDate]);

  return timeLeft;
}

export default function StudentAssignmentDetail() {
  const { assignmentId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const countdown = useCountdown(assignment?.due_date ?? null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !assignmentId) { setLoading(false); return; }

      const { data: enrolledCourses } = await supabase
        .from('courses').select('id,title,status,student_ids').contains('student_ids', [session.user.id]);

      const courses = (enrolledCourses || [])
        .filter((c: any) => { const s = String(c?.status || '').toLowerCase(); return s === '' || s === 'published' || s === 'active'; })
        .map((c: any) => ({ id: String(c.id), title: String(c.title || 'Course') }));

      if (!courses.length) { setLoading(false); return; }

      const courseIds = courses.map((c: any) => c.id);
      const courseMap: Record<string, string> = {};
      courses.forEach((c: any) => { courseMap[c.id] = c.title; });

      const { data: rows } = await supabase
        .from('assignments').select('*').in('course_id', courseIds)
        .eq('status', 'published').eq('id', assignmentId).limit(1);

      const found = rows?.[0];
      if (!found) { setLoading(false); return; }

      setAssignment({
        id: String(found.id), title: String(found.title || 'Untitled'),
        description: found.description || null, instructions: found.instructions || null,
        due_date: found.due_date || null, max_score: found.max_score == null ? null : Number(found.max_score),
        status: found.status || 'published', course_id: found.course_id ? String(found.course_id) : null,
        course_title: courseMap[found.course_id] || 'Course',
        allow_late_submission: Boolean(found.allow_late_submission),
        created_at: found.created_at || null,
      });

      try {
        const subRes = await authFetch(`/api/student/assignments/${assignmentId}/submission`);
        const subJson = await subRes.json();
        if (subJson.success && subJson.submission) {
          setSubmission(subJson.submission);
          setAnswer(subJson.submission.content || '');
        }
      } catch { }

      setLoading(false);
    };
    void load();
  }, [assignmentId]);

  const handleSubmit = async () => {
    if (!answer.trim()) { toast.error('Please write your answer before submitting'); return; }
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/student/assignments/${assignmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: answer }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Submission failed');
      setSubmission(json.submission);
      setShowForm(false);
      toast.success(submission ? 'Answer updated successfully!' : 'Assignment submitted successfully!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const dueLabel = useMemo(() => {
    if (!assignment?.due_date) return 'No due date';
    const d = new Date(assignment.due_date);
    if (isToday(d)) return 'Due today';
    if (isPast(d)) return 'Overdue';
    return `Due ${format(d, 'MMM d, yyyy')}`;
  }, [assignment]);

  const isExpired = assignment?.due_date ? isPast(new Date(assignment.due_date)) : false;
  const canSubmit = !isExpired || assignment?.allow_late_submission;

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        <Link to="/student/assignments" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to assignments
        </Link>

        {loading ? (
          <div className="space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6">
                <div className="h-5 w-56 bg-slate-100 rounded animate-pulse mb-3" />
                <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : !assignment ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">Assignment not available</h2>
            <p className="text-sm text-slate-500 mt-1">You do not have access to this assignment.</p>
          </div>
        ) : (
          <>
            {/* Header card */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-br from-teal-600 to-cyan-600 px-6 pt-6 pb-8">
                <p className="text-teal-200 text-xs font-semibold uppercase tracking-wider mb-1">{assignment.course_title}</p>
                <h1 className="text-2xl font-black text-white leading-tight">{assignment.title}</h1>
                {assignment.description && (
                  <p className="text-teal-100 text-sm mt-2 leading-relaxed">{assignment.description}</p>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 divide-x divide-slate-100 -mt-0">
                <div className="px-4 py-4 text-center">
                  <div className={cn('text-xs font-bold uppercase tracking-wide mb-1', isExpired ? 'text-rose-500' : 'text-slate-400')}>
                    {isExpired ? 'OVERDUE' : 'DUE'}
                  </div>
                  <div className={cn('text-sm font-bold', isExpired ? 'text-rose-600' : 'text-slate-800')}>
                    {assignment.due_date ? format(new Date(assignment.due_date), 'MMM d, yyyy') : '—'}
                  </div>
                </div>
                <div className="px-4 py-4 text-center">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Max Score</div>
                  <div className="text-sm font-bold text-slate-800">{assignment.max_score ?? 0} pts</div>
                </div>
                <div className="px-4 py-4 text-center">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Status</div>
                  <div className={cn('text-sm font-bold',
                    submission?.status === 'graded' ? 'text-emerald-600' :
                    submission ? 'text-blue-600' : 'text-slate-500')}>
                    {submission?.status === 'graded' ? 'Graded' : submission ? 'Submitted' : 'Not submitted'}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Countdown timer */}
            {assignment.due_date && countdown && !countdown.expired && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-teal-500" />
                  <h3 className="text-sm font-bold text-slate-700">Time remaining</h3>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Days', value: countdown.days },
                    { label: 'Hours', value: countdown.hours },
                    { label: 'Minutes', value: countdown.minutes },
                    { label: 'Seconds', value: countdown.seconds },
                  ].map(({ label, value }) => (
                    <div key={label} className={cn('rounded-xl p-3 text-center',
                      countdown.days === 0 && countdown.hours < 2 ? 'bg-rose-50 border border-rose-100' : 'bg-slate-50 border border-slate-100')}>
                      <div className={cn('text-2xl font-black tabular-nums',
                        countdown.days === 0 && countdown.hours < 2 ? 'text-rose-600' : 'text-slate-900')}>
                        {String(value).padStart(2, '0')}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {countdown?.expired && (
              <div className={cn('rounded-2xl border px-5 py-4 flex items-center gap-3',
                assignment.allow_late_submission ? 'bg-orange-50 border-orange-200' : 'bg-rose-50 border-rose-200')}>
                <AlertCircle className={cn('w-5 h-5 shrink-0', assignment.allow_late_submission ? 'text-orange-500' : 'text-rose-500')} />
                <p className={cn('text-sm font-medium', assignment.allow_late_submission ? 'text-orange-700' : 'text-rose-700')}>
                  {assignment.allow_late_submission
                    ? 'The deadline has passed — late submissions are still accepted.'
                    : 'The deadline has passed. Submissions are no longer accepted.'}
                </p>
              </div>
            )}

            {/* Instructions */}
            {assignment.instructions && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-blue-500" />
                  </div>
                  <h2 className="text-base font-bold text-slate-800">Instructions</h2>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{assignment.instructions}</p>
              </motion.div>
            )}

            {/* Grade & Feedback */}
            {submission?.status === 'graded' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Award className="w-4 h-4 text-emerald-600" />
                  </div>
                  <h2 className="text-base font-bold text-slate-800">Your Grade</h2>
                </div>
                <div className="flex items-center gap-6">
                  {submission.grade != null && (
                    <div className="text-center">
                      <div className="text-4xl font-black text-emerald-600">{submission.grade}</div>
                      <div className="text-xs text-slate-400 font-semibold">out of {assignment.max_score ?? 0}</div>
                    </div>
                  )}
                  {submission.feedback && (
                    <div className="flex-1 bg-emerald-50 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Teacher's feedback</span>
                      </div>
                      <p className="text-sm text-emerald-800 leading-relaxed">{submission.feedback}</p>
                    </div>
                  )}
                </div>
                {submission.graded_at && (
                  <p className="text-xs text-slate-400 mt-3">
                    Graded {formatDistanceToNow(new Date(submission.graded_at), { addSuffix: true })}
                  </p>
                )}
              </motion.div>
            )}

            {/* Submission area */}
            {canSubmit && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Send className="w-4 h-4 text-indigo-500" />
                    </div>
                    <h2 className="text-base font-bold text-slate-800">
                      {submission ? 'Your Submission' : 'Submit Your Answer'}
                    </h2>
                  </div>
                  {submission && !showForm && (
                    <button
                      onClick={() => setShowForm(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />Edit answer
                    </button>
                  )}
                </div>

                {submission && !showForm ? (
                  <div className="space-y-3">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Submitted answer</span>
                        {submission.is_late && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-semibold">Late</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{submission.content || <span className="text-slate-400 italic">No text</span>}</p>
                    </div>
                    <p className="text-xs text-slate-400">
                      Submitted {formatDistanceToNow(new Date(submission.submitted_at), { addSuffix: true })}
                      {submission.is_late && ' · Marked as late'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {submission && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 font-medium">
                        You already submitted this assignment. Editing will replace your previous answer.
                      </div>
                    )}
                    <textarea
                      value={answer}
                      onChange={e => setAnswer(e.target.value)}
                      rows={8}
                      placeholder="Write your answer here..."
                      className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 resize-none leading-relaxed"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{answer.length} characters</span>
                      <div className="flex gap-2">
                        {submission && (
                          <button onClick={() => { setShowForm(false); setAnswer(submission.content || ''); }}
                            className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={handleSubmit}
                          disabled={submitting || !answer.trim()}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:opacity-90 transition-opacity disabled:opacity-40 shadow-md shadow-teal-200/50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {submitting ? 'Submitting...' : submission ? 'Update Submission' : 'Submit Assignment'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Action links */}
            <div className="flex flex-wrap gap-3 pb-6">
              {assignment.course_id && (
                <Link to={`/student/courses/${assignment.course_id}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm">
                  <BookOpen className="w-4 h-4" />Open course
                </Link>
              )}
              <Link to="/student/assignments"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm">
                <Calendar className="w-4 h-4" />All assignments
              </Link>
            </div>
          </>
        )}
      </div>
    </StudentLayout>
  );
}

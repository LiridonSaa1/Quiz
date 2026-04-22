import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StudentLayout from '../../components/layout/StudentLayout';
import { supabase } from '../../supabase';
import { ArrowLeft, Calendar, BookOpen, ClipboardList, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format, isPast, isToday } from 'date-fns';

type AssignmentStatus = 'draft' | 'published' | 'closed';

type AssignmentRow = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number | null;
  status: AssignmentStatus;
  course_id: string | null;
  course_title: string;
  created_at: string | null;
};

type AssignmentProgress = {
  startedAt: string;
  completed: boolean;
  lastVisitedAt: string;
};

const readProgress = (studentId: string, assignmentId: string): AssignmentProgress | null => {
  try {
    const raw = localStorage.getItem(`assignment_progress:${studentId}:${assignmentId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AssignmentProgress>;
    return {
      startedAt: parsed.startedAt || new Date().toISOString(),
      completed: Boolean(parsed.completed),
      lastVisitedAt: parsed.lastVisitedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

const saveProgress = (studentId: string, assignmentId: string, progress: AssignmentProgress) => {
  localStorage.setItem(`assignment_progress:${studentId}:${assignmentId}`, JSON.stringify(progress));
};

export default function StudentAssignmentDetail() {
  const { assignmentId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [completed, setCompleted] = useState(false);
  const [startedAt, setStartedAt] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !assignmentId) {
        setLoading(false);
        return;
      }
      const uid = session.user.id;
      setStudentId(uid);

      const { data: enrolledCourses } = await supabase
        .from('courses')
        .select('id,title,status,student_ids')
        .contains('student_ids', [uid]);
      const courses = (enrolledCourses || [])
        .filter((c: any) => {
          const status = String(c?.status || '').toLowerCase();
          return status === '' || status === 'published' || status === 'active';
        })
        .map((c: any) => ({ id: String(c.id), title: String(c.title || 'Course') }));
      if (!courses.length) {
        setLoading(false);
        return;
      }

      const courseIds = courses.map((c: any) => c.id);
      const courseMap: Record<string, string> = {};
      courses.forEach((c: any) => { courseMap[c.id] = c.title; });

      const { data: rows } = await supabase
        .from('assignments')
        .select('*')
        .in('course_id', courseIds)
        .eq('status', 'published')
        .eq('id', assignmentId)
        .limit(1);

      const found = rows?.[0];
      if (!found) {
        setLoading(false);
        return;
      }

      const normalized: AssignmentRow = {
        id: String(found.id),
        title: String(found.title || 'Untitled assignment'),
        description: found.description || null,
        due_date: found.due_date || null,
        max_score: found.max_score == null ? null : Number(found.max_score),
        status: found.status || 'published',
        course_id: found.course_id ? String(found.course_id) : null,
        course_title: courseMap[found.course_id] || 'Course',
        created_at: found.created_at || null,
      };
      setAssignment(normalized);

      const progress = readProgress(uid, assignmentId);
      if (progress) {
        setStartedAt(progress.startedAt);
        setCompleted(progress.completed);
        saveProgress(uid, assignmentId, { ...progress, lastVisitedAt: new Date().toISOString() });
      } else {
        const initial: AssignmentProgress = {
          startedAt: new Date().toISOString(),
          completed: false,
          lastVisitedAt: new Date().toISOString(),
        };
        setStartedAt(initial.startedAt);
        saveProgress(uid, assignmentId, initial);
      }

      setLoading(false);
    };
    void load();
  }, [assignmentId]);

  const toggleCompleted = () => {
    if (!studentId || !assignmentId) return;
    const next = !completed;
    setCompleted(next);
    saveProgress(studentId, assignmentId, {
      startedAt: startedAt || new Date().toISOString(),
      completed: next,
      lastVisitedAt: new Date().toISOString(),
    });
  };

  const dueLabel = useMemo(() => {
    if (!assignment?.due_date) return 'No due date';
    const dueDate = new Date(assignment.due_date);
    if (isToday(dueDate)) return 'Due today';
    if (isPast(dueDate)) return 'Overdue';
    return `Due ${format(dueDate, 'MMM d, yyyy')}`;
  }, [assignment]);

  return (
    <StudentLayout>
      <div className="space-y-6">
        <Link to="/student/assignments" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          Back to assignments
        </Link>

        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-8">
            <div className="h-6 w-56 bg-slate-100 rounded animate-pulse mb-4" />
            <div className="h-4 w-72 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : !assignment ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">Assignment not available</h2>
            <p className="text-sm text-slate-500 mt-1">You do not have access to this assignment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl border border-slate-100 p-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{assignment.course_title}</p>
              <h1 className="text-2xl font-black text-slate-900 mt-1">{assignment.title}</h1>
              <p className="text-sm text-slate-500 mt-2">{assignment.description || 'Read instructions and submit before deadline.'}</p>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">Due status</p>
                  <p className="text-base font-bold text-slate-900 mt-1">{dueLabel}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">Max score</p>
                  <p className="text-base font-bold text-slate-900 mt-1">{assignment.max_score ?? 0} pts</p>
                </div>
                <div className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-xs text-slate-400 font-semibold">Progress</p>
                  <p className="text-base font-bold text-slate-900 mt-1">{completed ? 'Completed' : 'Open'}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 p-6 flex flex-wrap gap-3">
              <button
                onClick={toggleCompleted}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  completed ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-900 text-white hover:bg-slate-800'
                )}
              >
                {completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                {completed ? 'Completed' : 'Mark as completed'}
              </button>

              {assignment.course_id && (
                <Link
                  to={`/student/courses/${assignment.course_id}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  <BookOpen className="w-4 h-4" />
                  Open course
                </Link>
              )}
              <Link
                to="/student/assignments"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100"
              >
                <Calendar className="w-4 h-4" />
                Back to list
              </Link>
            </div>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}

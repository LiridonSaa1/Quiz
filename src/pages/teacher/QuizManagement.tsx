import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { sendNotification } from '../../lib/utils';
import { 
  Plus, 
  Search, 
  FileText, 
  Trash2, 
  Edit2, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  MoreVertical,
  BookOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { Quiz } from '../../types';
import { cn } from '../../lib/utils';
import { Link, useNavigate } from 'react-router-dom';

export default function QuizManagement() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [courses, setCourses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const [quizzesSnap, coursesSnap] = await Promise.all([
        supabase.from('quizzes').select('*').eq('teacher_id', session.user.id),
        supabase.from('courses').select('id, name').eq('teacher_id', session.user.id)
      ]);

      if (quizzesSnap.error) throw quizzesSnap.error;
      if (coursesSnap.error) throw coursesSnap.error;

      const coursesMap: Record<string, string> = {};
      coursesSnap.data.forEach(d => {
        coursesMap[d.id] = d.name;
      });
      setCourses(coursesMap);

      setQuizzes(quizzesSnap.data.map(d => ({
        id: d.id,
        courseId: d.course_id,
        teacherId: d.teacher_id,
        title: d.title,
        description: d.description,
        timeLimit: d.time_limit,
        settings: d.settings,
        published: d.published,
        createdAt: d.created_at
      } as Quiz)));
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this quiz?')) return;
    try {
      const { error } = await supabase.from('quizzes').delete().eq('id', id);
      if (error) throw error;
      toast.success('Quiz deleted successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete quiz');
    }
  };

  const togglePublish = async (quiz: Quiz) => {
    try {
      const { error } = await supabase
        .from('quizzes')
        .update({ published: !quiz.published })
        .eq('id', quiz.id);
      
      if (error) throw error;
      
      if (!quiz.published) {
        // Find students in the course and notify them
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('student_ids')
          .eq('id', quiz.courseId)
          .single();
        
        if (!courseError && course && course.student_ids) {
          course.student_ids.forEach((studentId: string) => {
            sendNotification(
              studentId,
              'New Quiz Available',
              `A new quiz "${quiz.title}" has been published in your course.`,
              'info'
            );
          });
        }
      }
      
      toast.success(`Quiz ${!quiz.published ? 'published' : 'unpublished'}`);
      fetchData();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  return (
    <TeacherLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Quiz Management</h1>
            <p className="text-slate-500 mt-2">Create and manage quizzes for your courses.</p>
          </div>
          <Link
            to="/teacher/quizzes/new"
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-semibold hover:bg-slate-800 transition-all text-center justify-center"
          >
            <Plus className="w-5 h-5" />
            Create Quiz
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search quizzes..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <select className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-slate-900">
            <option>All Courses</option>
            {Object.entries(courses).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        {/* Quiz Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-sm font-semibold">
                  <th className="px-6 py-4">Quiz Title</th>
                  <th className="px-6 py-4">Course</th>
                  <th className="px-6 py-4">Time Limit</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-6 py-4 h-16 bg-slate-50/50" />
                    </tr>
                  ))
                ) : quizzes.length > 0 ? (
                  quizzes.map((quiz) => (
                    <tr key={quiz.id} className="hover:bg-slate-50 transition-all">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 block">{quiz.title}</span>
                            <span className="text-xs text-slate-400">{new Date(quiz.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold">
                          <BookOpen className="w-3 h-3" />
                          {courses[quiz.courseId] || 'Unknown Course'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                          <Clock className="w-4 h-4" />
                          {quiz.timeLimit} mins
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => togglePublish(quiz)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all",
                            quiz.published 
                              ? "bg-green-50 text-green-600 hover:bg-green-100" 
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          )}
                        >
                          {quiz.published ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {quiz.published ? 'Published' : 'Draft'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => navigate(`/teacher/quizzes/edit/${quiz.id}`)}
                            className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-all"
                            title="Edit"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => handleDelete(quiz.id)}
                            className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                          <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-all">
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-slate-900">No quizzes found</h3>
                      <p className="text-slate-500">Create your first quiz to start testing your students.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}

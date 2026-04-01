import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { 
  Plus, 
  Search, 
  Users, 
  Mail, 
  User, 
  X, 
  Upload, 
  CheckCircle2, 
  XCircle,
  MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../../types';
import { cn } from '../../lib/utils';

export default function StudentManagement() {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const fetchStudents = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('teacher_id', session.user.id)
        .eq('role', 'student');
      
      if (error) throw error;
      setStudents(data.map(d => ({
        uid: d.id,
        email: d.email,
        displayName: d.display_name,
        role: d.role,
        teacherId: d.teacher_id,
        status: d.status,
        createdAt: d.created_at
      } as UserProfile)));
    } catch (error) {
      toast.error('Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const generatePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let pass = "";
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password: pass }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const response = await fetch('/api/admin/create-student', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          ...formData,
          teacherId: session.user.id
        })
      }).catch(err => {
        if (err.message === 'Failed to fetch') {
          throw new Error('Network error: Could not reach the backend server. Please ensure the server is running.');
        }
        throw err;
      });

      if (response.ok) {
        toast.success('Student created successfully');
        setIsModalOpen(false);
        setFormData({ name: '', email: '', password: '' });
        fetchStudents();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create student');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save student');
    }
  };

  const toggleStatus = async (student: UserProfile) => {
    try {
      const newStatus = student.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', student.uid);
      
      if (error) throw error;
      toast.success(`Student ${newStatus === 'active' ? 'enabled' : 'disabled'}`);
      fetchStudents();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  return (
    <TeacherLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Student Management</h1>
            <p className="text-slate-500 mt-2">Manage your students and track their progress.</p>
          </div>
          <div className="flex gap-3">
            <button className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-xl font-semibold hover:bg-slate-50 transition-all">
              <Upload className="w-5 h-5" />
              Import CSV
            </button>
            <button
              onClick={() => {
                generatePassword();
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-semibold hover:bg-slate-800 transition-all"
            >
              <Plus className="w-5 h-5" />
              Add Student
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="text-slate-500 text-sm mb-1">Total Students</div>
            <div className="text-2xl font-bold text-slate-900">{students.length}</div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="text-slate-500 text-sm mb-1">Active Students</div>
            <div className="text-2xl font-bold text-green-600">
              {students.filter(s => s.status !== 'inactive').length}
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="text-slate-500 text-sm mb-1">Inactive Students</div>
            <div className="text-2xl font-bold text-red-600">
              {students.filter(s => s.status === 'inactive').length}
            </div>
          </div>
        </div>

        {/* Student Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-sm font-semibold">
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Joined Date</th>
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
                ) : students.length > 0 ? (
                  students.map((student) => (
                    <tr key={student.uid} className="hover:bg-slate-50 transition-all">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold">
                            {student.displayName[0]}
                          </div>
                          <span className="font-semibold text-slate-900">{student.displayName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{student.email}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
                          student.status === 'inactive' 
                            ? "bg-red-50 text-red-600" 
                            : "bg-green-50 text-green-600"
                        )}>
                          {student.status === 'inactive' ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                          {student.status === 'inactive' ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(student.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => toggleStatus(student)}
                            className={cn(
                              "p-2 rounded-lg transition-all",
                              student.status === 'inactive' ? "text-green-600 hover:bg-green-50" : "text-red-600 hover:bg-red-50"
                            )}
                            title={student.status === 'inactive' ? 'Enable' : 'Disable'}
                          >
                            {student.status === 'inactive' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
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
                      <Users className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-slate-900">No students found</h3>
                      <p className="text-slate-500">Add students to assign them to courses.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Student Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Add New Student</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-lg">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      placeholder="Student's name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      placeholder="student@example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Auto-generated Password</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={formData.password}
                      className="flex-1 px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={generatePassword}
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm font-semibold"
                    >
                      Regenerate
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 italic">
                    * Make sure to share this password with the student.
                  </p>
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-all"
                  >
                    Add Student
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}

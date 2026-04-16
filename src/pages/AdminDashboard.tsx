import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { UserProfile, UserRole } from '../types';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Search, 
  UserCheck, 
  UserX,
  TrendingUp,
  GraduationCap,
  BookOpen,
  Award
} from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../components/layout/AdminLayout';
import { TableRowsSkeleton } from '../components/ui/Skeleton';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { authFetch } from '../lib/apiUrl';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 shadow-xl rounded-xl px-4 py-3 text-sm">
      <p className="font-bold text-slate-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="font-medium text-slate-600">{p.name}:</span>
          <span className="font-bold" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function AdminDashboard() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserData, setNewUserData] = useState({ name: '', email: '', password: '', role: 'teacher' as UserRole });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersApiRes, analyticsRes] = await Promise.all([
        authFetch('/api/admin/users').then(r => r.json()),
        fetch('/api/admin/analytics').then(r => r.json())
      ]);

      let usersSource: any[] = [];
      if (usersApiRes?.success) {
        usersSource = usersApiRes.users || [];
      } else {
        // Fallback when API server isn't running on current frontend origin.
        const usersRes = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });
        if (usersRes.error) throw usersRes.error;
        usersSource = usersRes.data || [];
      }

      setUsers(usersSource.map((profile: any) => ({
        uid: String(profile.id),
        email: String(profile.email || ''),
        displayName: String(profile.display_name || profile.email || 'Unknown user'),
        role: profile.role,
        teacherId: profile.teacher_id,
        status: profile.status || 'active',
        createdAt: profile.created_at || new Date().toISOString()
      })));

      if (analyticsRes.success) {
        setAnalytics(analyticsRes);
      }
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const endpoint = newUserData.role === 'teacher' ? '/api/admin/create-teacher' : '/api/admin/create-student';
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newUserData.name, email: newUserData.email, password: newUserData.password, teacherId: session?.user.id })
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`${newUserData.role} created successfully`);
        setShowAddModal(false);
        setNewUserData({ name: '', email: '', password: '', role: 'teacher' });
        fetchData();
      } else {
        throw new Error(data.error || 'Failed to create user');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUserStatus = async (user: UserProfile) => {
    try {
      const newStatus = user.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', user.uid);
      if (error) throw error;
      toast.success(`User ${newStatus === 'active' ? 'enabled' : 'disabled'}`);
      fetchData();
    } catch (error) {
      toast.error('Failed to update user status');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const ov = analytics?.overview;

  const statsConfig = [
    { label: 'Total Users', value: ov?.totalStudents ? ov.totalStudents + (ov.totalTeachers || 0) : users.length, icon: Users, bg: 'bg-indigo-500', light: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100', delay: 0.1 },
    { label: 'Active Courses', value: ov?.publishedCourses || 0, icon: BookOpen, bg: 'bg-violet-500', light: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100', delay: 0.2 },
    { label: 'Avg Quiz Score', value: `${ov?.avgScore || 0}%`, icon: TrendingUp, bg: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', delay: 0.3 },
    { label: 'Certificates', value: ov?.totalCertificates || 0, icon: Award, bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', delay: 0.4 },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard Overview</h1>
            <p className="text-slate-500 text-sm mt-1">Welcome back. Here is what's happening on your platform today.</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </motion.button>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statsConfig.map((stat) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: stat.delay }}
              key={stat.label} 
              className={`bg-white rounded-2xl border ${stat.border} p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden`}
            >
              <div className={`absolute top-0 right-0 w-32 h-32 ${stat.bg} opacity-5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none`} />
              <div className="flex items-center justify-between mb-3 relative z-10">
                <div className={`p-2.5 ${stat.light} rounded-xl`}>
                  <stat.icon className={`w-5 h-5 ${stat.text}`} />
                </div>
                <div className={`w-1.5 h-8 ${stat.bg} rounded-full opacity-30`} />
              </div>
              <div className="text-3xl font-extrabold text-slate-900 relative z-10">{loading ? '-' : stat.value}</div>
              <div className="text-sm text-slate-500 mt-1 font-medium relative z-10">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
          >
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-900">Signups & Activity Trend</h3>
              <p className="text-sm text-slate-500">Platform engagement over the last 30 days</p>
            </div>
            <div className="h-[300px]">
              {loading ? (
                <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <AreaChart data={analytics?.trend || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAttempts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={4} />
                    <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="signups" name="New Students" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorSignups)" />
                    <Area type="monotone" dataKey="attempts" name="Quiz Attempts" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorAttempts)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
          >
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-900">Score Distribution</h3>
              <p className="text-sm text-slate-500">Average grades across platform</p>
            </div>
            <div className="h-[300px]">
              {loading ? (
                <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={analytics?.scoreDistribution || []} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="count" name="Students" radius={[6, 6, 0, 0]}>
                      {(analytics?.scoreDistribution || []).map((_: any, i: number) => (
                        <Cell key={i} fill={['#ef4444', '#f59e0b', '#eab308', '#06b6d4', '#10b981'][i] || '#6366f1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>
        </div>

        {/* User Management Table */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
        >
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-lg font-bold text-slate-900">User Management</h3>
              <p className="text-sm text-slate-500">Manage all registered accounts</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
              >
                <option value="all">All Roles</option>
                <option value="teacher">Teachers</option>
                <option value="student">Students</option>
                <option value="admin">Admins</option>
              </select>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Joined</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={5}>
                      <TableRowsSkeleton rows={5} className="p-6" />
                    </td>
                  </tr>
                ) : filteredUsers.length > 0 ? (
                  <AnimatePresence>
                    {filteredUsers.map((user, i) => (
                      <motion.tr 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        key={user.uid} 
                        className="hover:bg-slate-50/70 transition-all group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                              {user.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-900">{user.displayName}</div>
                              <div className="text-xs text-slate-500 mt-0.5">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                            user.role === 'admin' ? 'bg-violet-100 text-violet-700 ring-1 ring-violet-200' :
                            user.role === 'teacher' ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' :
                            'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg ${
                            user.status === 'active' ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200/50' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-teal-500 animate-pulse' : 'bg-slate-400'}`} />
                            {user.status || 'active'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                          {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => toggleUserStatus(user)}
                              className={`p-2 rounded-lg transition-all text-xs font-medium flex items-center gap-1 ${
                                user.status === 'active' 
                                  ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50' 
                                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={user.status === 'active' ? 'Disable' : 'Enable'}
                            >
                              {user.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </motion.button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                ) : (
                  <tr><td colSpan={5} className="px-6 py-16 text-center text-slate-400 text-sm font-medium">No users found matching your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-50">
            {loading ? (
              <TableRowsSkeleton rows={4} />
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={user.uid} 
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{user.displayName}</div>
                      <div className="text-xs text-slate-500 truncate">{user.email}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          user.role === 'admin' ? 'bg-violet-100 text-violet-700' :
                          user.role === 'teacher' ? 'bg-indigo-100 text-indigo-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>{user.role}</span>
                        <span className={`flex items-center gap-1 text-[10px] font-bold ${
                          user.status === 'active' ? 'text-teal-600' : 'text-slate-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-teal-500' : 'bg-slate-400'}`} />
                          {user.status || 'active'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleUserStatus(user)}
                    className={`p-2 rounded-lg transition-all shrink-0 ${
                      user.status === 'active' ? 'text-slate-300 hover:text-orange-500 hover:bg-orange-50' : 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50'
                    }`}
                  >
                    {user.status === 'active' ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                  </button>
                </motion.div>
              ))
            ) : (
              <div className="p-6 text-center text-slate-400 text-sm font-medium">No users found.</div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-violet-50/50">
                <h2 className="text-xl font-extrabold text-slate-900">Add New User</h2>
                <p className="text-sm text-slate-500 mt-1 font-medium">Create a new teacher or student account</p>
              </div>
              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                {[
                  { label: 'Full Name', key: 'name', type: 'text', placeholder: 'John Doe' },
                  { label: 'Email Address', key: 'email', type: 'email', placeholder: 'john@example.com' },
                  { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••' },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">{field.label}</label>
                    <input
                      required
                      type={field.type}
                      value={(newUserData as any)[field.key]}
                      onChange={(e) => setNewUserData({...newUserData, [field.key]: e.target.value})}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all focus:bg-white"
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Role</label>
                  <select
                    value={newUserData.role}
                    onChange={(e) => setNewUserData({...newUserData, role: e.target.value as UserRole})}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all focus:bg-white"
                  >
                    <option value="teacher">Teacher</option>
                    <option value="student">Student</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200">
                    {submitting ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
}

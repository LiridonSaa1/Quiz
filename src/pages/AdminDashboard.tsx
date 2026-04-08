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
  GraduationCap
} from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../components/layout/AdminLayout';
import { TableRowsSkeleton } from '../components/ui/Skeleton';

export default function AdminDashboard() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserData, setNewUserData] = useState({ name: '', email: '', password: '', role: 'teacher' as UserRole });
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      setUsers(data.map(profile => ({
        uid: profile.id,
        email: profile.email,
        displayName: profile.display_name,
        role: profile.role,
        teacherId: profile.teacher_id,
        status: profile.status,
        createdAt: profile.created_at
      })));
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

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
        fetchUsers();
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
      fetchUsers();
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

  const statsConfig = [
    { label: 'Total Users', value: users.length, icon: Users, bg: 'bg-indigo-500', light: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100' },
    { label: 'Teachers', value: users.filter(u => u.role === 'teacher').length, icon: Shield, bg: 'bg-violet-500', light: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100' },
    { label: 'Students', value: users.filter(u => u.role === 'student').length, icon: GraduationCap, bg: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
    { label: 'Active Users', value: users.filter(u => u.status === 'active').length, icon: TrendingUp, bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">Manage system users and monitor platform activity.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statsConfig.map((stat) => (
            <div key={stat.label} className={`bg-white rounded-2xl border ${stat.border} p-5 shadow-sm hover:shadow-md transition-all`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2.5 ${stat.light} rounded-xl`}>
                  <stat.icon className={`w-5 h-5 ${stat.text}`} />
                </div>
                <div className={`w-1.5 h-8 ${stat.bg} rounded-full opacity-30`} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* User Management Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="all">All Roles</option>
              <option value="teacher">Teachers</option>
              <option value="student">Students</option>
              <option value="admin">Admins</option>
            </select>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Joined</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
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
                  filteredUsers.map((user) => (
                    <tr key={user.uid} className="hover:bg-slate-50/70 transition-all group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                            {user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{user.displayName}</div>
                            <div className="text-xs text-slate-400">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                          user.role === 'admin' ? 'bg-violet-100 text-violet-700' :
                          user.role === 'teacher' ? 'bg-indigo-100 text-indigo-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${
                          user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {user.status || 'active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => toggleUserStatus(user)}
                            className={`p-2 rounded-lg transition-all text-xs font-medium flex items-center gap-1 ${
                              user.status === 'active' 
                                ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50' 
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={user.status === 'active' ? 'Disable' : 'Enable'}
                          >
                            {user.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="px-6 py-16 text-center text-slate-400 text-sm">No users found</td></tr>
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
                <div key={user.uid} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{user.displayName}</div>
                      <div className="text-xs text-slate-400 truncate">{user.email}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          user.role === 'admin' ? 'bg-violet-100 text-violet-700' :
                          user.role === 'teacher' ? 'bg-indigo-100 text-indigo-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>{user.role}</span>
                        <span className={`flex items-center gap-1 text-[10px] font-medium ${
                          user.status === 'active' ? 'text-emerald-600' : 'text-slate-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
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
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-slate-400 text-sm">No users found</div>
            )}
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
              <h2 className="text-lg font-bold text-slate-900">Add New User</h2>
              <p className="text-sm text-slate-500 mt-0.5">Create a new teacher or student account</p>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {[
                { label: 'Full Name', key: 'name', type: 'text', placeholder: 'John Doe' },
                { label: 'Email Address', key: 'email', type: 'email', placeholder: 'john@example.com' },
                { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••' },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">{field.label}</label>
                  <input
                    required
                    type={field.type}
                    value={(newUserData as any)[field.key]}
                    onChange={(e) => setNewUserData({...newUserData, [field.key]: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Role</label>
                <select
                  value={newUserData.role}
                  onChange={(e) => setNewUserData({...newUserData, role: e.target.value as UserRole})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200">
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { UserProfile } from '../../types';
import { ShieldCheck, UserPlus, Search, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import AddTeacherModal from '../../components/AddTeacherModal';

const AVATAR_COLORS = [
  'from-violet-500 to-indigo-600',
  'from-blue-500 to-cyan-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-teal-600',
];
const getAvatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export default function AdminTeachers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/teachers');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch teachers');
      setUsers(json.teachers);
    } catch {
      toast.error('Failed to load teachers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleUserStatus = async (user: UserProfile) => {
    try {
      const newStatus = user.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', user.uid);
      if (error) throw error;
      toast.success(`Teacher ${newStatus === 'active' ? 'enabled' : 'disabled'}`);
      fetchUsers();
    } catch {
      toast.error('Failed to update teacher status');
    }
  };

  const filteredUsers = users.filter(user =>
    user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = [
    { label: 'Total Teachers', value: users.length, icon: ShieldCheck, iconBg: 'bg-violet-100 text-violet-600', grad: 'from-violet-500 to-purple-500', ring: 'ring-violet-100' },
    { label: 'Active', value: users.filter(u => u.status === 'active').length, icon: UserCheck, iconBg: 'bg-indigo-100 text-indigo-600', grad: 'from-indigo-500 to-violet-500', ring: 'ring-indigo-100' },
    { label: 'Inactive', value: users.filter(u => u.status !== 'active').length, icon: UserX, iconBg: 'bg-slate-100 text-slate-500', grad: 'from-slate-400 to-slate-500', ring: 'ring-slate-100' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Teachers</h1>
            <p className="text-slate-500 text-sm mt-1">Manage all teacher accounts in the system.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4" />
            Add Teacher
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {stats.map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              <div className={cn("h-0.5 bg-gradient-to-r", s.grad)} />
              <div className="p-5">
                <div className={cn("p-2.5 rounded-xl ring-4 inline-flex mb-4", s.iconBg, s.ring)}>
                  <s.icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 tracking-tight">{s.value}</p>
                <p className="text-sm font-medium text-slate-700 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search teachers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-8 space-y-3">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-24 text-center">
              <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-7 h-7 text-violet-300" />
              </div>
              <p className="font-semibold text-slate-700">No teachers found</p>
              <p className="text-slate-400 text-sm mt-1">
                {searchQuery ? 'Try adjusting your search.' : 'No teachers have been added yet.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-xs font-bold uppercase tracking-wider">
                      <th className="px-6 py-3.5">Teacher</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Joined</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredUsers.map(user => (
                      <tr key={user.uid} className="hover:bg-slate-50/70 transition-all group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(user.displayName)} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                              {user.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{user.displayName}</div>
                              <div className="text-xs text-slate-400">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg',
                            user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          )}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', user.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400')} />
                            {user.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => toggleUserStatus(user)}
                              title={user.status === 'active' ? 'Deactivate' : 'Activate'}
                              className={cn(
                                'p-2 rounded-lg transition-all',
                                user.status === 'active'
                                  ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'
                                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                              )}
                            >
                              {user.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-50">
                {filteredUsers.map(user => (
                  <div key={user.uid} className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(user.displayName)} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{user.displayName}</div>
                        <div className="text-xs text-slate-400 truncate">{user.email}</div>
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-medium mt-1',
                          user.status === 'active' ? 'text-emerald-600' : 'text-slate-400'
                        )}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', user.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400')} />
                          {user.status || 'active'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleUserStatus(user)}
                      className={cn(
                        'p-2 rounded-lg shrink-0 transition-all',
                        user.status === 'active'
                          ? 'text-slate-300 hover:text-orange-500 hover:bg-orange-50'
                          : 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50'
                      )}
                    >
                      {user.status === 'active' ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddTeacherModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => fetchUsers()}
        />
      )}
    </AdminLayout>
  );
}

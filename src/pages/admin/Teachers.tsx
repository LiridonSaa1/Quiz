import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { UserProfile } from '../../types';
import { ShieldCheck, UserPlus, Search, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import AddTeacherModal from '../../components/AddTeacherModal';
import { motion } from 'motion/react';
import {
  AdminListFilterBar,
  AdminListPageShell,
  ADMIN_LIST_SEARCH_INPUT,
  ADMIN_LIST_CARD_GRID,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';

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
    { label: 'Total Teachers', value: users.length, gradient: 'from-indigo-500 to-indigo-600', shadow: 'shadow-indigo-500/25', icon: ShieldCheck },
    { label: 'Active', value: users.filter(u => u.status === 'active').length, gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', icon: UserCheck },
    { label: 'Inactive', value: users.filter(u => u.status !== 'active').length, gradient: 'from-amber-500 to-amber-600', shadow: 'shadow-amber-500/25', icon: UserX },
  ];

  return (
    <AdminLayout>
      <AdminListPageShell
        breadcrumbLabel="Teachers"
        title="Teachers"
        description="Manage all teacher accounts in the system."
        statsGridClassName="grid grid-cols-2 sm:grid-cols-3 gap-4"
        action={
          <motion.button
            type="button"
            onClick={() => setShowAddModal(true)}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white shrink-0 transition-all"
            style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
              boxShadow: '0 8px 32px rgba(139,92,246,0.45), 0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <UserPlus className="w-4 h-4" />
            Add Teacher
          </motion.button>
        }
        stats={stats}
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                type="text"
                placeholder="Search teachers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={ADMIN_LIST_SEARCH_INPUT}
              />
            </div>
          </AdminListFilterBar>
        }
      >
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className={ADMIN_LIST_CARD_GRID}>
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-36 rounded-2xl bg-slate-100 animate-pulse" />
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
            <div className={ADMIN_LIST_CARD_GRID}>
              {filteredUsers.map(user => (
                <div key={user.uid} className={ADMIN_LIST_ITEM_CARD}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getAvatarColor(user.displayName)} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{user.displayName}</div>
                        <div className="text-xs text-slate-400 truncate">{user.email}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleUserStatus(user)}
                      title={user.status === 'active' ? 'Deactivate' : 'Activate'}
                      className={cn(
                        'p-2 rounded-lg shrink-0 transition-all',
                        user.status === 'active'
                          ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'
                          : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                      )}
                    >
                      {user.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 justify-between text-xs">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-lg',
                      user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    )}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', user.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400')} />
                      {user.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-slate-400">Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AdminListPageShell>

      {showAddModal && (
        <AddTeacherModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => fetchUsers()}
        />
      )}
    </AdminLayout>
  );
}

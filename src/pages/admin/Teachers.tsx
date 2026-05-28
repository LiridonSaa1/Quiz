import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import { UserProfile } from '../../types';
import { ShieldCheck, UserPlus, Search, UserCheck, UserX, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import AddTeacherModal from '../../components/AddTeacherModal';
import { motion, AnimatePresence } from 'motion/react';
import {
  AdminListFilterBar,
  AdminListPageShell,
  ADMIN_LIST_SEARCH_INPUT,
  ADMIN_LIST_CARD_GRID,
  ADMIN_LIST_ITEM_CARD,
} from '../../components/admin/AdminListPageShell';
import { authFetch, apiUrl } from '../../lib/apiUrl';

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
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const teacherToDelete = users.find(u => u.uid === confirmDeleteId);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/teachers');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch teachers');
      setUsers(Array.isArray(json.teachers) ? json.teachers : []);
    } catch {
      try {
        const [profilesRes, teachersRes] = await Promise.all([
          supabase.from('profiles').select('id, email, display_name, role, status, created_at').eq('role', 'teacher'),
          supabase.from('teachers').select('id, user_id'),
        ]);

        if (profilesRes.error) throw profilesRes.error;

        const teacherIdByUserId: Record<string, string> = {};
        if (!teachersRes.error) {
          (teachersRes.data || []).forEach((t: any) => {
            if (t?.user_id && t?.id) teacherIdByUserId[String(t.user_id)] = String(t.id);
          });
        }

        const fallbackUsers = (profilesRes.data || []).map((p: any) => ({
          uid: String(p.id),
          teacherId: teacherIdByUserId[String(p.id)] || null,
          email: String(p.email || ''),
          displayName: String(p.display_name || p.email || t('dashboard.tableHeaders.unknown')),
          role: 'teacher',
          status: p.status || 'active',
          createdAt: p.created_at || new Date().toISOString(),
        }));

        setUsers(fallbackUsers);
        if (fallbackUsers.length === 0) {
          toast.error(t('errors.loadFailed'));
        }
      } catch {
        toast.error(t('errors.loadFailed'));
      }
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
      toast.success(newStatus === 'active' ? t('teachers.teacherEnabled') : t('teachers.teacherDisabled'));
      fetchUsers();
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  };

  const editTeacher = async (user: UserProfile) => {
    const displayName = window.prompt(t('dashboard.teacherNamePrompt'), user.displayName || '');
    if (displayName === null) return;
    const email = window.prompt(t('dashboard.teacherEmailPrompt'), user.email || '');
    if (email === null) return;
    try {
      const res = await authFetch(apiUrl(`/api/admin/teachers/${encodeURIComponent(user.uid)}`), {
        method: 'PATCH',
        body: JSON.stringify({ display_name: displayName, email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || t('errors.saveFailed'));
      toast.success(t('dashboard.teacherUpdated'));
      fetchUsers();
    } catch (e: any) {
      toast.error(e?.message || t('errors.saveFailed'));
    }
  };

  const deleteTeacher = async (user: UserProfile) => {
    setConfirmDeleteId(null);
    setDeleting(true);
    try {
      const res = await authFetch(apiUrl(`/api/admin/teachers/${encodeURIComponent(user.uid)}`), { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || t('errors.deleteFailed'));
      toast.success(t('success.deleted'));
      fetchUsers();
    } catch (e: any) {
      toast.error(e?.message || t('errors.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = [
    { label: t('dashboard.totalTeachers'), value: users.length, gradient: 'from-indigo-500 to-indigo-600', shadow: 'shadow-indigo-500/25', icon: ShieldCheck },
    { label: t('common.active'), value: users.filter(u => u.status === 'active').length, gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', icon: UserCheck },
    { label: t('common.inactive'), value: users.filter(u => u.status !== 'active').length, gradient: 'from-amber-500 to-amber-600', shadow: 'shadow-amber-500/25', icon: UserX },
  ];

  return (
    <AdminLayout>
      <AdminListPageShell
        breadcrumbLabel={t('nav.teachers')}
        title={t('nav.teachers')}
        description={t('dashboard.manageTeachers')}
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
            {t('teachers.addTeacher')}
          </motion.button>
        }
        stats={stats}
        filterBar={
          <AdminListFilterBar>
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
              <input
                type="text"
                placeholder={t('teachers.searchPlaceholder')}
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
              <p className="font-semibold text-slate-700">{t('teachers.noTeachers')}</p>
              <p className="text-slate-400 text-sm mt-1">
                {searchQuery ? t('dashboard.adjustSearch') : t('dashboard.noTeachersAdded')}
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
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => editTeacher(user)}
                        title={t('common.edit')}
                        className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleUserStatus(user)}
                        title={user.status === 'active' ? t('common.disable') : t('common.enable')}
                        className={cn(
                          'p-2 rounded-lg transition-all',
                          user.status === 'active'
                            ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        )}
                      >
                        {user.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(user.uid)}
                        title={t('common.delete')}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 justify-between text-xs">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-lg',
                      user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    )}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', user.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400')} />
                      {user.status === 'active' ? t('common.active') : t('common.inactive')}
                    </span>
                    <span className="text-slate-400">{t('common.joinedDate')} {new Date(user.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AdminListPageShell>

      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(15,10,40,0.55)', backdropFilter: 'blur(6px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
            >
              <div className="flex flex-col items-center text-center gap-3 mb-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30"
                  style={{ background: 'linear-gradient(135deg,#fca5a5,#ef4444)' }}>
                  <Trash2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-lg">Delete teacher?</p>
                  <p className="text-slate-500 text-sm mt-1">This action cannot be undone.</p>
                </div>
                {teacherToDelete && (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-50 text-red-700 border border-red-200">
                    {teacherToDelete.displayName || teacherToDelete.email}
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">
                  Cancel
                </button>
                <button type="button" onClick={() => teacherToDelete && deleteTeacher(teacherToDelete)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg shadow-red-500/30 transition-all disabled:opacity-60 active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Yes, delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showAddModal && (
        <AddTeacherModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => fetchUsers()}
        />
      )}
    </AdminLayout>
  );
}

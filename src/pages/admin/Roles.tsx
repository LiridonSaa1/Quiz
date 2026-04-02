import React, { useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import {
  ShieldCheck, Users, GraduationCap, Crown,
  Check, X, Save, Info, Lock, Unlock
} from 'lucide-react';

type Role = 'admin' | 'teacher' | 'student';

interface Permission {
  id: string;
  group: string;
  label: string;
  description: string;
}

interface RolePermissions {
  admin: Record<string, boolean>;
  teacher: Record<string, boolean>;
  student: Record<string, boolean>;
}

const PERMISSIONS: Permission[] = [
  // Courses
  { id: 'courses.view',    group: 'Courses',     label: 'View Courses',        description: 'Browse and view published courses' },
  { id: 'courses.create',  group: 'Courses',     label: 'Create Courses',      description: 'Create new courses' },
  { id: 'courses.edit',    group: 'Courses',     label: 'Edit Courses',        description: 'Modify existing course content' },
  { id: 'courses.delete',  group: 'Courses',     label: 'Delete Courses',      description: 'Permanently delete courses' },
  { id: 'courses.publish', group: 'Courses',     label: 'Publish/Unpublish',   description: 'Toggle course visibility' },
  // Quizzes
  { id: 'quizzes.view',    group: 'Quizzes',     label: 'View Quizzes',        description: 'See quiz list and questions' },
  { id: 'quizzes.create',  group: 'Quizzes',     label: 'Create Quizzes',      description: 'Build new quiz assessments' },
  { id: 'quizzes.edit',    group: 'Quizzes',     label: 'Edit Quizzes',        description: 'Modify quiz questions and settings' },
  { id: 'quizzes.delete',  group: 'Quizzes',     label: 'Delete Quizzes',      description: 'Remove quiz records' },
  { id: 'quizzes.take',    group: 'Quizzes',     label: 'Take Quizzes',        description: 'Submit quiz attempts' },
  { id: 'quizzes.results', group: 'Quizzes',     label: 'View All Results',    description: 'See results for all students' },
  // Users
  { id: 'users.view',      group: 'Users',       label: 'View Users',          description: 'See user list and profiles' },
  { id: 'users.invite',    group: 'Users',       label: 'Invite Users',        description: 'Send invitations to new users' },
  { id: 'users.edit',      group: 'Users',       label: 'Edit Users',          description: 'Update user profiles and roles' },
  { id: 'users.delete',    group: 'Users',       label: 'Delete Users',        description: 'Remove user accounts' },
  { id: 'users.suspend',   group: 'Users',       label: 'Suspend Users',       description: 'Temporarily disable user access' },
  // Finance
  { id: 'finance.view',    group: 'Finance',     label: 'View Payments',       description: 'Access payment and invoice records' },
  { id: 'finance.manage',  group: 'Finance',     label: 'Manage Invoices',     description: 'Create and edit invoices' },
  { id: 'finance.refund',  group: 'Finance',     label: 'Issue Refunds',       description: 'Process payment refunds' },
  // Analytics
  { id: 'analytics.view',  group: 'Analytics',   label: 'View Analytics',      description: 'Access dashboard charts and stats' },
  { id: 'analytics.export',group: 'Analytics',   label: 'Export Reports',      description: 'Download CSV/PDF reports' },
  // Settings
  { id: 'settings.view',   group: 'Settings',    label: 'View Settings',       description: 'See platform settings pages' },
  { id: 'settings.edit',   group: 'Settings',    label: 'Edit Settings',       description: 'Modify platform configuration' },
  { id: 'settings.roles',  group: 'Settings',    label: 'Manage Roles',        description: 'Change role permissions' },
  // Certificates
  { id: 'certs.view',      group: 'Certificates',label: 'View Certificates',   description: 'Browse issued certificates' },
  { id: 'certs.issue',     group: 'Certificates',label: 'Issue Certificates',  description: 'Grant certificates to students' },
  { id: 'certs.revoke',    group: 'Certificates',label: 'Revoke Certificates', description: 'Cancel issued certificates' },
];

const defaultPermissions: RolePermissions = {
  admin: Object.fromEntries(PERMISSIONS.map(p => [p.id, true])),
  teacher: Object.fromEntries(PERMISSIONS.map(p => [p.id,
    ['courses.view','courses.create','courses.edit','courses.publish',
     'quizzes.view','quizzes.create','quizzes.edit','quizzes.results',
     'users.view','analytics.view','certs.view','certs.issue'].includes(p.id)
  ])),
  student: Object.fromEntries(PERMISSIONS.map(p => [p.id,
    ['courses.view','quizzes.view','quizzes.take','certs.view'].includes(p.id)
  ])),
};

const ROLE_META: Record<Role, { label: string; icon: React.ElementType; color: string; bg: string; desc: string; locked?: boolean }> = {
  admin:   { label: 'Administrator', icon: Crown,        color: 'text-violet-600', bg: 'bg-violet-100', desc: 'Full platform access', locked: true },
  teacher: { label: 'Teacher',       icon: ShieldCheck,  color: 'text-indigo-600', bg: 'bg-indigo-100', desc: 'Manage courses, quizzes & students' },
  student: { label: 'Student',       icon: GraduationCap,color: 'text-teal-600',   bg: 'bg-teal-100',   desc: 'Access learning content' },
};

const GROUPS = [...new Set(PERMISSIONS.map(p => p.group))];

export default function AdminRoles() {
  const [perms, setPerms] = useState<RolePermissions>(defaultPermissions);
  const [activeRole, setActiveRole] = useState<Role>('teacher');
  const [saving, setSaving] = useState(false);

  const togglePerm = (permId: string) => {
    if (activeRole === 'admin') return; // admin always has all
    setPerms(prev => ({
      ...prev,
      [activeRole]: { ...prev[activeRole], [permId]: !prev[activeRole][permId] }
    }));
  };

  const grantAll = () => {
    if (activeRole === 'admin') return;
    setPerms(prev => ({
      ...prev,
      [activeRole]: Object.fromEntries(PERMISSIONS.map(p => [p.id, true]))
    }));
    toast.success('All permissions granted.');
  };

  const revokeAll = () => {
    if (activeRole === 'admin') return;
    setPerms(prev => ({
      ...prev,
      [activeRole]: Object.fromEntries(PERMISSIONS.map(p => [p.id, false]))
    }));
    toast.success('All permissions revoked.');
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 900));
    setSaving(false);
    toast.success('Role permissions saved.');
  };

  const roleMeta = ROLE_META[activeRole];
  const RoleIcon = roleMeta.icon;
  const grantedCount = PERMISSIONS.filter(p => perms[activeRole][p.id]).length;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Roles & Permissions</h1>
            <p className="text-sm text-slate-500 mt-0.5">Control what each role can access and do</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(Object.entries(ROLE_META) as [Role, typeof ROLE_META[Role]][]).map(([role, meta]) => {
            const Icon = meta.icon;
            const count = PERMISSIONS.filter(p => perms[role][p.id]).length;
            const isActive = activeRole === role;
            return (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={cn(
                  'text-left p-5 rounded-2xl border-2 transition-all',
                  isActive ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', meta.bg, meta.color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {meta.locked && (
                    <span className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  )}
                </div>
                <p className={cn('font-bold text-sm', isActive ? 'text-indigo-700' : 'text-slate-800')}>{meta.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{meta.desc}</p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${(count / PERMISSIONS.length) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-500">{count}/{PERMISSIONS.length}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Permission Matrix */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Matrix header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', roleMeta.bg, roleMeta.color)}>
                <RoleIcon className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">{roleMeta.label} Permissions</p>
                <p className="text-xs text-slate-400">{grantedCount} of {PERMISSIONS.length} permissions granted</p>
              </div>
            </div>
            {activeRole !== 'admin' ? (
              <div className="flex gap-2">
                <button onClick={revokeAll} className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors border border-rose-100">
                  <X className="w-3.5 h-3.5" /> Revoke All
                </button>
                <button onClick={grantAll} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-emerald-100">
                  <Check className="w-3.5 h-3.5" /> Grant All
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-violet-600 font-semibold bg-violet-50 px-3 py-1.5 rounded-lg">
                <Lock className="w-3.5 h-3.5" />
                Admin has all permissions
              </div>
            )}
          </div>

          {/* Permissions list by group */}
          <div className="divide-y divide-slate-50">
            {GROUPS.map(group => (
              <div key={group}>
                <div className="px-6 py-2.5 bg-slate-50 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{group}</span>
                  <span className="text-xs text-slate-400">
                    ({PERMISSIONS.filter(p => p.group === group && perms[activeRole][p.id]).length}/{PERMISSIONS.filter(p => p.group === group).length})
                  </span>
                </div>
                {PERMISSIONS.filter(p => p.group === group).map(perm => {
                  const granted = perms[activeRole][perm.id];
                  const locked = activeRole === 'admin';
                  return (
                    <div
                      key={perm.id}
                      onClick={() => !locked && togglePerm(perm.id)}
                      className={cn(
                        'flex items-center justify-between px-6 py-3.5 transition-colors group',
                        locked ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50/80',
                        granted && !locked && 'bg-emerald-50/30'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all',
                          locked    ? 'bg-violet-100 border-violet-300 text-violet-600'
                          : granted ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 group-hover:border-slate-400'
                        )}>
                          {locked ? <Lock className="w-2.5 h-2.5" /> : granted ? <Check className="w-3 h-3" /> : null}
                        </div>
                        <div>
                          <p className={cn('text-sm font-semibold', granted ? 'text-slate-800' : 'text-slate-500')}>{perm.label}</p>
                          <p className="text-xs text-slate-400">{perm.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        {/* Show same permission across all 3 roles */}
                        <div className="hidden sm:flex items-center gap-1.5">
                          {(Object.keys(perms) as Role[]).map(r => {
                            const has = perms[r][perm.id];
                            const rm = ROLE_META[r];
                            const RI = rm.icon;
                            return (
                              <span key={r} title={`${rm.label}: ${has ? 'Granted' : 'Denied'}`}
                                className={cn('w-5 h-5 rounded-full flex items-center justify-center', has ? rm.bg : 'bg-slate-100')}>
                                <RI className={cn('w-2.5 h-2.5', has ? rm.color : 'text-slate-300')} />
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Permission changes take effect the next time a user logs in. The Administrator role always has full access and cannot be restricted.</p>
        </div>
      </div>
    </AdminLayout>
  );
}

import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import {
  LayoutDashboard, BookOpen, Users, FileText, BarChart3, LogOut,
  Menu, X, Layers, PlayCircle, School, ClipboardList, CalendarCheck,
  Award, Video, MessageSquare, Megaphone, FileBarChart, User,
  GraduationCap, ScrollText, ChevronRight, PanelLeftClose, PanelLeftOpen, Zap, FileBarChart2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import NotificationCenter from '../NotificationCenter';
import LanguageDropdown from '../LanguageDropdown';
import { authFetch } from '../../lib/apiUrl';
import { defaultFeatureFlags, extractFeatureFlags, FeatureFlags } from '../../lib/platformFeatures';
import { getTeacherPagePermission, useTeacherPermissions } from '../../lib/teacherPermissions';
import { useBranding } from '../../lib/useBranding';

function NavItem({
  item, active, collapsed, onClick,
}: {
  item: { icon: React.ElementType; label: string; path: string };
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex items-center rounded-xl transition-all duration-200 text-sm',
        collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
        active
          ? 'text-white font-semibold'
          : 'text-slate-400 hover:text-white hover:bg-white/[0.06] font-medium'
      )}
      style={active ? {
        background: 'linear-gradient(135deg, rgba(139,92,246,0.22) 0%, rgba(99,102,241,0.18) 100%)',
        boxShadow: '0 0 0 1px rgba(139,92,246,0.35), 0 4px 16px rgba(139,92,246,0.2)',
      } : undefined}
    >
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r-full"
          style={{ background: 'linear-gradient(180deg,#a78bfa,#818cf8)' }}
        />
      )}
      <item.icon className={cn(
        'shrink-0 transition-colors',
        collapsed ? 'w-5 h-5' : 'w-4 h-4',
        active ? 'text-violet-300' : 'text-slate-500 group-hover:text-slate-300'
      )} />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-violet-400/70" />}
        </>
      )}
      {collapsed && (
        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 border border-white/10 text-white text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[999] shadow-xl"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
        >
          {item.label}
        </div>
      )}
    </Link>
  );
}

function SidebarContent({
  activePath, collapsed, onCollapse, onLinkClick, onLogout, sections,
}: {
  activePath: string;
  collapsed: boolean;
  onCollapse: () => void;
  onLinkClick?: () => void;
  onLogout: () => void;
  sections: { key: string; title: string; items: { icon: React.ElementType; label: string; path: string }[] }[];
}) {
  const { t } = useTranslation();
  const [userEmail, setUserEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const branding = useBranding();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserEmail(session.user.email || '');
        setDisplayName(session.user.user_metadata?.displayName || session.user.email?.split('@')[0] || 'Teacher');
      }
    });
  }, []);

  const initials = displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg,#0c0e16 0%,#0f1525 60%,#0e1320 100%)' }}>
      {/* Logo */}
      <div className={cn(
        'flex items-center border-b border-white/[0.06] transition-all duration-300 shrink-0',
        collapsed ? 'px-3 py-4 justify-center' : 'px-5 py-5 gap-3'
      )}>
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/50 overflow-hidden">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Brand logo" className="w-full h-full object-contain rounded-xl" />
            ) : (
              <GraduationCap className="w-5 h-5 text-white" />
            )}
          </div>
          <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 opacity-25 blur-md -z-10" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-sm font-bold text-white tracking-tight">{branding.schoolName}</div>
            <div className="text-[9px] text-violet-400/70 font-semibold tracking-[0.18em] uppercase">{t('nav.teacherPortal')}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto space-y-4 scrollbar-none">
        {sections.map((section) => (
          <div key={section.key} className="space-y-0.5">
            {!collapsed ? (
              <p className="px-3 mb-2 mt-1 text-[9px] font-bold tracking-[0.2em] uppercase text-slate-500/70">
                {section.title}
              </p>
            ) : (
              <div className="h-px bg-white/[0.06] mx-2 mb-2 mt-1" />
            )}
            {section.items.map((item) => (
              <NavItem key={item.path} item={item} active={activePath === item.path} collapsed={collapsed} onClick={onLinkClick} />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-white/[0.06] space-y-1 shrink-0">
        {collapsed ? (
          <div className="flex justify-center py-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-md shadow-violet-900/40">
              {initials || 'T'}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-md shadow-violet-900/40">
              {initials || 'T'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{displayName}</div>
              <div className="text-[10px] text-slate-500 truncate">{userEmail}</div>
            </div>
          </div>
        )}

        <button
          onClick={onLogout}
          title={collapsed ? t('nav.signOut') : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/[0.08] transition-all text-sm font-medium',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{t('nav.signOut')}</span>}
        </button>

        <button
          onClick={onCollapse}
          title={collapsed ? t('nav.collapse') : t('nav.collapse')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-all text-sm font-medium',
            collapsed && 'justify-center px-2'
          )}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
          {!collapsed && <span>{t('nav.collapse')}</span>}
        </button>
      </div>
    </div>
  );
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [features, setFeatures] = useState<FeatureFlags>(defaultFeatureFlags);
  const branding = useBranding();
  const { can } = useTeacherPermissions();
  const location = useLocation();
  const navigate = useNavigate();

  const NAV_SECTIONS = [
    {
      key: 'main',
      title: t('nav.sections.main'),
      items: [
        { icon: LayoutDashboard, label: t('nav.dashboard'),  path: '/teacher' },
        { icon: BookOpen,        label: t('nav.myCourses'),  path: '/teacher/courses' },
        { icon: Layers,          label: t('nav.modules'),    path: '/teacher/modules' },
        { icon: PlayCircle,      label: t('nav.lessons'),    path: '/teacher/lessons' },
        { icon: FileText,        label: t('nav.quizzes'),    path: '/teacher/quizzes' },
        { icon: ScrollText,      label: t('nav.exams'),      path: '/teacher/exams' },
      ],
    },
    {
      key: 'students',
      title: t('nav.sections.students'),
      items: [
        { icon: Users,  label: t('nav.myStudents'), path: '/teacher/students' },
        { icon: School, label: t('nav.classes'),    path: '/teacher/classes' },
      ],
    },
    {
      key: 'learning',
      title: t('nav.sections.learning'),
      items: [
        { icon: ClipboardList, label: t('nav.assignments'), path: '/teacher/assignments' },
        { icon: CalendarCheck, label: t('nav.attendance'),  path: '/teacher/attendance' },
        { icon: Award,         label: t('nav.certificates'),path: '/teacher/certificates' },
      ],
    },
    {
      key: 'interaction',
      title: t('nav.sections.interaction'),
      items: [
        { icon: Zap,          label: t('nav.liveQuiz'),      path: '/teacher/live-quiz' },
        { icon: FileBarChart2,label: t('nav.quizReports'),   path: '/teacher/live-quiz/reports' },
        { icon: Video,        label: t('nav.liveSessions'),  path: '/teacher/live-sessions' },
        { icon: MessageSquare,label: t('nav.community'),     path: '/teacher/community' },
        { icon: Megaphone,    label: t('nav.announcements'), path: '/teacher/announcements' },
      ],
    },
    {
      key: 'analytics',
      title: t('nav.sections.analytics'),
      items: [
        { icon: BarChart3,   label: t('nav.studentProgress'), path: '/teacher/progress' },
        { icon: FileBarChart,label: t('nav.quizResults'),     path: '/teacher/results' },
      ],
    },
    {
      key: 'account',
      title: t('nav.sections.account'),
      items: [
        { icon: User, label: t('nav.profile'), path: '/teacher/profile' },
      ],
    },
  ];

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      try {
        const res = await authFetch('/api/platform/features');
        const json = await res.json();
        if (!mounted || !res.ok || !json?.success) return;
        setFeatures(extractFeatureFlags({ features: json.features }));
      } catch { /* keep defaults */ }
    };
    loadSettings();
    const onSettingsUpdated = () => loadSettings();
    window.addEventListener('settings-updated', onSettingsUpdated);
    return () => {
      mounted = false;
      window.removeEventListener('settings-updated', onSettingsUpdated);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const visibleSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const permission = getTeacherPagePermission(item.path);
        if (permission && !can(permission, true)) return false;
        if (!features.liveSessionsEnabled && item.path === '/teacher/live-sessions') return false;
        if (!features.communityEnabled && item.path === '/teacher/community') return false;
        if (!features.announcementsEnabled && item.path === '/teacher/announcements') return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  const currentLabel = visibleSections.flatMap((s) => s.items).find((i) => i.path === location.pathname)?.label || t('nav.dashboard');
  const currentPagePermission = getTeacherPagePermission(location.pathname);
  const canAccessCurrentPage = !currentPagePermission || can(currentPagePermission, true);

  const sidebarW = collapsed ? 'w-16' : 'w-60';
  const mainML  = collapsed ? 'lg:ml-16' : 'lg:ml-60';
  const headerL = collapsed ? 'lg:left-16' : 'lg:left-60';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className={cn('hidden lg:flex flex-col fixed h-full z-30 overflow-hidden border-r border-white/[0.04] transition-all duration-300 ease-in-out', sidebarW)}>
        <SidebarContent
          activePath={location.pathname}
          collapsed={collapsed}
          onCollapse={() => setCollapsed((c) => !c)}
          onLogout={handleLogout}
          sections={visibleSections}
        />
      </aside>

      {/* Desktop Topbar */}
      <header className={cn('hidden lg:flex fixed top-0 right-0 h-14 bg-white/95 backdrop-blur-md border-b border-slate-100/80 items-center justify-between px-6 z-20 transition-all duration-300 ease-in-out shadow-sm shadow-slate-100/50', headerL)}>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400 text-xs font-medium">{t('nav.teacherPortal')}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className="text-slate-800 font-semibold text-sm">{currentLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageDropdown variant="light" />
          <NotificationCenter />
        </div>
      </header>

      {/* Mobile Topbar */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-4 border-b border-white/[0.06]"
        style={{ background: '#0c0e16' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center overflow-hidden">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Brand logo" className="w-full h-full object-contain rounded-xl" />
            ) : (
              <GraduationCap className="w-4 h-4 text-white" />
            )}
          </div>
          <span className="text-sm font-bold text-white">{branding.schoolName}</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageDropdown variant="dark" />
          <NotificationCenter />
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 h-full z-50">
            <SidebarContent
              activePath={location.pathname}
              collapsed={false}
              onCollapse={() => {}}
              onLinkClick={() => setSidebarOpen(false)}
              onLogout={handleLogout}
              sections={visibleSections}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <main className={cn('flex-1 pt-14 min-h-screen transition-all duration-300 ease-in-out', mainML)}>
        <div className="px-4 sm:px-6 lg:px-8 py-7">
          {canAccessCurrentPage ? (
            children
          ) : (
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="max-w-md text-center space-y-3">
                <h2 className="text-2xl font-bold text-slate-900">{t('errors.noAccess')}</h2>
                <p className="text-slate-500 text-sm">{t('errors.noPermission')}</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

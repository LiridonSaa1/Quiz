import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import {
  LayoutDashboard, BookOpen, Users, FileText, BarChart3, LogOut,
  Menu, X, Layers, PlayCircle, School, ClipboardList, CalendarCheck,
  Award, Video, MessageSquare, Megaphone, FileBarChart, User,
  GraduationCap, ScrollText, ChevronRight, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { cn } from '../../lib/utils';
import NotificationCenter from '../NotificationCenter';

const NAV_SECTIONS = [
  {
    title: 'Main',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',  path: '/teacher' },
      { icon: BookOpen,        label: 'My Courses',  path: '/teacher/courses' },
      { icon: Layers,          label: 'Modules',     path: '/teacher/modules' },
      { icon: PlayCircle,      label: 'Lessons',     path: '/teacher/lessons' },
      { icon: FileText,        label: 'Quizzes',     path: '/teacher/quizzes' },
      { icon: ScrollText,      label: 'Exams',       path: '/teacher/exams' },
    ],
  },
  {
    title: 'Students',
    items: [
      { icon: Users,  label: 'My Students', path: '/teacher/students' },
      { icon: School, label: 'Classes',     path: '/teacher/classes' },
    ],
  },
  {
    title: 'Learning',
    items: [
      { icon: ClipboardList, label: 'Assignments', path: '/teacher/assignments' },
      { icon: CalendarCheck, label: 'Attendance',  path: '/teacher/attendance' },
      { icon: Award,         label: 'Certificates',path: '/teacher/certificates' },
    ],
  },
  {
    title: 'Interaction',
    items: [
      { icon: Video,        label: 'Live Sessions',  path: '/teacher/live-sessions' },
      { icon: MessageSquare,label: 'Community',      path: '/teacher/community' },
      { icon: Megaphone,    label: 'Announcements',  path: '/teacher/announcements' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { icon: BarChart3,   label: 'Student Progress', path: '/teacher/progress' },
      { icon: FileBarChart,label: 'Quiz Results',      path: '/teacher/results' },
    ],
  },
  {
    title: 'Account',
    items: [
      { icon: User, label: 'Profile', path: '/teacher/profile' },
    ],
  },
];

function NavItem({
  item, active, collapsed, onClick,
}: {
  item: typeof NAV_SECTIONS[0]['items'][0];
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
          ? 'bg-white/10 text-white font-semibold'
          : 'text-slate-400 hover:text-white hover:bg-white/[0.06] font-medium'
      )}
    >
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-violet-400 rounded-r-full" />
      )}
      {active && (
        <span className="absolute inset-0 rounded-xl bg-violet-500/10 -z-10" />
      )}
      <item.icon
        className={cn(
          'shrink-0 transition-colors',
          collapsed ? 'w-5 h-5' : 'w-4 h-4',
          active ? 'text-violet-400' : 'text-slate-500 group-hover:text-slate-300'
        )}
      />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-violet-400/60" />}
        </>
      )}
      {collapsed && (
        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 border border-white/10 text-white text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none whitespace-nowrap z-[999] shadow-xl">
          {item.label}
        </div>
      )}
    </Link>
  );
}

function SidebarContent({
  activePath, collapsed, onCollapse, onLinkClick, onLogout,
}: {
  activePath: string;
  collapsed: boolean;
  onCollapse: () => void;
  onLinkClick?: () => void;
  onLogout: () => void;
}) {
  const [userEmail, setUserEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

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
    <div
      className="flex flex-col h-full"
      style={{ background: 'linear-gradient(180deg,#0c0e16 0%,#0f1525 60%,#0e1320 100%)' }}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center border-b border-white/[0.06] transition-all duration-300 shrink-0',
          collapsed ? 'px-3 py-4 justify-center' : 'px-5 py-5 gap-3'
        )}
      >
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 opacity-25 blur-md -z-10" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-sm font-bold text-white tracking-tight">QuizMaster</div>
            <div className="text-[9px] text-violet-400/70 font-semibold tracking-[0.18em] uppercase">Teacher Portal</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto space-y-4 scrollbar-none">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-0.5">
            {!collapsed ? (
              <p className="px-3 mb-1.5 text-[9px] font-bold tracking-[0.18em] uppercase text-slate-600">
                {section.title}
              </p>
            ) : (
              <div className="h-px bg-white/[0.05] mx-1 mb-2" />
            )}
            {section.items.map((item) => (
              <NavItem
                key={item.path}
                item={item}
                active={activePath === item.path}
                collapsed={collapsed}
                onClick={onLinkClick}
              />
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
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/[0.08] transition-all text-sm font-medium',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>

        <button
          onClick={onCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-all text-sm font-medium',
            collapsed && 'justify-center px-2'
          )}
        >
          {collapsed
            ? <PanelLeftOpen className="w-4 h-4 shrink-0" />
            : <PanelLeftClose className="w-4 h-4 shrink-0" />
          }
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const currentLabel =
    NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.path === location.pathname)?.label || 'Dashboard';

  const sidebarW = collapsed ? 'w-16' : 'w-60';
  const mainML  = collapsed ? 'lg:ml-16' : 'lg:ml-60';
  const headerL = collapsed ? 'lg:left-16' : 'lg:left-60';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col fixed h-full z-30 overflow-hidden border-r border-white/[0.04] transition-all duration-300 ease-in-out',
          sidebarW
        )}
      >
        <SidebarContent
          activePath={location.pathname}
          collapsed={collapsed}
          onCollapse={() => setCollapsed((c) => !c)}
          onLogout={handleLogout}
        />
      </aside>

      {/* Desktop Topbar */}
      <header
        className={cn(
          'hidden lg:flex fixed top-0 right-0 h-14 bg-white/95 backdrop-blur-md border-b border-slate-100/80 items-center justify-between px-6 z-20 transition-all duration-300 ease-in-out shadow-sm shadow-slate-100/50',
          headerL
        )}
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400 text-xs font-medium">Teacher Portal</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className="text-slate-800 font-semibold text-sm">{currentLabel}</span>
        </div>
        <NotificationCenter />
      </header>

      {/* Mobile Topbar */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-4 border-b border-white/[0.06]"
        style={{ background: '#0c0e16' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-white">QuizMaster</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationCenter />
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-64 h-full z-50">
            <SidebarContent
              activePath={location.pathname}
              collapsed={false}
              onCollapse={() => {}}
              onLinkClick={() => setSidebarOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <main className={cn('flex-1 pt-14 min-h-screen transition-all duration-300 ease-in-out', mainML)}>
        <div className="px-4 sm:px-6 lg:px-8 py-7">
          {children}
        </div>
      </main>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import {
  LayoutDashboard, BookOpen, Users, FileText, BarChart3, LogOut,
  Menu, X, Layers, PlayCircle, School, ClipboardList, CalendarCheck,
  Award, Video, MessageSquare, Megaphone, FileBarChart, User,
  GraduationCap, ScrollText, ChevronRight
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

function NavItem({ item, active, onClick }: { item: typeof NAV_SECTIONS[0]['items'][0]; active: boolean; onClick?: () => void }) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-sm',
        active
          ? 'bg-white/10 text-white font-semibold'
          : 'text-slate-400 hover:text-white hover:bg-white/6 font-medium'
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-violet-400 rounded-r-full" />
      )}
      <item.icon className={cn('w-4 h-4 shrink-0 transition-colors', active ? 'text-violet-400' : 'text-slate-500 group-hover:text-slate-300')} />
      <span className="truncate">{item.label}</span>
      {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-violet-400/60" />}
    </Link>
  );
}

function SidebarContent({ activePath, onLinkClick, onLogout }: { activePath: string; onLinkClick?: () => void; onLogout: () => void }) {
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

  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg,#0f1117 0%,#111827 100%)' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.06]">
        <div className="relative">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 opacity-20 blur-sm -z-10" />
        </div>
        <div>
          <div className="text-sm font-bold text-white tracking-tight">QuizMaster</div>
          <div className="text-[9px] text-violet-400/70 font-semibold tracking-[0.18em] uppercase">Teacher Portal</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5 scrollbar-none">
        {NAV_SECTIONS.map(section => (
          <div key={section.title} className="space-y-0.5">
            <p className="px-3 mb-1.5 text-[9px] font-bold tracking-[0.18em] uppercase text-slate-600">
              {section.title}
            </p>
            {section.items.map(item => (
              <NavItem
                key={item.path}
                item={item}
                active={activePath === item.path}
                onClick={onLinkClick}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-white/[0.06] space-y-1">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials || 'T'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white truncate">{displayName}</div>
            <div className="text-[10px] text-slate-500 truncate">{userEmail}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/8 transition-all text-sm font-medium"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const currentLabel = NAV_SECTIONS.flatMap(s => s.items).find(i => i.path === location.pathname)?.label || 'Dashboard';

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 fixed h-full z-30 overflow-hidden border-r border-white/[0.04]">
        <SidebarContent
          activePath={location.pathname}
          onLogout={handleLogout}
        />
      </aside>

      {/* Desktop Topbar */}
      <header className="hidden lg:flex fixed top-0 right-0 left-60 h-14 bg-white/90 backdrop-blur-sm border-b border-slate-100 items-center justify-between px-6 z-20">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400 text-xs font-medium">Teacher Portal</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className="text-slate-800 font-semibold text-sm">{currentLabel}</span>
        </div>
        <NotificationCenter />
      </header>

      {/* Mobile Topbar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-4 border-b border-white/[0.06]"
        style={{ background: '#0f1117' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-white">QuizMaster</span>
        </div>
        <div className="flex items-center gap-2">
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
              onLinkClick={() => setSidebarOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 lg:ml-60 pt-14 min-h-screen">
        <div className="px-4 sm:px-6 lg:px-8 py-7 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

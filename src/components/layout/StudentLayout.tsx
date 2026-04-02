import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { cn } from '../../lib/utils';
import NotificationCenter from '../NotificationCenter';
import { 
  LayoutDashboard, 
  BookOpen, 
  PlayCircle, 
  HelpCircle, 
  ClipboardList, 
  BarChart3, 
  FileBarChart, 
  Award, 
  MessageSquare, 
  Video, 
  User, 
  LogOut,
  Menu,
  X,
  GraduationCap
} from 'lucide-react';

const studentNavSections = [
  {
    title: 'MAIN',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/student' },
      { icon: BookOpen, label: 'My Courses', path: '/student/courses' },
      { icon: PlayCircle, label: 'Continue Learning', path: '/student/continue' },
    ]
  },
  {
    title: 'LEARNING',
    items: [
      { icon: BookOpen, label: 'Lessons', path: '/student/lessons' },
      { icon: HelpCircle, label: 'Quizzes', path: '/student/quizzes' },
      { icon: ClipboardList, label: 'Assignments', path: '/student/assignments' },
    ]
  },
  {
    title: 'PROGRESS',
    items: [
      { icon: BarChart3, label: 'My Progress', path: '/student/progress' },
      { icon: FileBarChart, label: 'Results', path: '/student/results' },
    ]
  },
  {
    title: 'EXTRA',
    items: [
      { icon: Award, label: 'Certificates', path: '/student/certificates' },
      { icon: MessageSquare, label: 'Community', path: '/student/community' },
      { icon: Video, label: 'Live Classes', path: '/student/live-classes' },
    ]
  },
  {
    title: 'ACCOUNT',
    items: [
      { icon: User, label: 'Profile', path: '/student/profile' },
    ]
  }
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const NavItem = ({ item, onClick }: { item: any; key?: React.Key; onClick?: () => void }) => (
    <Link
      to={item.path}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium",
        location.pathname === item.path
          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/30"
          : "text-slate-400 hover:bg-slate-700/60 hover:text-white"
      )}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );

  const SidebarContent = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <>
      <div className="p-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/40">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">QuizMaster</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Student Portal</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {studentNavSections.map((section) => (
          <div key={section.title} className="space-y-0.5">
            <h3 className="px-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              {section.title}
            </h3>
            {section.items.map((item) => (
              <NavItem key={item.path} item={item} onClick={onLinkClick} />
            ))}
          </div>
        ))}
        <div className="pt-3 border-t border-slate-700/50">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </nav>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-60 bg-slate-800 fixed h-full z-30 overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Top Bar Desktop */}
      <header className="hidden lg:flex fixed top-0 right-0 left-60 h-14 bg-white border-b border-slate-200 items-center justify-between px-6 z-20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-500">
            {studentNavSections.flatMap(s => s.items).find(i => i.path === location.pathname)?.label || 'Dashboard'}
          </span>
        </div>
        <NotificationCenter />
      </header>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-slate-800 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-base font-bold text-white">QuizMaster</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationCenter />
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-slate-700 rounded-lg">
            {isSidebarOpen ? <X className="w-5 h-5 text-slate-300" /> : <Menu className="w-5 h-5 text-slate-300" />}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar */}
      {isSidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}>
          <aside className="w-64 bg-slate-800 h-full flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <SidebarContent onLinkClick={() => setIsSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-60 px-3 sm:px-4 md:px-6 lg:px-8 py-4" style={{paddingTop: '3.5rem'}}>
        <div className="max-w-8xl mx-auto pt-6">
          {children}
        </div>
      </main>
    </div>
  );
}

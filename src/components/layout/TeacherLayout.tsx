import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  FileText, 
  BarChart3, 
  LogOut,
  Menu,
  X,
  Layers,
  PlayCircle,
  School,
  ClipboardList,
  CalendarCheck,
  Award,
  Video,
  MessageSquare,
  Megaphone,
  FileBarChart,
  User
} from 'lucide-react';
import { cn } from '../../lib/utils';
import NotificationCenter from '../NotificationCenter';

const teacherNavSections = [
  {
    title: 'MAIN',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/teacher' },
      { icon: BookOpen, label: 'My Courses', path: '/teacher/courses' },
      { icon: Layers, label: 'Modules', path: '/teacher/modules' },
      { icon: PlayCircle, label: 'Lessons', path: '/teacher/lessons' },
      { icon: FileText, label: 'Quizzes', path: '/teacher/quizzes' },
    ]
  },
  {
    title: 'STUDENTS',
    items: [
      { icon: Users, label: 'My Students', path: '/teacher/students' },
      { icon: School, label: 'Classes', path: '/teacher/classes' },
    ]
  },
  {
    title: 'LEARNING',
    items: [
      { icon: ClipboardList, label: 'Assignments', path: '/teacher/assignments' },
      { icon: CalendarCheck, label: 'Attendance', path: '/teacher/attendance' },
      { icon: Award, label: 'Certificates', path: '/teacher/certificates' },
    ]
  },
  {
    title: 'INTERACTION',
    items: [
      { icon: Video, label: 'Live Sessions', path: '/teacher/live-sessions' },
      { icon: MessageSquare, label: 'Community', path: '/teacher/community' },
      { icon: Megaphone, label: 'Announcements', path: '/teacher/announcements' },
    ]
  },
  {
    title: 'ANALYTICS',
    items: [
      { icon: BarChart3, label: 'Student Progress', path: '/teacher/progress' },
      { icon: FileBarChart, label: 'Quiz Results', path: '/teacher/results' },
    ]
  },
  {
    title: 'ACCOUNT',
    items: [
      { icon: User, label: 'Profile', path: '/teacher/profile' },
    ]
  }
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const NavItem = ({ item, onClick }: { item: any, onClick?: () => void, key?: string }) => (
    <Link
      to={item.path}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-2 rounded-lg transition-all text-sm",
        location.pathname === item.path
          ? "bg-slate-900 text-white font-semibold"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      <item.icon className="w-4 h-4" />
      <span>{item.label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 fixed h-full z-30 overflow-y-auto scrollbar-hide">
        <div className="p-6 sticky top-0 bg-white z-10 border-b border-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Teacher</h1>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-6">
          {teacherNavSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <h3 className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {section.title}
              </h3>
              {section.items.map((item) => (
                <NavItem key={item.path} item={item} />
              ))}
            </div>
          ))}
          
          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2 w-full text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Top Bar Desktop */}
      <header className="hidden lg:flex fixed top-0 right-0 left-64 h-16 bg-white border-b border-slate-200 items-center justify-end px-8 z-20">
        <NotificationCenter />
      </header>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white">
            <BookOpen className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Teacher</h1>
        </div>
        <div className="flex items-center gap-4">
          <NotificationCenter />
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-50 rounded-lg">
            {isSidebarOpen ? <X className="w-6 h-6 text-slate-600" /> : <Menu className="w-6 h-6 text-slate-600" />}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar */}
      {isSidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}>
          <aside className="w-72 bg-white h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">QuizMaster</h1>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-slate-50 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <nav className="p-4 space-y-6">
              {teacherNavSections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <h3 className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {section.title}
                  </h3>
                  {section.items.map((item) => (
                    <NavItem key={item.path} item={item} onClick={() => setIsSidebarOpen(false)} />
                  ))}
                </div>
              ))}
              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-2 w-full text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all text-sm font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 p-4 md:p-8 lg:p-10 pt-20 lg:pt-24">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabase';
import { cn } from '../../lib/utils';
import NotificationCenter from '../NotificationCenter';
import { 
  LayoutDashboard, 
  BookOpen, 
  Layers, 
  PlayCircle, 
  FileText, 
  Users, 
  ShieldCheck, 
  School, 
  ClipboardList, 
  CalendarCheck, 
  Award, 
  Video, 
  MessageSquare, 
  Megaphone, 
  BarChart3, 
  FileBarChart, 
  CreditCard, 
  DollarSign, 
  Receipt, 
  Settings, 
  Palette, 
  Globe, 
  Lock, 
  User, 
  Shield, 
  LogOut,
  Menu,
  X,
  ChevronDown
} from 'lucide-react';

const adminNavSections = [
  {
    title: 'MAIN',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
      { icon: BookOpen, label: 'Courses', path: '/admin/courses' },
      { icon: Layers, label: 'Modules', path: '/admin/modules' },
      { icon: PlayCircle, label: 'Lessons', path: '/admin/lessons' },
      { icon: FileText, label: 'Quizzes', path: '/admin/quizzes' },
    ]
  },
  {
    title: 'USERS',
    items: [
      { icon: Users, label: 'Students', path: '/admin/students' },
      { icon: ShieldCheck, label: 'Teachers', path: '/admin/teachers' },
      { icon: School, label: 'Classes', path: '/admin/classes' },
    ]
  },
  {
    title: 'LEARNING',
    items: [
      { icon: ClipboardList, label: 'Assignments', path: '/admin/assignments' },
      { icon: CalendarCheck, label: 'Attendance', path: '/admin/attendance' },
      { icon: Award, label: 'Certificates', path: '/admin/certificates' },
    ]
  },
  {
    title: 'INTERACTION',
    items: [
      { icon: Video, label: 'Live Sessions', path: '/admin/live-sessions' },
      { icon: MessageSquare, label: 'Community', path: '/admin/community' },
      { icon: Megaphone, label: 'Announcements', path: '/admin/announcements' },
    ]
  },
  {
    title: 'ANALYTICS',
    items: [
      { icon: BarChart3, label: 'Analytics', path: '/admin/analytics' },
      { icon: FileBarChart, label: 'Reports', path: '/admin/reports' },
    ]
  },
  {
    title: 'BUSINESS',
    items: [
      { icon: CreditCard, label: 'Subscription', path: '/admin/subscription' },
      { icon: DollarSign, label: 'Payments', path: '/admin/payments' },
      { icon: Receipt, label: 'Invoices', path: '/admin/invoices' },
    ]
  },
  {
    title: 'SYSTEM',
    items: [
      { icon: Settings, label: 'Settings', path: '/admin/settings' },
      { icon: Palette, label: 'Branding', path: '/admin/branding' },
      { icon: Globe, label: 'Domain', path: '/admin/domain' },
      { icon: Lock, label: 'Roles & Permissions', path: '/admin/roles' },
    ]
  },
  {
    title: 'ACCOUNT',
    items: [
      { icon: User, label: 'Profile', path: '/admin/profile' },
      { icon: Shield, label: 'Security', path: '/admin/security' },
    ]
  }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Admin Panel</h1>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-6">
          {adminNavSections.map((section) => (
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
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Admin</h1>
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
              {adminNavSections.map((section) => (
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
      <main className="flex-1 lg:ml-64 px-3 sm:px-4 md:px-6 lg:px-8 py-4 pt-20 lg:pt-24">
        <div className="max-w-8xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

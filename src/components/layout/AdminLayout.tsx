import React, { useEffect, useState } from 'react';
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
  GraduationCap
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
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/config/branding');
        const json = await res.json();
        if (!mounted || !res.ok || !json?.success || !json?.value) return;
        const url = typeof json.value?.logoUrl === 'string' ? json.value.logoUrl : null;
        setBrandLogoUrl(url);
      } catch {
        // keep default logo
      }
    })();

    const onBrandUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ logoUrl?: string | null }>;
      if (custom.detail && 'logoUrl' in custom.detail) {
        setBrandLogoUrl(custom.detail.logoUrl || null);
      }
    };

    window.addEventListener('branding-updated', onBrandUpdated);
    return () => {
      mounted = false;
      window.removeEventListener('branding-updated', onBrandUpdated);
    };
  }, []);

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
          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/30"
          : "text-slate-400 hover:bg-slate-700/60 hover:text-white"
      )}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );

  const SidebarContent = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-5 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/40">
            {brandLogoUrl ? (
              <img src={brandLogoUrl} alt="Brand logo" className="w-full h-full object-contain rounded-xl" />
            ) : (
              <GraduationCap className="w-5 h-5 text-white" />
            )}
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">QuizMaster</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Admin Panel</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 min-h-0 px-3 py-4 space-y-5 overflow-y-auto scrollbar-none">
        {adminNavSections.map((section) => (
          <div key={section.title} className="space-y-0.5">
            <h3 className="px-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              {section.title}
            </h3>
            {section.items.map((item) => (
              <NavItem key={item.path} item={item} onClick={onLinkClick} />
            ))}
          </div>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-slate-700/50 shrink-0">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
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
            {adminNavSections.flatMap(s => s.items).find(i => i.path === location.pathname)?.label || 'Dashboard'}
          </span>
        </div>
        <NotificationCenter />
      </header>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-slate-800 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            {brandLogoUrl ? (
              <img src={brandLogoUrl} alt="Brand logo" className="w-full h-full object-contain rounded-lg" />
            ) : (
              <GraduationCap className="w-4 h-4 text-white" />
            )}
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
      <main className="flex-1 lg:ml-60 px-3 sm:px-4 md:px-6 lg:px-8 py-4 pt-18 lg:pt-18" style={{paddingTop: '3.5rem'}}>
        <div className="max-w-8xl mx-auto pt-6">
          {children}
        </div>
      </main>
    </div>
  );
}

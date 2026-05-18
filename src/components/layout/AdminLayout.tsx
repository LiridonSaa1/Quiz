import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import { cn } from '../../lib/utils';
import NotificationCenter from '../NotificationCenter';
import LanguageDropdown from '../LanguageDropdown';
import { authFetch } from '../../lib/apiUrl';
import { defaultFeatureFlags, extractFeatureFlags, FeatureFlags } from '../../lib/platformFeatures';
import { useBranding } from '../../lib/useBranding';
import { 
  LayoutDashboard, BookOpen, Layers, PlayCircle, FileText, Users, ShieldCheck,
  School, ClipboardList, CalendarCheck, Award, Video, MessageSquare, Megaphone,
  BarChart3, FileBarChart, DollarSign, Receipt, Settings, Palette, Lock,
  User, Shield, LogOut, Menu, X, GraduationCap, Presentation
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [features, setFeatures] = useState<FeatureFlags>(defaultFeatureFlags);
  const branding = useBranding();
  const brandLogoUrl = branding.logoUrl;
  const location = useLocation();
  const navigate = useNavigate();

  const adminNavSections = [
    {
      key: 'main',
      items: [
        { icon: LayoutDashboard, label: t('nav.dashboard'), path: '/admin' },
        { icon: BookOpen,        label: t('nav.courses'),   path: '/admin/courses' },
        { icon: Layers,          label: t('nav.modules'),   path: '/admin/modules' },
        { icon: PlayCircle,      label: t('nav.lessons'),   path: '/admin/lessons' },
        { icon: FileText,        label: t('nav.quizzes'),   path: '/admin/quizzes' },
      ]
    },
    {
      key: 'users',
      items: [
        { icon: Users,      label: t('nav.students'),  path: '/admin/students' },
        { icon: ShieldCheck,label: t('nav.teachers'),  path: '/admin/teachers' },
        { icon: School,     label: t('nav.classes'),   path: '/admin/classes' },
      ]
    },
    {
      key: 'learning',
      items: [
        { icon: ClipboardList, label: t('nav.assignments'),   path: '/admin/assignments' },
        { icon: Presentation,  label: t('nav.presentations'),path: '/admin/presentations' },
        { icon: CalendarCheck, label: t('nav.attendance'),   path: '/admin/attendance' },
        { icon: Award,         label: t('nav.certificates'), path: '/admin/certificates' },
      ]
    },
    {
      key: 'interaction',
      items: [
        { icon: Video,        label: t('nav.liveSessions'),   path: '/admin/live-sessions' },
        { icon: MessageSquare,label: t('nav.community'),      path: '/admin/community' },
        { icon: Megaphone,    label: t('nav.announcements'),  path: '/admin/announcements' },
      ]
    },
    {
      key: 'analytics',
      items: [
        { icon: BarChart3,   label: t('nav.analytics'), path: '/admin/analytics' },
        { icon: FileBarChart,label: t('nav.reports'),   path: '/admin/reports' },
      ]
    },
    {
      key: 'business',
      items: [
        { icon: DollarSign, label: t('nav.payments'), path: '/admin/payments' },
        { icon: Receipt,    label: t('nav.invoices'), path: '/admin/invoices' },
      ]
    },
    {
      key: 'system',
      items: [
        { icon: Settings, label: t('nav.settings'),          path: '/admin/settings' },
        { icon: Palette,  label: t('nav.branding'),          path: '/admin/branding' },
        { icon: Lock,     label: t('nav.rolesPermissions'),  path: '/admin/roles' },
      ]
    },
    {
      key: 'account',
      items: [
        { icon: User,   label: t('nav.profile'),  path: '/admin/profile' },
        { icon: Shield, label: t('nav.security'), path: '/admin/security' },
      ]
    }
  ];

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      try {
        const settingsRes = await authFetch('/api/admin/config/settings');
        const settingsJson = await settingsRes.json();
        if (!mounted) return;
        if (settingsRes.ok && settingsJson?.success) {
          setFeatures(extractFeatureFlags(settingsJson.value));
        }
      } catch { /* keep default features */ }
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

  const visibleSections = adminNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!features.liveSessionsEnabled && item.path === '/admin/live-sessions') return false;
        if (!features.communityEnabled && item.path === '/admin/community') return false;
        if (!features.announcementsEnabled && item.path === '/admin/announcements') return false;
        if (!features.paymentsEnabled && (item.path === '/admin/payments' || item.path === '/admin/invoices')) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  const NavItem = ({ item, onClick }: { item: any; onClick?: () => void }) => (
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
            <h1 className="text-base font-bold text-white leading-tight">{branding.schoolName}</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">{t('nav.adminPanel')}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 min-h-0 px-3 py-4 space-y-5 overflow-y-auto scrollbar-none">
        {visibleSections.map((section) => (
          <div key={section.key} className="space-y-0.5">
            <h3 className="px-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              {t(`nav.sections.${section.key}`)}
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
          <span>{t('nav.signOut')}</span>
        </button>
      </div>
    </div>
  );

  const currentLabel = visibleSections.flatMap(s => s.items).find(i => i.path === location.pathname)?.label || t('nav.dashboard');

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-60 bg-slate-800 fixed h-full z-30 overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Top Bar Desktop */}
      <header className="hidden lg:flex fixed top-0 right-0 left-60 h-14 bg-white border-b border-slate-200 items-center justify-between px-6 z-20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-500">{currentLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageDropdown variant="light" />
          <NotificationCenter />
        </div>
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
          <h1 className="text-base font-bold text-white">{branding.schoolName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <LanguageDropdown variant="dark" />
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

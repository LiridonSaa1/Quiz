import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { cn } from '../../lib/utils';
import NotificationCenter from '../NotificationCenter';
import LanguageDropdown from '../LanguageDropdown';
import { defaultFeatureFlags, extractFeatureFlags, FeatureFlags } from '../../lib/platformFeatures';
import { useBranding } from '../../lib/useBranding';
import { 
  LayoutDashboard, BookOpen, PlayCircle, HelpCircle, ClipboardList, BarChart3,
  FileBarChart, Award, MessageSquare, Video, Radio, User, LogOut, Menu, X,
  GraduationCap, ScrollText, Zap, Trophy, Megaphone, Presentation,
} from 'lucide-react';

interface NavItemDef { icon: React.ElementType; label: string; path: string; }

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [liveSessionCount, setLiveSessionCount] = useState(0);
  const [urgentAnnCount, setUrgentAnnCount] = useState(0);
  const [features, setFeatures] = useState<FeatureFlags>(defaultFeatureFlags);
  const branding = useBranding();
  const location = useLocation();
  const navigate = useNavigate();

  const studentNavSections = [
    {
      key: 'main',
      items: [
        { icon: LayoutDashboard, label: t('nav.dashboard'),        path: '/student' },
        { icon: BookOpen,        label: t('nav.myCourses'),        path: '/student/courses' },
        { icon: PlayCircle,      label: t('nav.continueLearning'), path: '/student/continue' },
      ]
    },
    {
      key: 'learning',
      items: [
        { icon: BookOpen,      label: t('nav.lessons'),     path: '/student/lessons' },
        { icon: HelpCircle,    label: t('nav.quizzes'),     path: '/student/quizzes' },
        { icon: ScrollText,    label: t('nav.exams'),       path: '/student/exams' },
        { icon: ClipboardList, label: t('nav.assignments'),   path: '/student/assignments' },
        { icon: Presentation,  label: t('nav.presentations'),path: '/student/presentations' },
      ]
    },
    {
      key: 'progress',
      items: [
        { icon: BarChart3,   label: t('nav.myProgress'), path: '/student/progress' },
        { icon: FileBarChart,label: t('nav.results'),    path: '/student/results' },
      ]
    },
    {
      key: 'extra',
      items: [
        { icon: Award,    label: t('nav.certificates'),  path: '/student/certificates'  },
        { icon: Megaphone,label: t('nav.announcements'), path: '/student/announcements' },
      ]
    },
    {
      key: 'compete',
      items: [
        { icon: Trophy, label: t('nav.badges'),   path: '/student/badges' },
        { icon: Zap,    label: t('nav.liveQuiz'), path: '/student/live-quiz' },
      ]
    },
    {
      key: 'interaction',
      items: [
        { icon: MessageSquare, label: t('nav.community'),    path: '/student/community' },
        { icon: Video,         label: t('nav.liveClasses'),  path: '/student/live-classes' },
        { icon: Radio,         label: t('nav.liveSessions'), path: '/student/live-sessions' },
      ]
    },
    {
      key: 'account',
      items: [
        { icon: User, label: t('nav.profile'), path: '/student/profile' },
      ]
    }
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

  useEffect(() => {
    if (!features.liveSessionsEnabled) { setLiveSessionCount(0); return; }
    const check = async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) return;
      try {
        const res = await authFetch('/api/student/live-sessions?status=live');
        const json = await res.json();
        if (json.success) setLiveSessionCount((json.sessions || []).length);
      } catch { /* silent */ }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [features.liveSessionsEnabled]);

  useEffect(() => {
    if (!features.announcementsEnabled) { setUrgentAnnCount(0); return; }
    const check = async () => {
      try {
        const res = await authFetch('/api/student/announcements');
        const json = await res.json();
        if (json.success) {
          const urgent = (json.announcements || []).filter((a: any) => a.priority === 'urgent').length;
          setUrgentAnnCount(urgent);
        }
      } catch { /* silent */ }
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [features.announcementsEnabled]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const visibleSections = studentNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!features.communityEnabled && item.path === '/student/community') return false;
        if (!features.liveSessionsEnabled && (item.path === '/student/live-sessions' || item.path === '/student/live-classes')) return false;
        if (!features.announcementsEnabled && item.path === '/student/announcements') return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  const NavItem = ({ item, onClick }: { item: NavItemDef; onClick?: () => void }) => {
    const isLiveSessions = item.path === '/student/live-sessions';
    const isAnnouncements = item.path === '/student/announcements';
    const badge = isLiveSessions && liveSessionCount > 0
      ? liveSessionCount
      : isAnnouncements && urgentAnnCount > 0
      ? urgentAnnCount
      : 0;
    const badgeColor = isAnnouncements ? 'bg-amber-500' : 'bg-rose-500';
    return (
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
        <span className="flex-1">{item.label}</span>
        {badge > 0 && (
          <span className={cn('inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-white text-[10px] font-bold rounded-full animate-pulse', badgeColor)}>
            {badge}
          </span>
        )}
      </Link>
    );
  };

  const SidebarContent = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <>
      <div className="p-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/40 overflow-hidden">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Brand logo" className="w-full h-full object-contain rounded-xl" />
            ) : (
              <GraduationCap className="w-5 h-5 text-white" />
            )}
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">{branding.schoolName}</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">{t('nav.studentPortal')}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto scrollbar-none">
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
        <div className="pt-3 border-t border-slate-700/50">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('nav.signOut')}</span>
          </button>
        </div>
      </nav>
    </>
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
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center overflow-hidden">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Brand logo" className="w-full h-full object-contain rounded-lg" />
            ) : (
              <GraduationCap className="w-4 h-4 text-white" />
            )}
          </div>
          <h1 className="text-base font-bold text-white">{branding.schoolName}</h1>
        </div>
        <div className="flex items-center gap-3">
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
      <main className="flex-1 lg:ml-60 px-3 sm:px-4 md:px-6 lg:px-8 py-4" style={{paddingTop: '3.5rem'}}>
        <div className="max-w-8xl mx-auto pt-6">
          {children}
        </div>
      </main>
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabase';
import { Notification } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell, Info, CheckCircle2, AlertTriangle, AlertCircle,
  X, Check, Trash2, BellOff, Sparkles, Clock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { isMissingNotificationsColumnError } from '../lib/notificationSchema';

const TYPE_CFG = {
  info:    { icon: Info,          bg: 'bg-blue-50',    text: 'text-blue-600',   ring: 'ring-blue-200',   dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700 border-blue-200'    },
  success: { icon: CheckCircle2,  bg: 'bg-emerald-50', text: 'text-emerald-600',ring: 'ring-emerald-200',dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200'},
  warning: { icon: AlertTriangle, bg: 'bg-amber-50',   text: 'text-amber-600',  ring: 'ring-amber-200',  dot: 'bg-amber-500',   pill: 'bg-amber-50 text-amber-700 border-amber-200'  },
  error:   { icon: AlertCircle,   bg: 'bg-rose-50',    text: 'text-rose-600',   ring: 'ring-rose-200',   dot: 'bg-rose-500',    pill: 'bg-rose-50 text-rose-700 border-rose-200'    },
} as const;

type NotifType = keyof typeof TYPE_CFG;

const getTypeCfg = (type: string) => TYPE_CFG[type as NotifType] ?? TYPE_CFG.info;
const getLegacyReadState = (row: any) => (typeof row?.read === 'boolean' ? row.read : Boolean(row?.read_at));

function BellIcon({ unread, shaking }: { unread: number; shaking: boolean }) {
  return (
    <motion.div
      animate={shaking ? { rotate: [0, -15, 15, -10, 10, -5, 5, 0] } : {}}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      className="relative"
    >
      <Bell className="w-5 h-5" />
      <AnimatePresence>
        {unread > 0 && (
          <motion.span
            key="badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 px-0.5 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-lg shadow-rose-300/50 ring-2 ring-white"
          >
            {unread > 99 ? '99+' : unread}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function NotifItem({
  n,
  onRead,
  onDelete,
}: {
  n: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = getTypeCfg(n.type);
  const Icon = cfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.25 }}
      onClick={() => !n.read && onRead(n.id)}
      className={cn(
        'group relative flex gap-3 px-4 py-3.5 border-b border-slate-100 last:border-0 transition-colors cursor-pointer',
        n.read ? 'hover:bg-slate-50/80' : 'bg-indigo-50/40 hover:bg-indigo-50/70'
      )}
    >
      {/* Icon */}
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ring-1', cfg.bg, cfg.ring)}>
        <Icon className={cn('w-4 h-4', cfg.text)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-6">
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <p className={cn('text-sm leading-snug', n.read ? 'text-slate-700 font-medium' : 'text-slate-900 font-bold')}>
            {n.title}
          </p>
          {!n.read && (
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              className={cn('w-2 h-2 rounded-full shrink-0 mt-1.5', cfg.dot)}
            />
          )}
        </div>
        {n.message && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{n.message}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <Clock className="w-3 h-3 text-slate-300" />
          <span className="text-[10px] text-slate-400 font-medium">
            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
          </span>
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-md border capitalize', cfg.pill)}>
            {n.type}
          </span>
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(n.id); }}
        className="absolute top-3 right-3 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400 hover:text-rose-500 transition-all"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export default function NotificationCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [filter, setFilter] = useState<'all' | NotifType>('all');
  const [userRole, setUserRole] = useState<string>('');
  const prevUnread = useRef(0);
  const channelRef = useRef<any>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;
  const getFallbackTitle = useCallback((row: any) => {
    const explicit = String(row?.title || '').trim();
    if (explicit) return explicit;

    const type = String(row?.type || '').toLowerCase();
    if (type === 'success') return t('notificationCenter.filterSuccess');
    if (type === 'warning') return t('notificationCenter.filterWarning');
    if (type === 'error') return t('notificationCenter.filterError');
    return t('notificationCenter.filterInfo');
  }, [t]);

  const isNotificationRelevantForRole = useCallback((n: Notification, role: string) => {
    if (!role) return true;
    const actionUrl = String(n.actionUrl || '').trim().toLowerCase();
    if (!actionUrl) return true;
    if (actionUrl.startsWith('/student/')) return role === 'student';
    if (actionUrl.startsWith('/teacher/')) return role === 'teacher';
    if (actionUrl.startsWith('/admin/')) return role === 'admin';
    return true;
  }, []);

  const fetchNotifications = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      console.error('Failed to fetch notifications:', error);
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    const mapped = rows.map((d: any) => ({
      id: d.id,
      userId: d.user_id,
      title: getFallbackTitle(d),
      message: String(d.message || ''),
      type: String(d.type || 'info'),
      read: getLegacyReadState(d),
      readAt: d.read_at || undefined,
      actionUrl: d.action_url || '',
      createdAt: d.created_at || d.read_at || new Date().toISOString(),
    } as Notification));
    const currentRole = userRole || '';
    setNotifications(mapped.filter((n) => isNotificationRelevantForRole(n, currentRole)));
  }, [getFallbackTitle, isNotificationRelevantForRole, userRole]);

  useEffect(() => {
    let active = true;
    const setup = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !active) return;
        const uid = session.user.id;
        const profile = await supabase
          .from('profiles')
          .select('role')
          .eq('id', uid)
          .maybeSingle();
        const role = String(profile.data?.role || '').toLowerCase();
        if (role) setUserRole(role);
        await fetchNotifications(uid);
        if (!active) return;

        try {
          const existing = (supabase.getChannels() as any[]).find(c => c.topic === `realtime:notifications:${uid}`);
          if (existing) await supabase.removeChannel(existing);
        } catch {}

        const ch = supabase
          .channel(`notifications:${uid}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
            if (active) fetchNotifications(uid);
          })
          .subscribe();
        if (active) channelRef.current = ch; else supabase.removeChannel(ch);
      } catch (error) {
        console.error('Notification channel setup failed:', error);
      }
    };
    setup();
    return () => { active = false; if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [fetchNotifications]);

  // Shake bell + play sound when new notifications arrive
  useEffect(() => {
    if (unreadCount > prevUnread.current && prevUnread.current !== undefined) {
      setShaking(true);
      setTimeout(() => setShaking(false), 800);
      // Soft notification chime using Web Audio API
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const playTone = (freq: number, startTime: number, duration: number, gain: number) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, startTime);
          gainNode.gain.setValueAtTime(0, startTime);
          gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.02);
          gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
          osc.start(startTime);
          osc.stop(startTime + duration);
        };
        const t = ctx.currentTime;
        playTone(880, t, 0.18, 0.12);
        playTone(1100, t + 0.12, 0.18, 0.09);
        playTone(1320, t + 0.24, 0.25, 0.07);
      } catch { /* audio not available */ }
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const markAsRead = async (id: string) => {
    let { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    if (error && isMissingNotificationsColumnError(error, 'read')) {
      ({ error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id));
    }
    if (error) {
      console.error('Failed to mark notification as read:', error);
    }
    const target = notifications.find((n) => n.id === id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (target?.actionUrl) navigate(target.actionUrl);
  };

  const markAllAsRead = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    let { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', session.user.id)
      .eq('read', false);
    if (error && isMissingNotificationsColumnError(error, 'read')) {
      ({ error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', session.user.id)
        .is('read_at', null));
    }
    if (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from('notifications').delete().eq('user_id', session.user.id);
    setNotifications([]);
  };

  const visible = filter === 'all' ? notifications : notifications.filter(n => n.type === filter);

  const FILTER_TABS: { key: 'all' | NotifType; label: string }[] = [
    { key: 'all',     label: t('notificationCenter.filterAll')     },
    { key: 'info',    label: t('notificationCenter.filterInfo')    },
    { key: 'success', label: t('notificationCenter.filterSuccess') },
    { key: 'warning', label: t('notificationCenter.filterWarning') },
    { key: 'error',   label: t('notificationCenter.filterError')   },
  ];

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        onMouseEnter={() => setIsOpen(true)}
        className={cn(
          'relative p-2 rounded-xl transition-all',
          isOpen
            ? 'bg-slate-100 text-slate-700'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
        )}
        aria-label="Notifications"
      >
        <BellIcon unread={unreadCount} shaking={shaking} />
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl shadow-slate-200/80 border border-slate-100 z-50 overflow-hidden"
            style={{ transformOrigin: 'top right' }}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-white/10 rounded-xl flex items-center justify-center">
                    <Bell className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-none">{t('notificationCenter.title')}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {unreadCount > 0 ? t('notificationCenter.unreadCount', { count: unreadCount }) : t('notificationCenter.allCaughtUp')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button onClick={markAllAsRead}
                      className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-all border border-white/10">
                      <Check className="w-3 h-3" /> {t('notificationCenter.markAllRead')}
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button onClick={clearAll}
                      className="flex items-center gap-1 bg-white/10 hover:bg-rose-500/30 text-white/70 hover:text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-all border border-white/10">
                      <Trash2 className="w-3 h-3" /> {t('notificationCenter.clear')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Filter tabs */}
            {notifications.length > 0 && (
              <div className="flex gap-1 px-3 py-2.5 border-b border-slate-100 bg-slate-50/60 overflow-x-auto scrollbar-none">
                {FILTER_TABS.map(t => {
                  const count = t.key === 'all'
                    ? notifications.length
                    : notifications.filter(n => n.type === t.key).length;
                  if (count === 0 && t.key !== 'all') return null;
                  return (
                    <button key={t.key} onClick={() => setFilter(t.key)}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all shrink-0',
                        filter === t.key
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-500 hover:bg-white hover:text-slate-700 border border-transparent hover:border-slate-200'
                      )}>
                      {t.label}
                      <span className={cn('text-[9px] font-black px-1 py-0.5 rounded-md min-w-[16px] text-center',
                        filter === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* List */}
            <div className="max-h-[420px] overflow-y-auto overscroll-contain">
              <AnimatePresence mode="popLayout">
                {visible.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-12 px-6 text-center"
                  >
                    <motion.div
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3 shadow-sm"
                    >
                      <BellOff className="w-6 h-6 text-slate-400" />
                    </motion.div>
                    <p className="text-slate-700 font-bold text-sm">
                      {filter === 'all' ? t('notificationCenter.noNotifications') : t('notificationCenter.noNotificationsOfType', { type: t(`notificationCenter.filter${filter.charAt(0).toUpperCase() + filter.slice(1)}`) })}
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                      {filter === 'all' ? t('notificationCenter.caughtUp') : t('notificationCenter.tryOtherFilter')}
                    </p>
                  </motion.div>
                ) : (
                  visible.map(n => (
                    <NotifItem key={n.id} n={n} onRead={markAsRead} onDelete={deleteNotification} />
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium">{t('notificationCenter.totalNotifications', { count: notifications.length })}</span>
                <span className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                  <Sparkles className="w-3 h-3" /> {t('notificationCenter.liveUpdatesOn')}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

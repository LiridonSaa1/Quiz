import React, { useEffect, useState } from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import { authFetch } from '../../lib/apiUrl';
import { motion } from 'motion/react';
import { Trophy, Star, Loader2, Lock } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Badge {
  id: string; name: string; description: string; icon: string;
  color: string; rarity: string; earned: boolean; earnedAt: string | null;
}

const RARITY_CONFIG: Record<string, { label: string; ring: string; glow: string }> = {
  common:   { label: 'Common',   ring: 'ring-slate-200',   glow: '' },
  uncommon: { label: 'Uncommon', ring: 'ring-blue-300',    glow: 'shadow-blue-200' },
  rare:     { label: 'Rare',     ring: 'ring-violet-400',  glow: 'shadow-violet-200' },
  epic:     { label: 'Epic',     ring: 'ring-amber-400',   glow: 'shadow-amber-200' },
};

function BadgeCard({ badge, index }: { badge: Badge; index: number }) {
  const rarity = RARITY_CONFIG[badge.rarity] ?? RARITY_CONFIG.common;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        'group relative flex flex-col items-center rounded-3xl border-2 p-6 text-center transition-all',
        badge.earned
          ? `bg-white ${rarity.ring} ${rarity.glow} shadow-lg`
          : 'border-slate-200 bg-slate-50 opacity-50 grayscale'
      )}
    >
      {badge.earned && badge.rarity === 'epic' && (
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-400/10 to-orange-500/10" />
      )}

      {/* Icon circle */}
      <div className={cn(
        'relative flex h-20 w-20 items-center justify-center rounded-2xl text-5xl shadow-inner',
        badge.earned ? `bg-gradient-to-br ${badge.color}` : 'bg-slate-200'
      )}>
        {badge.earned ? (
          <span>{badge.icon}</span>
        ) : (
          <Lock className="h-8 w-8 text-slate-400" />
        )}
        {badge.earned && (
          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow">
            <Star className="h-3.5 w-3.5 text-white fill-white" />
          </div>
        )}
      </div>

      <div className="mt-4">
        <span className={cn(
          'inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider mb-2',
          badge.rarity === 'epic' ? 'bg-amber-100 text-amber-700' :
          badge.rarity === 'rare' ? 'bg-violet-100 text-violet-700' :
          badge.rarity === 'uncommon' ? 'bg-blue-100 text-blue-700' :
          'bg-slate-100 text-slate-600'
        )}>{rarity.label}</span>
        <h3 className={cn('font-bold text-sm', badge.earned ? 'text-slate-900' : 'text-slate-500')}>
          {badge.name}
        </h3>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">{badge.description}</p>
      </div>

      {!badge.earned && (
        <p className="mt-3 text-xs font-semibold text-slate-400">Locked</p>
      )}
    </motion.div>
  );
}

export default function Badges() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [earnedCount, setEarnedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/student/badges').then(r => r.json()).then(json => {
      if (json.success) {
        setBadges(json.badges);
        setEarnedCount(json.earnedCount);
        setTotalCount(json.totalCount);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const earned = badges.filter(b => b.earned);
  const locked = badges.filter(b => !b.earned);

  return (
    <StudentLayout>
      <div className="min-h-full bg-gradient-to-br from-amber-50 via-white to-violet-50 p-6">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-200 text-3xl">
              🏆
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900">Achievement Badges</h1>
              <p className="text-slate-500">Earn badges by completing quizzes and reaching milestones</p>
            </div>
          </div>

          {/* Progress bar */}
          {!loading && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-700">{earnedCount} / {totalCount} badges earned</span>
                <span className="text-sm font-bold text-amber-600">{totalCount > 0 ? Math.round(earnedCount / totalCount * 100) : 0}%</span>
              </div>
              <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${totalCount > 0 ? (earnedCount / totalCount * 100) : 0}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Earned badges */}
            {earned.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-600">
                  <Trophy className="h-4 w-4" /> Earned ({earned.length})
                </h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {earned.map((b, i) => <BadgeCard key={b.id} badge={b} index={i} />)}
                </div>
              </div>
            )}

            {/* Locked badges */}
            {locked.length > 0 && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-400">
                  <Lock className="h-4 w-4" /> Locked ({locked.length})
                </h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {locked.map((b, i) => <BadgeCard key={b.id} badge={b} index={i + earned.length} />)}
                </div>
              </div>
            )}

            {badges.length === 0 && (
              <div className="py-16 text-center text-slate-400">
                <div className="text-5xl mb-4">🏅</div>
                <p className="font-semibold">No badges yet. Complete quizzes to earn them!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}

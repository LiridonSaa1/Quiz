import React, { useEffect, useState } from 'react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { supabase } from '../../supabase';
import { motion } from 'motion/react';
import { Settings, BookOpen, Loader2, CheckCircle2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface TeacherSettings {
  headwayImportEnabled: boolean;
}

const DEFAULT_SETTINGS: TeacherSettings = {
  headwayImportEnabled: true,
};

export default function TeacherSettings() {
  const [settings, setSettings] = useState<TeacherSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setUserId(session.user.id);
      try {
        const { data } = await supabase
          .from('platform_config')
          .select('value')
          .eq('key', `teacher_settings:${session.user.id}`)
          .maybeSingle();
        if (data?.value) {
          setSettings({ ...DEFAULT_SETTINGS, ...data.value });
        }
      } catch { /* use defaults */ }
      setLoading(false);
    };
    load();
  }, []);

  const save = async (patch: Partial<TeacherSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_config')
        .upsert({ key: `teacher_settings:${userId}`, value: next }, { onConflict: 'key' });
      if (error) throw error;
      toast.success('Settings saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save settings');
      setSettings(settings);
    }
    setSaving(false);
  };

  return (
    <TeacherLayout>
      <div
        className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7"
        style={{ fontFamily: "'Inter', 'Poppins', system-ui, sans-serif" }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%)',
          }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          <div className="relative px-6 sm:px-8 lg:px-10 py-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center shadow-xl">
                <Settings className="w-6 h-6 text-violet-200" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">Teacher Settings</h1>
                <p className="text-violet-200 text-sm mt-1">Manage your preferences and feature access</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 lg:px-10 py-8 max-w-3xl space-y-6">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Headway Resources</h2>
                    <p className="text-xs text-slate-500">Control access to OUP Headway content importing</p>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <label className={cn(
                    'flex items-center justify-between gap-4 cursor-pointer rounded-2xl border px-5 py-4 transition-all select-none',
                    settings.headwayImportEnabled
                      ? 'border-violet-200 bg-violet-50/60'
                      : 'border-slate-200 bg-slate-50/60'
                  )}>
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        settings.headwayImportEnabled ? 'bg-violet-100' : 'bg-slate-100'
                      )}>
                        <Shield className={cn('w-4 h-4', settings.headwayImportEnabled ? 'text-violet-600' : 'text-slate-400')} />
                      </div>
                      <div>
                        <p className={cn('text-sm font-semibold leading-tight', settings.headwayImportEnabled ? 'text-violet-800' : 'text-slate-700')}>
                          Allow Headway module & lesson import
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          When enabled, you can import content from OUP Headway levels into your courses. Disable to restrict access to headway import features.
                        </p>
                        <div className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold mt-2',
                          settings.headwayImportEnabled
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-500'
                        )}>
                          {settings.headwayImportEnabled ? (
                            <><CheckCircle2 className="w-3 h-3" /> Enabled</>
                          ) : (
                            <><Shield className="w-3 h-3" /> Disabled</>
                          )}
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.headwayImportEnabled}
                      onChange={(e) => save({ headwayImportEnabled: e.target.checked })}
                      className="sr-only"
                    />
                    <div
                      onClick={() => save({ headwayImportEnabled: !settings.headwayImportEnabled })}
                      className={cn(
                        'relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 cursor-pointer',
                        settings.headwayImportEnabled ? 'bg-violet-500' : 'bg-slate-300'
                      )}
                    >
                      {saving && (
                        <div className="absolute inset-0 rounded-full bg-white/30 flex items-center justify-center">
                          <Loader2 className="w-3 h-3 text-white animate-spin" />
                        </div>
                      )}
                      <div className={cn(
                        'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                        settings.headwayImportEnabled ? 'translate-x-7' : 'translate-x-1'
                      )} />
                    </div>
                  </label>

                  <p className="text-xs text-slate-400 px-1">
                    Changes take effect immediately. Navigating to restricted headway pages will show a locked message when this is disabled.
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </TeacherLayout>
  );
}

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, ChevronDown, ChevronRight, ExternalLink, X,
  Headphones, Video, Globe, FlaskConical, FileText,
  Download, Save, Loader2, Check, AlertCircle, RefreshCw,
} from 'lucide-react';
import { HEADWAY_FULL_DATA, OUP, CC, type HUnit } from '../../lib/headwayData';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

const HW_LEVELS = [
  { key: 'Beginner',           slug: 'beg',               tbSlug: 'beg',           color: 'from-emerald-500 to-teal-600',  badge: 'bg-emerald-100 text-emerald-700', hex: '#0d9488' },
  { key: 'Elementary',         slug: 'elementary4',        tbSlug: 'elementary4',   color: 'from-sky-500 to-blue-600',      badge: 'bg-sky-100 text-sky-700',         hex: '#0284c7' },
  { key: 'Pre-Intermediate',   slug: 'preint4',            tbSlug: 'preint4',       color: 'from-violet-500 to-purple-600', badge: 'bg-violet-100 text-violet-700',   hex: '#7c3aed' },
  { key: 'Intermediate',       slug: 'int',                tbSlug: 'int5',          color: 'from-orange-500 to-amber-600',  badge: 'bg-orange-100 text-orange-700',   hex: '#d97706' },
  { key: 'Upper-Intermediate', slug: 'upperintermediate',  tbSlug: 'upperint5',     color: 'from-rose-500 to-pink-600',     badge: 'bg-rose-100 text-rose-700',       hex: '#e11d48' },
  { key: 'Advanced',           slug: 'advanceddownload',   tbSlug: 'adv4',          color: 'from-indigo-600 to-blue-700',   badge: 'bg-indigo-100 text-indigo-700',   hex: '#4338ca' },
];

type OupLessonType = 'grammar' | 'vocabulary' | 'everyday' | 'audio' | 'video' | 'testbuilder';

interface OupLesson {
  type: OupLessonType;
  topic: string;
  url: string;
  unit: HUnit;
  levelSlug: string;
  tbSlug: string;
}

const TYPE_META: Record<OupLessonType, { label: string; icon: React.ElementType; bg: string; text: string; accent: string }> = {
  grammar:     { label: 'Grammar',         icon: FileText,    bg: 'bg-blue-50',    text: 'text-blue-700',   accent: '#3b82f6' },
  vocabulary:  { label: 'Vocabulary',      icon: BookOpen,    bg: 'bg-amber-50',   text: 'text-amber-700',  accent: '#f59e0b' },
  everyday:    { label: 'Everyday English',icon: Globe,       bg: 'bg-teal-50',    text: 'text-teal-700',   accent: '#0d9488' },
  audio:       { label: 'Audio Download',  icon: Headphones,  bg: 'bg-violet-50',  text: 'text-violet-700', accent: '#7c3aed' },
  video:       { label: 'Video Download',  icon: Video,       bg: 'bg-rose-50',    text: 'text-rose-700',   accent: '#e11d48' },
  testbuilder: { label: 'Test Builder',    icon: FlaskConical,bg: 'bg-indigo-50',  text: 'text-indigo-700', accent: '#4338ca' },
};

function buildUnitLessons(unit: HUnit, levelSlug: string, tbSlug: string): OupLesson[] {
  const lessons: OupLesson[] = [];
  for (const gr of unit.grammar) {
    lessons.push({ type: 'grammar', topic: gr.topic, url: `${OUP}${gr.path}${CC}`, unit, levelSlug, tbSlug });
  }
  for (const vc of unit.vocabulary) {
    lessons.push({ type: 'vocabulary', topic: vc.topic, url: `${OUP}${vc.path}${CC}`, unit, levelSlug, tbSlug });
  }
  lessons.push({ type: 'everyday', topic: 'Everyday English', url: `${OUP}/student/headway/${levelSlug}/everydayenglish/${unit.eeSlug}/${CC}`, unit, levelSlug, tbSlug });
  if ((unit as any).audioZip) {
    lessons.push({ type: 'audio', topic: "Student's Book Audio", url: (unit as any).audioZip, unit, levelSlug, tbSlug });
  }
  if ((unit as any).videoZip) {
    lessons.push({ type: 'video', topic: 'Video Download', url: (unit as any).videoZip, unit, levelSlug, tbSlug });
  }
  lessons.push({ type: 'testbuilder', topic: 'Test Builder Quiz', url: `${OUP}/student/headway/${tbSlug}/testbuilder${CC}`, unit, levelSlug, tbSlug });
  return lessons;
}

function LessonDetailModal({ lesson, onClose }: { lesson: OupLesson; onClose: () => void }) {
  const meta = TYPE_META[lesson.type];
  const Icon = meta.icon;

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState('');
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [showQuizSave, setShowQuizSave] = useState(false);

  const hasAudio = !!(lesson.unit as any).audioZip;
  const hasVideo = !!(lesson.unit as any).videoZip;
  const audioUrl = (lesson.unit as any).audioZip as string | undefined;
  const videoUrl = (lesson.unit as any).videoZip as string | undefined;

  const loadCourses = useCallback(async () => {
    if (courses.length > 0) return;
    setLoadingCourses(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`);
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json.courses ?? json.data ?? []);
        setCourses(list);
        if (list.length > 0) setCourseId(list[0].id);
      }
    } catch { /* ignore */ } finally {
      setLoadingCourses(false);
    }
  }, [courses.length]);

  const handleShowQuizSave = () => {
    setShowQuizSave(true);
    void loadCourses();
  };

  const handleSaveQuiz = async () => {
    if (!courseId) { toast.error('Please select a course'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Not authenticated'); return; }
      const res = await authFetch('/api/teacher/headway/save-unit-quiz', {
        method: 'POST',
        body: JSON.stringify({
          userId: session.user.id,
          courseId,
          level: Object.keys(HEADWAY_FULL_DATA).find(k => HEADWAY_FULL_DATA[k].slug === lesson.levelSlug) ?? '',
          unitNum: lesson.unit.num,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to save quiz');
      setSaved(true);
      toast.success(`Quiz saved! Find it in Teacher → Quizzes.`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save quiz');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl flex flex-col"
          initial={{ scale: 0.94, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Accent bar */}
          <div className="h-1.5 w-full rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${meta.accent}, ${meta.accent}99)` }} />

          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-slate-100">
            <div className="flex items-start gap-3 min-w-0">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', meta.bg)}>
                <Icon className={cn('w-5 h-5', meta.text)} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', meta.bg, meta.text)}>{meta.label}</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 leading-snug">
                  {lesson.type === 'grammar' ? `Grammar: ${lesson.topic}` :
                   lesson.type === 'vocabulary' ? `Vocabulary: ${lesson.topic}` :
                   lesson.topic}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{lesson.unit.title}</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0 ml-3">
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">

            {/* Unit description */}
            <p className="text-sm text-slate-500 leading-relaxed">{lesson.unit.description}</p>

            {/* Main action — open exercise */}
            {(lesson.type === 'grammar' || lesson.type === 'vocabulary' || lesson.type === 'everyday') && (
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Interactive Exercise</span>
                  <a href={lesson.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                    <ExternalLink className="w-3 h-3" /> Open in Oxford
                  </a>
                </div>
                <div className="p-4">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3">
                    <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', meta.text)} />
                    <div>
                      <p className="text-sm font-semibold text-slate-700 mb-1">
                        {lesson.type === 'grammar' ? `Grammar practice: ${lesson.topic}` :
                         lesson.type === 'vocabulary' ? `Vocabulary practice: ${lesson.topic}` :
                         'Everyday English dialogue practice'}
                      </p>
                      <p className="text-xs text-slate-500">Interactive Oxford Headway exercise — opens on the OUP student site.</p>
                      <a href={lesson.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2.5 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
                        style={{ background: meta.accent }}>
                        <ExternalLink className="w-3.5 h-3.5" /> Open Exercise
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Audio download */}
            {lesson.type === 'audio' && audioUrl && (
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
                    <Headphones className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-violet-800">Student's Book Audio</p>
                    <p className="text-xs text-violet-500">Oxford Headway · MP3 format</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Audio tracks for {lesson.unit.title} — dialogues, listening exercises and pronunciation practice.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <a href={`${OUP}/student/headway/${lesson.levelSlug}/audiodl${CC}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Open Audio Page
                  </a>
                  <a href={audioUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-violet-700 bg-white border border-violet-200 hover:bg-violet-50 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Download ZIP
                  </a>
                </div>
              </div>
            )}

            {/* Video download */}
            {lesson.type === 'video' && videoUrl && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-rose-800">Video Download</p>
                    <p className="text-xs text-rose-500">Oxford Headway · Video scripts &amp; tasks</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Video content for {lesson.unit.title} — watch and practise with video tasks.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <a href={`${OUP}/student/headway/${lesson.levelSlug}/video_bandw${CC}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Open Video Page
                  </a>
                  <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Download ZIP
                  </a>
                </div>
              </div>
            )}

            {/* Test builder */}
            {lesson.type === 'testbuilder' && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                    <FlaskConical className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-indigo-800">Oxford Test Builder</p>
                    <p className="text-xs text-indigo-500">Interactive tests for {lesson.unit.title}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Grammar and vocabulary tests generated from Oxford Headway content. Save as a quiz to your course.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <a href={lesson.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Open Test Builder
                  </a>
                  <button
                    onClick={handleShowQuizSave}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 transition-colors">
                    <Save className="w-3.5 h-3.5" /> Save as Quiz
                  </button>
                </div>

                {/* Quiz save panel */}
                <AnimatePresence>
                  {showQuizSave && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                      className="overflow-hidden">
                      <div className="mt-4 pt-4 border-t border-indigo-200">
                        {saved ? (
                          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 px-4 py-3 rounded-xl border border-emerald-200">
                            <Check className="w-4 h-4 shrink-0" />
                            Quiz saved! Find it in Teacher → Quizzes.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-xs font-semibold text-indigo-700 mb-1">Choose a course to save the quiz to:</p>
                            {loadingCourses ? (
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading courses…
                              </div>
                            ) : courses.length === 0 ? (
                              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                                <AlertCircle className="w-4 h-4 shrink-0" /> No courses found. Create a course first.
                              </div>
                            ) : (
                              <>
                                <select
                                  value={courseId}
                                  onChange={e => setCourseId(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                  {courses.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.title || c.name}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => void handleSaveQuiz()}
                                  disabled={saving}
                                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                  {saving ? 'Saving…' : 'Save Quiz'}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Audio & Video section (always shown if unit has them, for non-audio/video lesson types) */}
            {lesson.type !== 'audio' && lesson.type !== 'video' && (hasAudio || hasVideo) && (
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit Media</span>
                </div>
                <div className="p-3 flex gap-2 flex-wrap">
                  {hasAudio && audioUrl && (
                    <a href={audioUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors">
                      <Headphones className="w-3.5 h-3.5" /> Audio Download
                    </a>
                  )}
                  {hasVideo && videoUrl && (
                    <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors">
                      <Video className="w-3.5 h-3.5" /> Video Download
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100 flex justify-between items-center gap-3 bg-slate-50/50 rounded-b-2xl">
            <p className="text-[10px] text-slate-400">Oxford University Press · elt.oup.com</p>
            <a href={`${OUP}/student/headway/${lesson.tbSlug}/testbuilder${CC}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
              <FlaskConical className="w-3 h-3" /> Test Builder
            </a>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function HeadwayLibraryTab() {
  const [levelKey, setLevelKey] = useState('Pre-Intermediate');
  const [expandedUnit, setExpandedUnit] = useState<number | null>(1);
  const [selectedLesson, setSelectedLesson] = useState<OupLesson | null>(null);
  // key = "${level}:${unitNum}", value = quizId
  const [savedQuizzes, setSavedQuizzes] = useState<Map<string, string>>(new Map());
  const [regeneratingUnit, setRegeneratingUnit] = useState<string | null>(null);

  const activeLevel = HW_LEVELS.find(l => l.key === levelKey) ?? HW_LEVELS[2];
  const levelData = HEADWAY_FULL_DATA[levelKey];
  const units = levelData?.units ?? [];

  const toggleUnit = (num: number) => setExpandedUnit(p => p === num ? null : num);

  // Load saved quizzes once on mount
  useEffect(() => {
    authFetch('/api/teacher/headway/saved-quizzes')
      .then(r => r.ok ? r.json() : null)
      .then((json: any) => {
        if (json?.saved && Array.isArray(json.saved)) {
          const map = new Map<string, string>();
          (json.saved as { level: string; unitNum: number; quizId: string }[])
            .forEach(e => map.set(`${e.level}:${e.unitNum}`, e.quizId));
          setSavedQuizzes(map);
        }
      })
      .catch(() => {/* non-critical */});
  }, []);

  const handleRegenerate = async (unitKey: string) => {
    const quizId = savedQuizzes.get(unitKey);
    if (!quizId || regeneratingUnit) return;
    setRegeneratingUnit(unitKey);
    try {
      const res = await authFetch('/api/teacher/headway/regenerate-quiz', {
        method: 'POST',
        body: JSON.stringify({ quizId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Regeneration failed');
      toast.success(`Quiz regenerated with ${json.questions} new AI questions!`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to regenerate quiz');
    } finally {
      setRegeneratingUnit(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Level Selector */}
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Select Level</p>
        <div className="flex flex-wrap gap-2">
          {HW_LEVELS.map(lv => (
            <button
              key={lv.key}
              onClick={() => { setLevelKey(lv.key); setExpandedUnit(1); }}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all',
                levelKey === lv.key
                  ? `bg-gradient-to-r ${lv.color} text-white shadow-md`
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              )}>
              <BookOpen className="w-3.5 h-3.5" />
              {lv.key}
            </button>
          ))}
        </div>
      </div>

      {/* Level header with Test Builder & resource links */}
      <div className={cn('rounded-2xl overflow-hidden border', `border-${activeLevel.color.split('-')[1]}-100 bg-gradient-to-r`)}>
        <div className={cn('h-1.5 w-full bg-gradient-to-r', activeLevel.color)} />
        <div className="bg-white px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center', activeLevel.color)}>
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Headway {activeLevel.key}</h3>
              <p className="text-xs text-slate-400">{units.length} units · Grammar, Vocabulary, Audio, Video</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a href={`${OUP}/student/headway/${activeLevel.tbSlug}/testbuilder${CC}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
              style={{ background: activeLevel.hex }}>
              <FlaskConical className="w-3 h-3" /> Test Builder
            </a>
            <a href={`${OUP}/student/headway/${activeLevel.slug}/audiodl${CC}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
              <Headphones className="w-3 h-3" /> Audio
            </a>
            <a href={`${OUP}/student/headway/${activeLevel.slug}/video_bandw${CC}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
              <Video className="w-3 h-3" /> Video
            </a>
            <a href={`${OUP}/student/headway/${activeLevel.slug}/grammar${CC}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
              <BookOpen className="w-3 h-3" /> Grammar
            </a>
          </div>
        </div>
      </div>

      {/* Units Accordion */}
      <div className="space-y-3">
        {units.map(unit => {
          const isExpanded = expandedUnit === unit.num;
          const lessons = buildUnitLessons(unit, activeLevel.slug, activeLevel.tbSlug);
          const grammarCount = unit.grammar.length;
          const vocabCount = unit.vocabulary.length;

          const unitKey   = `${levelKey}:${unit.num}`;
          const hasQuiz   = savedQuizzes.has(unitKey);
          const hasAudio  = !!(unit as any).audioZip;
          const hasVideo  = !!(unit as any).videoZip;
          const isRegen   = regeneratingUnit === unitKey;

          return (
            <div key={unit.num} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Unit header (accordion toggle) */}
              <button
                onClick={() => toggleUnit(unit.num)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left">
                <div className={cn('w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 text-white text-sm font-black', activeLevel.color)}>
                  {unit.num}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 leading-tight">{unit.title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{unit.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Quiz saved badge + Regenerate button */}
                  {hasQuiz && (
                    <>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <Check className="w-2.5 h-2.5" /> Quiz
                      </span>
                      <button
                        type="button"
                        disabled={!!regeneratingUnit}
                        onClick={e => { e.stopPropagation(); void handleRegenerate(unitKey); }}
                        title="Regenerate quiz questions with AI"
                        className={cn(
                          'inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-colors',
                          isRegen
                            ? 'bg-amber-50 border-amber-200 text-amber-600'
                            : 'bg-slate-50 hover:bg-amber-50 border-slate-200 hover:border-amber-200 text-slate-400 hover:text-amber-600'
                        )}>
                        <RefreshCw className={cn('w-3.5 h-3.5', isRegen && 'animate-spin')} />
                      </button>
                    </>
                  )}
                  {/* Per-unit audio — opens OUP streaming page */}
                  {hasAudio && (
                    <a href={`${OUP}/student/headway/${activeLevel.slug}/audiodl${CC}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      title="Play unit audio on Oxford site"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-600 transition-colors border border-violet-100">
                      <Headphones className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {/* Per-unit video — opens OUP streaming page */}
                  {hasVideo && (
                    <a href={`${OUP}/student/headway/${activeLevel.slug}/video_bandw${CC}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      title="Play unit video on Oxford site"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors border border-rose-100">
                      <Video className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', activeLevel.badge)}>
                    {lessons.length} lessons
                  </span>
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>

              {/* Lessons grid */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden">
                    <div className="border-t border-slate-100 px-4 py-4">
                      {/* Section labels */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {grammarCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{grammarCount} Grammar</span>}
                        {vocabCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">{vocabCount} Vocabulary</span>}
                        {(unit as any).audioZip && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">Audio</span>}
                        {(unit as any).videoZip && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">Video</span>}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {lessons.map((lesson, idx) => {
                          const lMeta = TYPE_META[lesson.type];
                          const LIcon = lMeta.icon;
                          return (
                            <motion.button
                              key={`${lesson.type}-${idx}`}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setSelectedLesson(lesson)}
                              className={cn(
                                'w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all hover:shadow-sm',
                                lMeta.bg, `border-${lMeta.bg.split('-')[1]}-100`
                              )}>
                              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5')}
                                style={{ background: lMeta.accent + '22' }}>
                                <LIcon className="w-3.5 h-3.5" style={{ color: lMeta.accent }} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-800 leading-tight line-clamp-2">
                                  {lesson.type === 'grammar' ? `Grammar: ${lesson.topic}` :
                                   lesson.type === 'vocabulary' ? `Vocabulary: ${lesson.topic}` :
                                   lesson.topic}
                                </p>
                                <p className={cn('text-[10px] font-semibold mt-0.5', lMeta.text)}>{lMeta.label}</p>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-1" />
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Lesson Detail Modal */}
      {selectedLesson && (
        <LessonDetailModal lesson={selectedLesson} onClose={() => setSelectedLesson(null)} />
      )}
    </div>
  );
}

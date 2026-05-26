import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FlaskConical, ExternalLink, Globe, ChevronRight, ArrowLeft,
  BookOpen, Headphones, Video, Play, Layers, Download, CheckCircle2,
  Loader2, ChevronDown, X, Import, Eye, ChevronLeft, ChevronRight as ChevronRightIcon,
  RefreshCw,
} from 'lucide-react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../supabase';
import { authFetch } from '../../lib/apiUrl';
import { toast } from 'sonner';
import {
  HEADWAY_FULL_DATA,
  type HUnit,
  OUP, CC,
} from '../../lib/headwayData';

interface PreviewQuestion {
  order: number;
  type: string;
  topic: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  oxfordUrl: string;
}

const LEVELS = [
  { key: 'Beginner',          slug: 'beg',              color: 'from-emerald-500 to-teal-600',  badge: 'bg-emerald-100 text-emerald-700', units: 14 },
  { key: 'Elementary',        slug: 'elementary4',      color: 'from-sky-500 to-blue-600',      badge: 'bg-sky-100 text-sky-700',         units: 12 },
  { key: 'Pre-Intermediate',  slug: 'preint4',          color: 'from-violet-500 to-purple-600', badge: 'bg-violet-100 text-violet-700',   units: 12 },
  { key: 'Intermediate',      slug: 'int5',             color: 'from-orange-500 to-amber-600',  badge: 'bg-orange-100 text-orange-700',   units: 12 },
  { key: 'Upper-Intermediate',slug: 'upperint5',        color: 'from-rose-500 to-pink-600',     badge: 'bg-rose-100 text-rose-700',       units: 12 },
  { key: 'Advanced',          slug: 'adv4',             color: 'from-indigo-600 to-blue-700',   badge: 'bg-indigo-100 text-indigo-700',   units: 12 },
];

interface Course { id: string; title?: string; name?: string; level?: string; }

interface ImportProgress {
  unit: number;
  total: number;
  title: string;
  phase: string;
}

export default function HeadwayTestImport() {
  const navigate = useNavigate();
  const [activeLevel, setActiveLevel] = useState(LEVELS[2]);

  // Import-to-course state
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [importCourseId, setImportCourseId] = useState('');
  const [importOptions, setImportOptions] = useState({
    grammar: true,
    vocabulary: true,
    everydayEnglish: true,
    audioDownload: true,
    videoDownload: true,
    testBuilder: true,
  });
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importDone, setImportDone] = useState<{ modules: number; lessons: number } | null>(null);

  // Preview state
  const [previewUnit, setPreviewUnit] = useState<HUnit | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<PreviewQuestion[]>([]);
  const [previewQIdx, setPreviewQIdx] = useState(0);
  const [previewSelected, setPreviewSelected] = useState<number | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openPreview = async (unit: HUnit) => {
    setPreviewUnit(unit);
    setPreviewQuestions([]);
    setPreviewQIdx(0);
    setPreviewSelected(null);
    setShowPreviewModal(true);
    setPreviewLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await authFetch('/api/teacher/headway/generate-questions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ level: activeLevel.key, unitNum: unit.num }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json.questions) && json.questions.length > 0) {
        const mapped: PreviewQuestion[] = json.questions.map((q: any, i: number) => ({
          order:        i,
          type:         q.type ?? 'grammar',
          topic:        q.topic ?? '',
          questionText: q.questionText ?? q.text ?? '',
          options:      Array.isArray(q.options) ? q.options : [],
          correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
          explanation:  q.explanation ?? '',
          oxfordUrl:    q.oxfordUrl ?? `${OUP}/student/headway/${activeLevel.slug}/testbuilder${CC}`,
        }));
        setPreviewQuestions(mapped);
      } else {
        toast.error(json.error ?? 'Could not generate questions. Check your Gemini API key.');
      }
    } catch (e: any) {
      toast.error('Failed to load AI questions. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const testBuilderBase = `${OUP}/student/headway/${activeLevel.slug}/testbuilder${CC}`;
  const audioBase = `${OUP}/student/headway/${activeLevel.slug}/audiodl${CC}`;

  // Load courses when panel opens
  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const res = await authFetch(`/api/teacher/courses?userId=${encodeURIComponent(session.user.id)}`);
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json.courses ?? json.data ?? []);
        setCourses(list);
      } else {
        const { data } = await supabase.from('courses').select('id, title, level').order('created_at', { ascending: false });
        setCourses((data ?? []) as Course[]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  useEffect(() => {
    if (showImportPanel && courses.length === 0) {
      void loadCourses();
    }
  }, [showImportPanel, courses.length, loadCourses]);

  const handleImport = async () => {
    if (!importCourseId) { toast.error('Please select a course'); return; }
    setImporting(true);
    setImportProgress(null);
    setImportDone(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { toast.error('Not authenticated'); setImporting(false); return; }

      const res = await authFetch(`/api/teacher/courses/${encodeURIComponent(importCourseId)}/headway-populate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          level: activeLevel.key,
          options: importOptions,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => 'Import failed');
        toast.error(text);
        setImporting(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let finalModules = 0;
      let finalLessons = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'progress') {
              setImportProgress({ unit: ev.unit, total: ev.total, title: ev.title, phase: ev.phase });
            } else if (ev.type === 'done') {
              finalModules = ev.modules ?? 0;
              finalLessons = ev.lessons ?? 0;
            } else if (ev.type === 'error') {
              toast.error(ev.message ?? 'Import error');
            }
          } catch { /* malformed SSE line */ }
        }
      }

      setImportDone({ modules: finalModules, lessons: finalLessons });
      toast.success(`Headway ${activeLevel.key} imported — ${finalModules} modules, ${finalLessons} lessons`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Import failed');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const resetImport = () => {
    setImportDone(null);
    setImportCourseId('');
  };

  return (
    <TeacherLayout>
      <div className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-7" style={{ fontFamily: "'Inter','Poppins',system-ui,sans-serif" }}>

        {/* Hero */}
        <div className="relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1565c0 60%, #1e40af 100%)' }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative px-6 sm:px-8 lg:px-10 py-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div>
                <nav className="flex items-center gap-1.5 text-xs font-semibold mb-3">
                  <button onClick={() => navigate('/teacher/modules')} className="text-blue-300 uppercase tracking-wider hover:text-blue-100 transition-colors">
                    Courses
                  </button>
                  <ChevronRight className="w-3.5 h-3.5 text-blue-500/50" />
                  <span className="text-blue-200 uppercase tracking-wider">Headway Tests & Resources</span>
                </nav>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                  Headway Tests & Resources
                </h1>
                <p className="text-blue-200 text-sm mt-2 max-w-lg">
                  Access Oxford Headway Test Builder, audio downloads, and video resources for all levels.
                  Import directly into your courses or open resources on the Oxford site.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => { setShowImportPanel(true); setImportDone(null); }}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
                  <Import className="w-4 h-4" /> Import to Course
                </button>
                <button
                  onClick={() => navigate('/teacher/modules')}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm text-white bg-white/10 hover:bg-white/20 transition-all shrink-0">
                  <ArrowLeft className="w-4 h-4" /> Back to Courses
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 lg:px-10 py-8 bg-slate-50 space-y-6">

          {/* Level Selector */}
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Select Level</h2>
            <div className="flex flex-wrap gap-3">
              {LEVELS.map(level => (
                <button
                  key={level.key}
                  onClick={() => setActiveLevel(level)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all ${
                    activeLevel.key === level.key
                      ? `bg-gradient-to-r ${level.color} text-white shadow-lg`
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}>
                  <BookOpen className="w-4 h-4" />
                  {level.key}
                  <span className="text-xs font-semibold opacity-75">({level.units} units)</span>
                </button>
              ))}
            </div>
          </div>

          {/* Resources for selected level */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Test Builder Card */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className={`h-1.5 w-full bg-gradient-to-r ${activeLevel.color}`} />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${activeLevel.color} flex items-center justify-center`}>
                      <FlaskConical className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Test Builder</h3>
                      <p className="text-xs text-slate-400">Headway {activeLevel.key} — Interactive Tests</p>
                    </div>
                  </div>
                  <a href={testBuilderBase} target="_blank" rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all bg-gradient-to-r ${activeLevel.color} hover:opacity-90`}>
                    <ExternalLink className="w-4 h-4" /> Open
                  </a>
                </div>
                <p className="text-sm text-slate-500 mb-5">
                  Automatically generated interactive tests for grammar and vocabulary practice.
                  Open in a new tab to practice, or import all tests as quizzes into your course.
                </p>
                {/* Unit links */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">Quick Unit Links</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: activeLevel.units }, (_, i) => i + 1).map(n => (
                      <a
                        key={n}
                        href={`${testBuilderBase}&testUnit=${n}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${activeLevel.badge} border-transparent hover:opacity-80`}>
                        Unit {n}
                      </a>
                    ))}
                  </div>
                </div>
                {/* Import CTA */}
                <div className="mt-5 p-4 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-indigo-800">Import all tests into your course</p>
                    <p className="text-xs text-indigo-500 mt-0.5">Creates one quiz with MC questions per unit, linked to Oxford exercises.</p>
                  </div>
                  <button
                    onClick={() => { setShowImportPanel(true); setImportDone(null); }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
                    <Import className="w-3.5 h-3.5" /> Import
                  </button>
                </div>
              </div>
            </div>

            {/* Audio & Video Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className={`h-1.5 w-full bg-gradient-to-r ${activeLevel.color}`} />
              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                    <Headphones className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Audio & Video</h3>
                    <p className="text-xs text-slate-400">Headway {activeLevel.key}</p>
                  </div>
                </div>
                <div className="space-y-3 flex-1">
                  <a href={`${OUP}/student/headway/${activeLevel.slug}/audiodl${CC}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 transition-all group">
                    <div className="flex items-center gap-2.5">
                      <Headphones className="w-4 h-4 text-indigo-600" />
                      <div>
                        <p className="text-sm font-bold text-slate-700">Audio Downloads</p>
                        <p className="text-xs text-slate-400">Student's Book audio — MP3</p>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                  </a>
                  <a href={`${OUP}/student/headway/${activeLevel.slug}/video_bandw${CC}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-rose-50 hover:bg-rose-100 transition-all group">
                    <div className="flex items-center gap-2.5">
                      <Video className="w-4 h-4 text-rose-600" />
                      <div>
                        <p className="text-sm font-bold text-slate-700">Video</p>
                        <p className="text-xs text-slate-400">Video scripts & tasks</p>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-rose-400 group-hover:text-rose-600 transition-colors" />
                  </a>
                  <a href={`${OUP}/student/headway/${activeLevel.slug}/grammar${CC}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-all group">
                    <div className="flex items-center gap-2.5">
                      <BookOpen className="w-4 h-4 text-emerald-600" />
                      <div>
                        <p className="text-sm font-bold text-slate-700">Grammar</p>
                        <p className="text-xs text-slate-400">Interactive grammar exercises</p>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover:text-emerald-600 transition-colors" />
                  </a>
                  <a href={`${OUP}/student/headway/${activeLevel.slug}/vocabulary${CC}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-amber-50 hover:bg-amber-100 transition-all group">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-4 h-4 text-amber-600" />
                      <div>
                        <p className="text-sm font-bold text-slate-700">Vocabulary</p>
                        <p className="text-xs text-slate-400">Word exercises & practice</p>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-600 transition-colors" />
                  </a>
                  <a href={`${OUP}/student/headway/${activeLevel.slug}/download${CC}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-teal-50 hover:bg-teal-100 transition-all group">
                    <div className="flex items-center gap-2.5">
                      <Download className="w-4 h-4 text-teal-600" />
                      <div>
                        <p className="text-sm font-bold text-slate-700">All Downloads</p>
                        <p className="text-xs text-slate-400">Audio, video & workbook ZIPs</p>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-teal-400 group-hover:text-teal-600 transition-colors" />
                  </a>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <a href={`${OUP}/student/headway/${activeLevel.slug}/${CC}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">
                    <Globe className="w-4 h-4" /> All {activeLevel.key} Resources
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Audio Downloads — unit grid */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                  <Headphones className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Audio Downloads — Headway {activeLevel.key}</h3>
                  <p className="text-xs text-slate-400">Student's Book MP3 audio by unit — opens Oxford downloads page</p>
                </div>
              </div>
              <a href={audioBase} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all bg-gradient-to-r from-teal-500 to-emerald-600 hover:opacity-90">
                <Download className="w-4 h-4" /> All Audio
              </a>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Array.from({ length: activeLevel.units }, (_, i) => i + 1).map(n => (
                  <a
                    key={n}
                    href={`${audioBase}&unit=${n}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-transparent bg-teal-50 hover:border-teal-300 hover:bg-teal-100 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <Headphones className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] font-bold leading-tight text-teal-800">Unit {n}</p>
                      <p className="text-[10px] text-teal-600 mt-0.5">MP3</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Unit-by-unit Test Builder launcher */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${activeLevel.color} flex items-center justify-center`}>
                  <FlaskConical className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Test Builder — Headway {activeLevel.key}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Opens on the Oxford University Press site — each unit in a new tab
                  </p>
                </div>
              </div>
              <a href={testBuilderBase} target="_blank" rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all bg-gradient-to-r ${activeLevel.color} hover:opacity-90`}>
                <ExternalLink className="w-4 h-4" /> Open All Units
              </a>
            </div>

            {/* Notice banner */}
            <div className="mx-5 mt-5 flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
              <span className="text-amber-500 text-lg leading-none mt-0.5">⚠️</span>
              <div>
                <p className="text-sm font-bold text-amber-800">Opens in a new tab</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  The OUP Test Builder cannot be embedded — clicking any unit below opens it directly on the Oxford University Press website.
                  Use <strong>Import to Course</strong> above to create quizzes with MC questions inside your platform.
                </p>
              </div>
            </div>

            {/* Unit grid */}
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Units — Click to preview questions or open on Oxford site
                </p>
                <span className="text-xs text-slate-400 italic">
                  {HEADWAY_FULL_DATA[activeLevel.key]?.units[0]?.grammar?.length
                    ? 'Grammar & vocab questions included'
                    : 'Comprehension questions included'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {(HEADWAY_FULL_DATA[activeLevel.key]?.units ?? Array.from({ length: activeLevel.units }, (_, i) => ({ num: i + 1 } as HUnit))).map(unit => (
                  <div
                    key={unit.num}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${activeLevel.badge} border-transparent hover:shadow-md`}>
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeLevel.color} flex items-center justify-center shadow-sm`}>
                      <FlaskConical className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-[11px] font-bold leading-tight text-center">Unit {unit.num}</p>
                    {unit.grammar && unit.grammar.length > 0 && (
                      <p className="text-[9px] opacity-50 text-center leading-tight">
                        {unit.grammar.length}gr · {(unit.vocabulary?.length ?? 0)}voc
                      </p>
                    )}
                    <div className="flex gap-1 w-full mt-0.5">
                      <button
                        type="button"
                        onClick={() => { void openPreview(unit); }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold bg-white/70 hover:bg-white transition-all border border-current/20"
                        title={`Preview AI-generated questions for Unit ${unit.num}`}>
                        <Eye className="w-2.5 h-2.5" /> Preview
                      </button>
                      <a
                        href={`${testBuilderBase}&testUnit=${unit.num}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold bg-white/70 hover:bg-white transition-all border border-current/20"
                        title={`Open Unit ${unit.num} on Oxford site`}>
                        <ExternalLink className="w-2.5 h-2.5" /> Open
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex items-center justify-between gap-4 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Source: <span className="font-semibold">elt.oup.com</span> — Oxford Headway {activeLevel.key} Test Builder
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowImportPanel(true); setImportDone(null); }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
                  <Import className="w-3.5 h-3.5" /> Import to Course
                </button>
                <Link to="/teacher/quizzes/new"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all shrink-0">
                  <Play className="w-3.5 h-3.5" /> Custom Quiz
                </Link>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Import to Course Modal ───────────────────────────────────────── */}
      <AnimatePresence>
        {showImportPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
            onClick={() => !importing && setShowImportPanel(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 24 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header stripe */}
              <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />
              <div className="p-6">
                {/* Title row */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                    <Import className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Import Headway {activeLevel.key}</h3>
                    <p className="text-xs text-slate-500">Modules, lessons, audio, video & quizzes with real questions</p>
                  </div>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => setShowImportPanel(false)}
                    className="ml-auto p-2 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-40"
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>

                {importDone ? (
                  /* Success state */
                  <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                      style={{ background: 'linear-gradient(135deg,#d1fae5,#a7f3d0)' }}>
                      <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                    </div>
                    <p className="text-lg font-bold text-slate-900 mb-1">Import complete!</p>
                    <p className="text-sm text-slate-500 mb-1">
                      <span className="font-semibold text-slate-700">{importDone.modules}</span> modules and{' '}
                      <span className="font-semibold text-slate-700">{importDone.lessons}</span> lessons created
                    </p>
                    <p className="text-xs text-slate-400 mb-6">Each lesson links to real Oxford Headway exercises and quizzes include MC questions</p>
                    <div className="flex gap-3 justify-center">
                      <button
                        type="button"
                        onClick={resetImport}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                      >
                        Import Another
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowImportPanel(false); navigate('/teacher/modules'); }}
                        className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                      >
                        View Modules
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Form state */
                  <div className="space-y-4">
                    {/* Auto-level banner */}
                    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border bg-gradient-to-r ${activeLevel.badge} border-current/10`}>
                      <span className="text-base mt-0.5">🎯</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800">
                          Course level will be set automatically
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          After import, the selected course's level will be updated to{' '}
                          <span className={`font-black ${activeLevel.badge.split(' ')[1]}`}>
                            Headway {activeLevel.key}
                          </span>
                          {' '}— so tests appear under the correct level tab in Module Tests.
                        </p>
                      </div>
                    </div>

                    {/* Course selector */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Target Course</label>
                      <div className="relative">
                        {loadingCourses ? (
                          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading courses…
                          </div>
                        ) : (
                          <>
                            <select
                              value={importCourseId}
                              onChange={e => setImportCourseId(e.target.value)}
                              disabled={importing}
                              className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-9 disabled:opacity-50"
                            >
                              <option value="">Select a course…</option>
                              {courses.map(c => {
                                const courseLevel = String(c.level || '').toLowerCase();
                                const targetLevel = activeLevel.key.toLowerCase();
                                const matches = courseLevel === targetLevel || courseLevel.replace(/[- ]/g, '') === targetLevel.replace(/[- ]/g, '');
                                return (
                                  <option key={c.id} value={c.id}>
                                    {matches ? '✓ ' : ''}{c.name || c.title || 'Untitled'}{c.level ? ` [${c.level}]` : ''}
                                  </option>
                                );
                              })}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            {importCourseId && (() => {
                              const sel = courses.find(c => c.id === importCourseId);
                              const courseLevel = String(sel?.level || '').toLowerCase();
                              const targetLevel = activeLevel.key.toLowerCase();
                              const matches = courseLevel === targetLevel || courseLevel.replace(/[- ]/g, '') === targetLevel.replace(/[- ]/g, '');
                              return sel && !matches ? (
                                <p className="text-[10px] text-amber-600 mt-1 pl-1">
                                  ⚠️ This course is currently <strong>{sel.level || 'no level'}</strong> — it will be updated to <strong>{activeLevel.key}</strong> after import.
                                </p>
                              ) : sel ? (
                                <p className="text-[10px] text-emerald-600 mt-1 pl-1">
                                  ✓ Level already matches — <strong>{activeLevel.key}</strong>
                                </p>
                              ) : null;
                            })()}
                          </>
                        )}
                        {!importCourseId && <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />}
                      </div>
                    </div>

                    {/* Level display */}
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                      <BookOpen className="w-4 h-4 text-slate-400" />
                      <span className="text-xs text-slate-600">
                        Importing <span className="font-bold text-slate-800">Headway {activeLevel.key}</span> — {activeLevel.units} units
                      </span>
                    </div>

                    {/* Content options */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Include in import</label>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100 overflow-hidden">
                        {[
                          { key: 'grammar',          label: 'Grammar exercises',           icon: '📘', desc: 'Interactive grammar practice on Oxford site' },
                          { key: 'vocabulary',       label: 'Vocabulary exercises',        icon: '🌿', desc: 'Vocabulary drills linked to Oxford site' },
                          { key: 'everydayEnglish',  label: 'Everyday English',            icon: '🎤', desc: 'Dialogue videos and listening activities' },
                          { key: 'audioDownload',    label: 'Audio Downloads',             icon: '🎧', desc: "Student's Book MP3 audio with track listing" },
                          { key: 'videoDownload',    label: 'Video Downloads',             icon: '🎬', desc: 'Unit video clips with script & tasks' },
                          { key: 'testBuilder',      label: 'Test Builder (quizzes)',      icon: '📝', desc: 'MC quizzes with questions linked to Oxford exercises' },
                        ].map(({ key, label, icon, desc }) => (
                          <label
                            key={key}
                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${importing ? 'opacity-50 pointer-events-none' : 'hover:bg-indigo-50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={importOptions[key as keyof typeof importOptions]}
                              onChange={e => setImportOptions(prev => ({ ...prev, [key]: e.target.checked }))}
                              className="w-4 h-4 rounded accent-indigo-600 shrink-0"
                            />
                            <span className="text-base shrink-0">{icon}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-semibold text-slate-800">{label}</span>
                              <span className="block text-xs text-slate-500">{desc}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {importing && (
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-indigo-800">
                          <span>
                            {importProgress
                              ? `Unit ${importProgress.unit} of ${importProgress.total} — ${importProgress.phase}`
                              : 'Starting import…'}
                          </span>
                          {importProgress && (
                            <span className="text-indigo-500">
                              {Math.round((importProgress.unit / importProgress.total) * 100)}%
                            </span>
                          )}
                        </div>
                        <div className="h-2 w-full rounded-full bg-indigo-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: importProgress
                                ? `${Math.round((importProgress.unit / importProgress.total) * 100)}%`
                                : '4%',
                              background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                            }}
                          />
                        </div>
                        {importProgress && (
                          <p className="text-xs text-indigo-600 truncate">
                            {importProgress.phase === 'done'
                              ? `✓ ${importProgress.title}`
                              : `⟳ ${importProgress.title}`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Import button */}
                    <button
                      type="button"
                      disabled={importing || !importCourseId}
                      onClick={() => void handleImport()}
                      className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                    >
                      {importing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                      ) : (
                        <><Import className="w-4 h-4" /> Start Import</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quiz Preview Modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPreviewModal && previewUnit && (() => {
          const q = previewQuestions[previewQIdx];
          const typeColors: Record<string, string> = {
            grammar:     'bg-indigo-100 text-indigo-700',
            vocabulary:  'bg-emerald-100 text-emerald-700',
            comprehension: 'bg-amber-100 text-amber-700',
            testbuilder: 'bg-sky-100 text-sky-700',
          };
          const typeLabel: Record<string, string> = {
            grammar:     '📘 Grammar',
            vocabulary:  '🌿 Vocabulary',
            comprehension: '🧠 Comprehension',
            testbuilder: '🔗 Test Builder',
          };
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
              onClick={() => setShowPreviewModal(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 24 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* Colour stripe */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${activeLevel.color}`} />

                {/* Header */}
                <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeLevel.color} flex items-center justify-center shrink-0`}>
                    {previewLoading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Eye className="w-5 h-5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {previewLoading ? 'AI Generating Questions…' : 'Quiz Preview — AI Generated'}
                    </p>
                    <h3 className="text-sm font-bold text-slate-900 truncate">{previewUnit.title}</h3>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!previewLoading && previewQuestions.length > 0 && (
                      <span className="text-xs text-slate-400 font-medium">
                        {previewQIdx + 1} / {previewQuestions.length}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPreviewModal(false)}
                      className="ml-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      <X className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>
                </div>

                {/* Loading state */}
                {previewLoading && (
                  <div className="px-5 pb-8 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center">
                      <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Generating questions with Gemini AI…</p>
                      <p className="text-xs text-slate-400 mt-1">Creating real fill-in-the-blank exercises for this unit</p>
                    </div>
                  </div>
                )}

                {/* Progress dots */}
                {!previewLoading && previewQuestions.length > 0 && (
                <div className="flex gap-1 px-5 pb-3">
                  {previewQuestions.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => { setPreviewQIdx(idx); setPreviewSelected(null); }}
                      className={`h-1.5 rounded-full transition-all ${
                        idx === previewQIdx
                          ? `flex-[3] bg-gradient-to-r ${activeLevel.color}`
                          : 'flex-1 bg-slate-200 hover:bg-slate-300'
                      }`}
                    />
                  ))}
                </div>
                )}

                {/* Question body */}
                {!previewLoading && q && (
                <div className="px-5 pb-5">
                  {/* Type badge + topic */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${typeColors[q.type] ?? 'bg-slate-100 text-slate-600'}`}>
                      {typeLabel[q.type] ?? q.type}
                    </span>
                    <span className="text-xs text-slate-400 font-medium truncate">{q.topic}</span>
                  </div>

                  {/* Question text */}
                  <p className="text-sm font-semibold text-slate-800 mb-4 leading-snug">{q.questionText}</p>

                  {/* Options */}
                  <div className="space-y-2 mb-4">
                    {q.options.map((opt, oi) => {
                      const isCorrect  = oi === q.correctIndex;
                      const isSelected = previewSelected === oi;
                      const revealed   = previewSelected !== null;
                      let cls = 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 text-slate-700';
                      if (revealed && isCorrect)  cls = 'border-emerald-400 bg-emerald-50 text-emerald-800';
                      else if (revealed && isSelected) cls = 'border-rose-300 bg-rose-50 text-rose-700';
                      return (
                        <button
                          key={oi}
                          type="button"
                          disabled={previewSelected !== null}
                          onClick={() => setPreviewSelected(oi)}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl border-2 text-xs font-medium transition-all flex items-start gap-2.5 ${cls}`}
                        >
                          <span className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold mt-px ${
                            revealed && isCorrect  ? 'border-emerald-500 bg-emerald-500 text-white'
                            : revealed && isSelected ? 'border-rose-400 bg-rose-400 text-white'
                            : 'border-slate-300 text-slate-400'
                          }`}>
                            {String.fromCharCode(65 + oi)}
                          </span>
                          <span className="leading-relaxed break-all">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Explanation after answer */}
                  {previewSelected !== null && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-xl text-xs mb-4 ${
                        previewSelected === q.correctIndex
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border border-rose-200 text-rose-800'
                      }`}
                    >
                      <p className="font-bold mb-1">
                        {previewSelected === q.correctIndex ? '✓ Correct!' : '✗ Not quite.'}
                      </p>
                      <p className="leading-relaxed line-clamp-3">{q.explanation}</p>
                      {q.oxfordUrl && (
                        <a href={q.oxfordUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1.5 font-semibold underline hover:no-underline">
                          <ExternalLink className="w-3 h-3" /> Open on Oxford site
                        </a>
                      )}
                    </motion.div>
                  )}

                  {/* Nav footer */}
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={previewQIdx === 0}
                      onClick={() => { setPreviewQIdx(i => i - 1); setPreviewSelected(null); }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-all"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Prev
                    </button>

                    <div className="flex-1 flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setShowImportPanel(true); setShowPreviewModal(false); setImportDone(null); }}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white transition-all"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                      >
                        <Import className="w-3.5 h-3.5" /> Import to Course
                      </button>
                      <button
                        type="button"
                        disabled={previewLoading}
                        onClick={() => previewUnit && void openPreview(previewUnit)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-all"
                      >
                        <RefreshCw className={`w-3 h-3 ${previewLoading ? 'animate-spin' : ''}`} /> Regenerate Questions
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={previewQIdx === previewQuestions.length - 1}
                      onClick={() => { setPreviewQIdx(i => i + 1); setPreviewSelected(null); }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-all"
                    >
                      Next <ChevronRightIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                )}
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </TeacherLayout>
  );
}

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FlaskConical, ExternalLink, Globe, ChevronRight, ArrowLeft,
  BookOpen, Headphones, Video, Play, Layers,
} from 'lucide-react';
import TeacherLayout from '../../components/layout/TeacherLayout';
import { motion } from 'motion/react';

const OUP = 'https://elt.oup.com';
const CC  = '?cc=global&selLanguage=en';

const LEVELS = [
  {
    key: 'Beginner',
    slug: 'beg',
    color: 'from-emerald-500 to-teal-600',
    badge: 'bg-emerald-100 text-emerald-700',
    units: 14,
  },
  {
    key: 'Elementary',
    slug: 'elementary4',
    color: 'from-sky-500 to-blue-600',
    badge: 'bg-sky-100 text-sky-700',
    units: 12,
  },
  {
    key: 'Pre-Intermediate',
    slug: 'preint4',
    color: 'from-violet-500 to-purple-600',
    badge: 'bg-violet-100 text-violet-700',
    units: 12,
  },
  {
    key: 'Intermediate',
    slug: 'int5',
    color: 'from-orange-500 to-amber-600',
    badge: 'bg-orange-100 text-orange-700',
    units: 12,
  },
  {
    key: 'Upper-Intermediate',
    slug: 'upperint5',
    color: 'from-rose-500 to-pink-600',
    badge: 'bg-rose-100 text-rose-700',
    units: 12,
  },
  {
    key: 'Advanced',
    slug: 'adv4',
    color: 'from-indigo-600 to-blue-700',
    badge: 'bg-indigo-100 text-indigo-700',
    units: 12,
  },
];

const RESOURCES = [
  { label: 'Test Builder', icon: FlaskConical, path: 'testbuilder', desc: 'Interactive grammar & vocabulary tests' },
  { label: 'Audio Downloads', icon: Headphones, path: 'audiodl', desc: "Student's Book audio by unit" },
  { label: 'Video', icon: Video, path: 'video_bandw', desc: 'Headway video scripts & tasks' },
];

export default function HeadwayTestImport() {
  const navigate = useNavigate();
  const [activeLevel, setActiveLevel] = useState(LEVELS[2]);
  const [expandedResource, setExpandedResource] = useState<string | null>('Test Builder');

  const testBuilderBase = `${OUP}/student/headway/${activeLevel.slug}/testbuilder${CC}`;
  const audioBase = `${OUP}/student/headway/${activeLevel.slug}/audiodl${CC}`;

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
                  Use these to enrich your lessons or assign as student practice.
                </p>
              </div>
              <button
                onClick={() => navigate('/teacher/modules')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm text-white bg-white/10 hover:bg-white/20 transition-all shrink-0">
                <ArrowLeft className="w-4 h-4" /> Back to Courses
              </button>
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
                  Open in a new tab to practice, or share unit-specific URLs with your students.
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
                {/* Create quiz CTA */}
                <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-700">Create a custom quiz instead?</p>
                    <p className="text-xs text-slate-400 mt-0.5">Build your own Headway-style quiz using the quiz builder.</p>
                  </div>
                  <Link to="/teacher/quizzes/new"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
                    <Play className="w-3.5 h-3.5" /> New Quiz
                  </Link>
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
                        <p className="text-xs text-slate-400">Student's Book audio</p>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                  </a>
                  <a href={`${OUP}/student/headway/${activeLevel.slug}/video${CC}`}
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

          {/* Embedded Test Builder */}
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
                  <p className="text-xs text-slate-400">Live preview from Oxford University Press</p>
                </div>
              </div>
              <a href={testBuilderBase} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Full Screen
              </a>
            </div>
            <div className="relative bg-slate-100" style={{ height: '500px' }}>
              <iframe
                key={activeLevel.slug}
                src={testBuilderBase}
                title={`Headway ${activeLevel.key} Test Builder`}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-slate-400 text-sm">Loading Test Builder...</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </TeacherLayout>
  );
}

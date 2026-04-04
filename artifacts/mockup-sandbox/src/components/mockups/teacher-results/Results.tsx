import { useState, useMemo } from "react";
import {
  BarChart3, Search, Download, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, TrendingUp, FileText, Clock,
  Trophy, Flame, Activity, LayoutDashboard, BookOpen,
  Layers, PlayCircle, Users, School, ClipboardList,
  CalendarCheck, Award, Video, MessageSquare, Megaphone,
  FileBarChart, User, LogOut, GraduationCap
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";

type TabFilter = "all" | "passed" | "failed";
type SortField = "student" | "quiz" | "score" | "date" | "duration";

const mockAttempts = [
  { id: "1", studentId: "s1", quizId: "q1", score: 88, totalPoints: 100, passed: true, status: "completed", correctAnswers: 22, totalQuestions: 25, completedAt: "2026-04-01T10:30:00Z", startedAt: "2026-04-01T10:05:00Z" },
  { id: "2", studentId: "s2", quizId: "q2", score: 45, totalPoints: 100, passed: false, status: "completed", correctAnswers: 9, totalQuestions: 20, completedAt: "2026-04-01T14:20:00Z", startedAt: "2026-04-01T14:00:00Z" },
  { id: "3", studentId: "s3", quizId: "q1", score: 96, totalPoints: 100, passed: true, status: "completed", correctAnswers: 24, totalQuestions: 25, completedAt: "2026-04-02T09:15:00Z", startedAt: "2026-04-02T08:55:00Z" },
  { id: "4", studentId: "s1", quizId: "q3", score: 72, totalPoints: 100, passed: true, status: "completed", correctAnswers: 18, totalQuestions: 25, completedAt: "2026-04-02T11:00:00Z", startedAt: "2026-04-02T10:35:00Z" },
  { id: "5", studentId: "s4", quizId: "q2", score: 30, totalPoints: 100, passed: false, status: "completed", correctAnswers: 6, totalQuestions: 20, completedAt: "2026-04-02T16:00:00Z", startedAt: "2026-04-02T15:40:00Z" },
  { id: "6", studentId: "s5", quizId: "q1", score: 83, totalPoints: 100, passed: true, status: "completed", correctAnswers: 21, totalQuestions: 25, completedAt: "2026-04-03T10:00:00Z", startedAt: "2026-04-03T09:38:00Z" },
  { id: "7", studentId: "s6", quizId: "q4", score: 60, totalPoints: 100, passed: true, status: "completed", correctAnswers: 12, totalQuestions: 20, completedAt: "2026-04-03T13:30:00Z", startedAt: "2026-04-03T13:10:00Z" },
  { id: "8", studentId: "s2", quizId: "q3", score: 55, totalPoints: 100, passed: false, status: "completed", correctAnswers: 11, totalQuestions: 20, completedAt: "2026-04-04T09:00:00Z", startedAt: "2026-04-04T08:42:00Z" },
  { id: "9", studentId: "s7", quizId: "q2", score: 91, totalPoints: 100, passed: true, status: "completed", correctAnswers: 18, totalQuestions: 20, completedAt: "2026-04-04T11:20:00Z", startedAt: "2026-04-04T10:58:00Z" },
  { id: "10", studentId: "s3", quizId: "q4", score: 78, totalPoints: 100, passed: true, status: "completed", correctAnswers: 15, totalQuestions: 20, completedAt: "2026-04-04T14:00:00Z", startedAt: "2026-04-04T13:44:00Z" },
];

const mockStudents: Record<string, string> = {
  s1: "Emma Johnson", s2: "James Smith", s3: "Olivia Davis",
  s4: "Liam Martinez", s5: "Sophia Brown", s6: "Noah Wilson",
  s7: "Ava Thompson",
};

const mockQuizzes: Record<string, string> = {
  q1: "JavaScript Fundamentals", q2: "React Basics",
  q3: "CSS & Tailwind", q4: "TypeScript Essentials",
};

const trendData = [
  { day: "03/29", attempts: 1, avgScore: 72 },
  { day: "03/30", attempts: 0, avgScore: 0 },
  { day: "03/31", attempts: 2, avgScore: 68 },
  { day: "04/01", attempts: 3, avgScore: 74 },
  { day: "04/02", attempts: 3, avgScore: 66 },
  { day: "04/03", attempts: 2, avgScore: 72 },
  { day: "04/04", attempts: 3, avgScore: 80 },
];

const quizBreakdown = [
  { id: "q1", title: "JavaScript Fundamentals", count: 3, avgScore: 89, passRate: 100 },
  { id: "q2", title: "React Basics", count: 3, avgScore: 55, passRate: 33 },
  { id: "q3", title: "CSS & Tailwind", count: 2, avgScore: 64, passRate: 50 },
  { id: "q4", title: "TypeScript Essentials", count: 2, avgScore: 69, passRate: 100 },
];

const navSections = [
  { title: "MAIN", items: [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: BookOpen, label: "My Courses" },
    { icon: Layers, label: "Modules" },
    { icon: PlayCircle, label: "Lessons" },
    { icon: FileText, label: "Quizzes" },
  ]},
  { title: "STUDENTS", items: [
    { icon: Users, label: "My Students" },
    { icon: School, label: "Classes" },
  ]},
  { title: "LEARNING", items: [
    { icon: ClipboardList, label: "Assignments" },
    { icon: CalendarCheck, label: "Attendance" },
    { icon: Award, label: "Certificates" },
  ]},
  { title: "INTERACTION", items: [
    { icon: Video, label: "Live Sessions" },
    { icon: MessageSquare, label: "Community" },
    { icon: Megaphone, label: "Announcements" },
  ]},
  { title: "ANALYTICS", items: [
    { icon: BarChart3, label: "Student Progress" },
    { icon: FileBarChart, label: "Quiz Results", active: true },
  ]},
  { title: "ACCOUNT", items: [
    { icon: User, label: "Profile" },
  ]},
];

function getPct(a: typeof mockAttempts[0]) {
  return a.totalPoints > 0 ? Math.round((a.score / a.totalPoints) * 100) : 0;
}

function getDuration(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

function scoreColor(pct: number) {
  if (pct >= 80) return "from-emerald-400 to-emerald-500";
  if (pct >= 65) return "from-blue-400 to-indigo-500";
  if (pct >= 45) return "from-amber-400 to-orange-500";
  return "from-rose-400 to-red-500";
}

export function Results() {
  const [tab, setTab] = useState<TabFilter>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedQuiz, setSelectedQuiz] = useState("all");

  const stats = {
    total: mockAttempts.length,
    passRate: Math.round((mockAttempts.filter(a => a.passed).length / mockAttempts.length) * 100),
    avgScore: Math.round(mockAttempts.reduce((s, a) => s + getPct(a), 0) / mockAttempts.length),
    highScore: Math.max(...mockAttempts.map(getPct)),
    avgDuration: Math.round(mockAttempts.reduce((s, a) => s + getDuration(a.startedAt, a.completedAt), 0) / mockAttempts.length),
  };

  const statCards = [
    { label: "Total Attempts", value: stats.total, sub: "10 completed", icon: FileText, gradient: "from-violet-500 to-purple-600", light: "bg-violet-50", text: "text-violet-600" },
    { label: "Average Score", value: `${stats.avgScore}%`, sub: `Best: ${stats.highScore}%`, icon: TrendingUp, gradient: "from-blue-500 to-indigo-600", light: "bg-blue-50", text: "text-blue-600" },
    { label: "Pass Rate", value: `${stats.passRate}%`, sub: `${mockAttempts.filter(a => a.passed).length} passed`, icon: Trophy, gradient: "from-emerald-500 to-teal-600", light: "bg-emerald-50", text: "text-emerald-600" },
    { label: "Avg Duration", value: `${stats.avgDuration}m`, sub: "per attempt", icon: Clock, gradient: "from-amber-500 to-orange-600", light: "bg-amber-50", text: "text-amber-600" },
  ];

  const toggleSort = (col: SortField) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortField }) =>
    sortBy === col
      ? (sortDir === "desc" ? <ChevronDown className="w-3.5 h-3.5 text-violet-500" /> : <ChevronUp className="w-3.5 h-3.5 text-violet-500" />)
      : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />;

  const filtered = useMemo(() => {
    let list = [...mockAttempts];
    if (tab === "passed") list = list.filter(a => a.passed);
    if (tab === "failed") list = list.filter(a => !a.passed);
    if (selectedQuiz !== "all") list = list.filter(a => a.quizId === selectedQuiz);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (mockStudents[a.studentId] || "").toLowerCase().includes(q) ||
        (mockQuizzes[a.quizId] || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === "score") return sortDir === "asc" ? getPct(a) - getPct(b) : getPct(b) - getPct(a);
      if (sortBy === "duration") {
        const da = getDuration(a.startedAt, a.completedAt);
        const db = getDuration(b.startedAt, b.completedAt);
        return sortDir === "asc" ? da - db : db - da;
      }
      if (sortBy === "student") {
        const sa = mockStudents[a.studentId] || "";
        const sb = mockStudents[b.studentId] || "";
        return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
      }
      if (sortBy === "quiz") {
        const qa = mockQuizzes[a.quizId] || "";
        const qb = mockQuizzes[b.quizId] || "";
        return sortDir === "asc" ? qa.localeCompare(qb) : qb.localeCompare(qa);
      }
      return sortDir === "asc" ? a.completedAt.localeCompare(b.completedAt) : b.completedAt.localeCompare(a.completedAt);
    });
    return list;
  }, [tab, search, selectedQuiz, sortBy, sortDir]);

  return (
    <div className="min-h-screen bg-slate-50 flex text-sm">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-800 fixed h-full z-30 flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-900/40">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">QuizMaster</h1>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Teacher Portal</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {navSections.map(section => (
            <div key={section.title} className="space-y-0.5">
              <h3 className="px-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{section.title}</h3>
              {section.items.map(item => (
                <div key={item.label} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer ${(item as any).active ? "bg-violet-600 text-white shadow-lg shadow-violet-900/30" : "text-slate-400 hover:bg-slate-700/60 hover:text-white"}`}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="pt-3 border-t border-slate-700/50">
            <div className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg cursor-pointer">
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* Top Bar */}
      <header className="fixed top-0 right-0 left-60 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-20">
        <span className="text-sm font-semibold text-slate-500">Quiz Results</span>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
            <span className="text-xs font-bold text-violet-700">JT</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 ml-60 px-8 py-6" style={{ paddingTop: "3.5rem" }}>
        <div className="max-w-7xl mx-auto pt-6 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Quiz Results</h1>
              <p className="text-slate-500 text-sm mt-1">Review all student quiz attempts and performance metrics.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-xl">
                <Activity className="w-3.5 h-3.5" />
                Live Data
              </div>
              <button className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all shadow-sm">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4">
            {statCards.map(card => (
              <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className={`h-1 bg-gradient-to-r ${card.gradient}`} />
                <div className="p-5">
                  <div className={`w-10 h-10 ${card.light} rounded-xl flex items-center justify-center mb-3`}>
                    <card.icon className={`w-5 h-5 ${card.text}`} />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{card.value}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{card.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-6">
            {/* Activity Trend */}
            <div className="col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Activity Trend</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Attempts over the last 7 days</p>
                  </div>
                  <Flame className="w-5 h-5 text-orange-400" />
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                        cursor={{ stroke: "#7c3aed", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                      />
                      <Area type="monotone" dataKey="attempts" stroke="#7c3aed" strokeWidth={2.5} fillOpacity={1} fill="url(#areaGrad)" dot={false} name="Attempts" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Top Quizzes */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
              <div className="p-6">
                <h2 className="text-base font-bold text-slate-900 mb-1">Top Quizzes</h2>
                <p className="text-xs text-slate-400 mb-5">By number of attempts</p>
                <div className="space-y-3.5">
                  {quizBreakdown.map((q, i) => (
                    <div key={q.id} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-500"}`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">{q.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-400 rounded-full" style={{ width: `${q.avgScore}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">{q.avgScore}% avg</span>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-slate-500 shrink-0">{q.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />

            {/* Tab Bar */}
            <div className="px-5 pt-4 border-b border-slate-100 flex items-center gap-1">
              {(["all", "passed", "failed"] as TabFilter[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all capitalize ${tab === t ? t === "passed" ? "text-emerald-700 border-emerald-500 bg-emerald-50" : t === "failed" ? "text-red-700 border-red-500 bg-red-50" : "text-violet-700 border-violet-500 bg-violet-50" : "text-slate-400 border-transparent hover:text-slate-600"}`}
                >
                  {t === "all" ? `All (${mockAttempts.length})` : t === "passed" ? `Passed (${mockAttempts.filter(a => a.passed).length})` : `Failed (${mockAttempts.filter(a => !a.passed).length})`}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="p-5 border-b border-slate-100 flex gap-3 bg-slate-50/50">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student or quiz..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <select
                value={selectedQuiz}
                onChange={e => setSelectedQuiz(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500 text-slate-600"
              >
                <option value="all">All Quizzes</option>
                {Object.entries(mockQuizzes).map(([id, title]) => (
                  <option key={id} value={id}>{title}</option>
                ))}
              </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-500 text-xs font-semibold border-b border-slate-100">
                    <th className="px-5 py-3 pl-6">
                      <button onClick={() => toggleSort("student")} className="flex items-center gap-1 hover:text-slate-800">Student <SortIcon col="student" /></button>
                    </th>
                    <th className="px-5 py-3">
                      <button onClick={() => toggleSort("quiz")} className="flex items-center gap-1 hover:text-slate-800">Quiz <SortIcon col="quiz" /></button>
                    </th>
                    <th className="px-5 py-3 min-w-[150px]">
                      <button onClick={() => toggleSort("score")} className="flex items-center gap-1 hover:text-slate-800">Score <SortIcon col="score" /></button>
                    </th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">
                      <button onClick={() => toggleSort("duration")} className="flex items-center gap-1 hover:text-slate-800">Time <SortIcon col="duration" /></button>
                    </th>
                    <th className="px-5 py-3">
                      <button onClick={() => toggleSort("date")} className="flex items-center gap-1 hover:text-slate-800">Date <SortIcon col="date" /></button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(attempt => {
                    const pct = getPct(attempt);
                    const duration = getDuration(attempt.startedAt, attempt.completedAt);
                    const studentName = mockStudents[attempt.studentId] || "Unknown";
                    const quizName = mockQuizzes[attempt.quizId] || "Unknown Quiz";
                    const initials = studentName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <tr key={attempt.id} className="hover:bg-slate-50/80 transition-all cursor-pointer">
                        <td className="px-5 py-4 pl-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                              {initials}
                            </div>
                            <span className="font-semibold text-slate-900 text-sm">{studentName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-lg max-w-[160px] truncate">
                            <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{quizName}</span>
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full bg-gradient-to-r ${scoreColor(pct)}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-sm font-bold text-slate-900 w-9 text-right">{pct}%</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{attempt.correctAnswers}/{attempt.totalQuestions} correct</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${attempt.passed ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"}`}>
                            {attempt.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {attempt.passed ? "Passed" : "Failed"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="flex items-center gap-1 text-slate-500 text-xs">
                            <Clock className="w-3.5 h-3.5 text-slate-300" />{duration}m
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-400 text-xs">
                          {new Date(attempt.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400 font-medium flex items-center justify-between">
              <span>Showing {filtered.length} of {mockAttempts.length} attempts</span>
              {tab !== "all" && (
                <button onClick={() => setTab("all")} className="text-violet-500 hover:text-violet-700 font-semibold">Clear filter</button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

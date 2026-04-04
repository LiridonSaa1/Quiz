import { useState, useMemo } from "react";
import {
  Users, TrendingUp, CheckCircle2, AlertTriangle,
  Search, ChevronDown, ChevronUp, BookOpen,
  Target, Award, Activity, BarChart3, LayoutDashboard,
  FileText, Layers, PlayCircle, School, ClipboardList,
  CalendarCheck, Video, MessageSquare, Megaphone,
  FileBarChart, User, LogOut, GraduationCap, Menu
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from "recharts";

const mockStudents = [
  { id: "1", name: "Emma Johnson", email: "emma.johnson@student.com", avatar: "EJ", totalAttempts: 14, completedAttempts: 12, avgScore: 88, passRate: 92, bestScore: 97, recentScores: [75, 82, 88, 91, 97], enrolledCourses: 3 },
  { id: "2", name: "James Smith", email: "james.smith@student.com", avatar: "JS", totalAttempts: 9, completedAttempts: 9, avgScore: 73, passRate: 78, bestScore: 85, recentScores: [60, 70, 73, 75, 80], enrolledCourses: 2 },
  { id: "3", name: "Olivia Davis", email: "olivia.davis@student.com", avatar: "OD", totalAttempts: 18, completedAttempts: 16, avgScore: 94, passRate: 100, bestScore: 100, recentScores: [88, 90, 94, 96, 100], enrolledCourses: 4 },
  { id: "4", name: "Liam Martinez", email: "liam.martinez@student.com", avatar: "LM", totalAttempts: 6, completedAttempts: 4, avgScore: 38, passRate: 25, bestScore: 52, recentScores: [40, 35, 38, 45], enrolledCourses: 2 },
  { id: "5", name: "Sophia Brown", email: "sophia.brown@student.com", avatar: "SB", totalAttempts: 11, completedAttempts: 11, avgScore: 65, passRate: 64, bestScore: 79, recentScores: [58, 62, 65, 68, 72], enrolledCourses: 2 },
  { id: "6", name: "Noah Wilson", email: "noah.wilson@student.com", avatar: "NW", totalAttempts: 3, completedAttempts: 2, avgScore: 22, passRate: 0, bestScore: 30, recentScores: [18, 22], enrolledCourses: 1 },
  { id: "7", name: "Ava Thompson", email: "ava.thompson@student.com", avatar: "AT", totalAttempts: 15, completedAttempts: 15, avgScore: 81, passRate: 87, bestScore: 93, recentScores: [74, 78, 81, 85, 88], enrolledCourses: 3 },
  { id: "8", name: "William Garcia", email: "william.garcia@student.com", avatar: "WG", totalAttempts: 7, completedAttempts: 6, avgScore: 55, passRate: 50, bestScore: 68, recentScores: [45, 50, 55, 58, 62], enrolledCourses: 2 },
];

function getStatus(avgScore: number) {
  if (avgScore >= 80) return "excellent";
  if (avgScore >= 65) return "good";
  if (avgScore >= 45) return "average";
  return "at-risk";
}

const statusConfig = {
  excellent: { label: "Excellent", color: "bg-emerald-50 text-emerald-700 border-emerald-100", dot: "bg-emerald-500" },
  good: { label: "Good", color: "bg-blue-50 text-blue-700 border-blue-100", dot: "bg-blue-500" },
  average: { label: "Average", color: "bg-amber-50 text-amber-700 border-amber-100", dot: "bg-amber-500" },
  "at-risk": { label: "At Risk", color: "bg-red-50 text-red-700 border-red-100", dot: "bg-red-500" },
};

const navSections = [
  { title: "MAIN", items: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: BookOpen, label: "My Courses", path: "/courses" },
    { icon: Layers, label: "Modules", path: "/modules" },
    { icon: PlayCircle, label: "Lessons", path: "/lessons" },
    { icon: FileText, label: "Quizzes", path: "/quizzes" },
  ]},
  { title: "STUDENTS", items: [
    { icon: Users, label: "My Students", path: "/students" },
    { icon: School, label: "Classes", path: "/classes" },
  ]},
  { title: "LEARNING", items: [
    { icon: ClipboardList, label: "Assignments", path: "/assignments" },
    { icon: CalendarCheck, label: "Attendance", path: "/attendance" },
    { icon: Award, label: "Certificates", path: "/certificates" },
  ]},
  { title: "INTERACTION", items: [
    { icon: Video, label: "Live Sessions", path: "/live-sessions" },
    { icon: MessageSquare, label: "Community", path: "/community" },
    { icon: Megaphone, label: "Announcements", path: "/announcements" },
  ]},
  { title: "ANALYTICS", items: [
    { icon: BarChart3, label: "Student Progress", path: "/progress", active: true },
    { icon: FileBarChart, label: "Quiz Results", path: "/results" },
  ]},
  { title: "ACCOUNT", items: [
    { icon: User, label: "Profile", path: "/profile" },
  ]},
];

function ScoreBar({ value }: { value: number }) {
  const pct = Math.min(100, value);
  const color = pct >= 80 ? "from-emerald-400 to-emerald-500" : pct >= 65 ? "from-blue-400 to-indigo-500" : pct >= 45 ? "from-amber-400 to-orange-500" : "from-rose-400 to-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-700 w-8 text-right">{value}%</span>
    </div>
  );
}

function MiniSparkline({ scores }: { scores: number[] }) {
  if (!scores.length) return <span className="text-slate-300 text-xs">—</span>;
  const h = 28, w = 64;
  const pts = scores.map((s, i) => ({
    x: scores.length === 1 ? w / 2 : (i / (scores.length - 1)) * w,
    y: h - (s / 100) * h,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const trend = scores.length > 1 ? scores[scores.length - 1] - scores[scores.length - 2] : 0;
  const color = trend >= 0 ? "#10b981" : "#f43f5e";
  return (
    <svg width={w} height={h}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={3} fill={color} />
    </svg>
  );
}

export function Progress() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "avgScore" | "passRate" | "totalAttempts">("avgScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const students = mockStudents.map(s => ({ ...s, status: getStatus(s.avgScore) }));

  const overview = {
    total: students.length,
    avgScore: Math.round(students.reduce((s, st) => s + st.avgScore, 0) / students.length),
    passRate: Math.round(students.reduce((s, st) => s + st.passRate, 0) / students.length),
    atRisk: students.filter(s => s.status === "at-risk").length,
  };

  const scoreDistribution = [
    { range: "0–20", count: students.filter(s => s.avgScore <= 20).length, fill: "#f43f5e" },
    { range: "21–40", count: students.filter(s => s.avgScore > 20 && s.avgScore <= 40).length, fill: "#f97316" },
    { range: "41–60", count: students.filter(s => s.avgScore > 40 && s.avgScore <= 60).length, fill: "#f59e0b" },
    { range: "61–80", count: students.filter(s => s.avgScore > 60 && s.avgScore <= 80).length, fill: "#3b82f6" },
    { range: "81–100", count: students.filter(s => s.avgScore > 80).length, fill: "#10b981" },
  ];

  const statusCounts = {
    excellent: students.filter(s => s.status === "excellent").length,
    good: students.filter(s => s.status === "good").length,
    average: students.filter(s => s.status === "average").length,
    "at-risk": students.filter(s => s.status === "at-risk").length,
  };

  const filtered = useMemo(() => {
    let list = [...students];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
    }
    if (filterStatus !== "all") list = list.filter(s => s.status === filterStatus);
    list.sort((a, b) => {
      if (sortBy === "name") return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      return sortDir === "asc" ? (a as any)[sortBy] - (b as any)[sortBy] : (b as any)[sortBy] - (a as any)[sortBy];
    });
    return list;
  }, [search, filterStatus, sortBy, sortDir]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => (
    sortBy === col
      ? (sortDir === "desc" ? <ChevronDown className="w-3.5 h-3.5 text-violet-500" /> : <ChevronUp className="w-3.5 h-3.5 text-violet-500" />)
      : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
  );

  const statCards = [
    { label: "Total Students", value: overview.total, icon: Users, gradient: "from-violet-500 to-purple-600", light: "bg-violet-50", text: "text-violet-600" },
    { label: "Class Average", value: `${overview.avgScore}%`, icon: TrendingUp, gradient: "from-blue-500 to-indigo-600", light: "bg-blue-50", text: "text-blue-600" },
    { label: "Class Pass Rate", value: `${overview.passRate}%`, icon: CheckCircle2, gradient: "from-emerald-500 to-teal-600", light: "bg-emerald-50", text: "text-emerald-600" },
    { label: "Students At Risk", value: overview.atRisk, icon: AlertTriangle, gradient: "from-rose-500 to-red-600", light: "bg-rose-50", text: "text-rose-600" },
  ];

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
        <span className="text-sm font-semibold text-slate-500">Student Progress</span>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
            <span className="text-xs font-bold text-violet-700">JT</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 ml-60 px-8 py-6" style={{ paddingTop: "3.5rem" }}>
        <div className="max-w-7xl mx-auto pt-6 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Student Progress</h1>
              <p className="text-slate-500 text-sm mt-1">Track every student's learning journey and performance.</p>
            </div>
            <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-xl">
              <Activity className="w-3.5 h-3.5" />
              Live Data
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
                  <div className="text-xs text-slate-500 font-medium mt-0.5">{card.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-6">
            {/* Score Distribution */}
            <div className="col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Score Distribution</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Number of students by average score range</p>
                  </div>
                  <BarChart3 className="w-5 h-5 text-slate-300" />
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreDistribution} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)", fontSize: "12px" }}
                        formatter={(v: number) => [`${v} students`, "Count"]}
                        cursor={{ fill: "#f8fafc" }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {scoreDistribution.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Status Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
              <div className="p-6">
                <h2 className="text-base font-bold text-slate-900 mb-1">Performance Breakdown</h2>
                <p className="text-xs text-slate-400 mb-5">Students by performance tier</p>
                <div className="space-y-3">
                  {(Object.keys(statusConfig) as Array<keyof typeof statusConfig>).map(key => {
                    const count = statusCounts[key];
                    const pct = students.length > 0 ? (count / students.length) * 100 : 0;
                    const cfg = statusConfig[key];
                    return (
                      <button
                        key={key}
                        onClick={() => setFilterStatus(filterStatus === key ? "all" : key)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${filterStatus === key ? cfg.color + " border-current" : "bg-slate-50 border-transparent hover:border-slate-200"}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                          <span className="text-sm font-semibold text-slate-700">{cfg.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${cfg.dot}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-bold text-slate-900 w-5 text-right">{count}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Student Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
            <div className="p-5 border-b border-slate-100 flex gap-3 bg-slate-50/50">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              {filterStatus !== "all" && (
                <button
                  onClick={() => setFilterStatus("all")}
                  className="flex items-center gap-1.5 px-3 py-2 bg-violet-100 text-violet-700 text-xs font-semibold rounded-xl border border-violet-200"
                >
                  Clear filter ✕
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-500 text-xs font-semibold border-b border-slate-100">
                    <th className="px-5 py-3 pl-6">
                      <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-slate-800">
                        Student <SortIcon col="name" />
                      </button>
                    </th>
                    <th className="px-5 py-3">
                      <button onClick={() => toggleSort("totalAttempts")} className="flex items-center gap-1 hover:text-slate-800">
                        Attempts <SortIcon col="totalAttempts" />
                      </button>
                    </th>
                    <th className="px-5 py-3 min-w-[160px]">
                      <button onClick={() => toggleSort("avgScore")} className="flex items-center gap-1 hover:text-slate-800">
                        Avg Score <SortIcon col="avgScore" />
                      </button>
                    </th>
                    <th className="px-5 py-3 min-w-[140px]">
                      <button onClick={() => toggleSort("passRate")} className="flex items-center gap-1 hover:text-slate-800">
                        Pass Rate <SortIcon col="passRate" />
                      </button>
                    </th>
                    <th className="px-5 py-3">Trend</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right pr-6">Courses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(student => {
                    const cfg = statusConfig[student.status as keyof typeof statusConfig];
                    const isExpanded = expandedId === student.id;
                    return (
                      <>
                        <tr
                          key={student.id}
                          className="hover:bg-slate-50/80 transition-all cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : student.id)}
                        >
                          <td className="px-5 py-4 pl-6">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0">
                                {student.avatar}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 text-sm">{student.name}</div>
                                <div className="text-slate-400 text-xs">{student.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900">{student.completedAttempts}</span>
                              <span className="text-slate-400 text-xs">/ {student.totalAttempts}</span>
                            </div>
                            <div className="text-slate-400 text-[10px] mt-0.5">completed</div>
                          </td>
                          <td className="px-5 py-4"><ScoreBar value={student.avgScore} /></td>
                          <td className="px-5 py-4"><ScoreBar value={student.passRate} /></td>
                          <td className="px-5 py-4"><MiniSparkline scores={student.recentScores} /></td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.color}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-4 pr-6 text-right">
                            <div className="inline-flex items-center gap-1.5 text-slate-600 font-semibold">
                              <BookOpen className="w-4 h-4 text-slate-300" />
                              {student.enrolledCourses}
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${student.id}-expanded`}>
                            <td colSpan={7} className="bg-slate-50 border-b border-slate-100">
                              <div className="px-6 py-5 grid grid-cols-4 gap-4">
                                <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
                                  <Target className="w-5 h-5 text-violet-500 mx-auto mb-1" />
                                  <div className="text-xl font-bold text-slate-900">{student.bestScore}%</div>
                                  <div className="text-xs text-slate-500 mt-0.5">Best Score</div>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
                                  <TrendingUp className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                                  <div className="text-xl font-bold text-slate-900">{student.avgScore}%</div>
                                  <div className="text-xs text-slate-500 mt-0.5">Avg Score</div>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                                  <div className="text-xl font-bold text-slate-900">{student.passRate}%</div>
                                  <div className="text-xs text-slate-500 mt-0.5">Pass Rate</div>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
                                  <Award className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                                  <div className="text-xl font-bold text-slate-900">{student.totalAttempts}</div>
                                  <div className="text-xs text-slate-500 mt-0.5">Total Attempts</div>
                                </div>
                              </div>
                              <div className="px-6 pb-5">
                                <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Recent Scores</p>
                                <div className="flex items-end gap-2">
                                  {student.recentScores.map((score, i) => {
                                    const bgColor = score >= 80 ? "bg-emerald-400" : score >= 65 ? "bg-blue-400" : score >= 45 ? "bg-amber-400" : "bg-rose-400";
                                    return (
                                      <div key={i} className="flex flex-col items-center gap-1">
                                        <span className="text-[10px] font-bold text-slate-600">{score}%</span>
                                        <div className={`w-8 rounded-t-md ${bgColor}`} style={{ height: `${Math.max(8, score * 0.6)}px` }} />
                                        <span className="text-[9px] text-slate-400">#{i + 1}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400 font-medium">
              Showing {filtered.length} of {students.length} students
              {filterStatus !== "all" && ` · filtered by "${statusConfig[filterStatus as keyof typeof statusConfig]?.label}"`}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

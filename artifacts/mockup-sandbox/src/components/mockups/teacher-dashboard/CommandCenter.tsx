import React, { useState } from "react";
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  BookOpen,
  FileText,
  BarChart2,
  Settings,
  LogOut,
  ChevronRight,
  Search,
  Plus,
  ArrowUpRight,
  MessageSquare,
  Activity,
  Zap
} from "lucide-react";

export function CommandCenter() {
  const [activeTab, setActiveTab] = useState("triage");

  return (
    <div className="flex h-[800px] w-[1280px] bg-[#0B1120] text-slate-300 font-sans overflow-hidden selection:bg-indigo-500/30">
      {/* Sidebar - Icon Only */}
      <aside className="w-16 border-r border-slate-800/60 bg-[#0F172A]/80 backdrop-blur-xl flex flex-col items-center py-6 justify-between z-10 relative">
        <div className="absolute inset-y-0 right-0 w-[1px] bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent"></div>
        <div className="flex flex-col items-center gap-8 w-full">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.4)]">
            <Zap className="w-5 h-5 text-white fill-white/20" />
          </div>
          
          <nav className="flex flex-col gap-6 w-full items-center">
            <NavItem icon={<Bell />} active={activeTab === "triage"} onClick={() => setActiveTab("triage")} badge="5" />
            <NavItem icon={<BookOpen />} />
            <NavItem icon={<Users />} />
            <NavItem icon={<FileText />} />
            <NavItem icon={<BarChart2 />} />
            <NavItem icon={<MessageSquare />} />
          </nav>
        </div>

        <div className="flex flex-col items-center gap-6">
          <button className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 p-0.5 overflow-hidden ring-2 ring-transparent hover:ring-indigo-500/50 transition-all">
            <img src="/__mockup/images/teacher-avatar-command.png" alt="Teacher" className="w-full h-full object-cover rounded-full" />
          </button>
          <NavItem icon={<Settings />} />
          <NavItem icon={<LogOut />} className="text-slate-500 hover:text-red-400" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[300px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none"></div>
        
        {/* Top Compressed Summary Bar */}
        <header className="h-16 border-b border-slate-800/60 flex items-center justify-between px-8 bg-[#0F172A]/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-8">
            <h1 className="text-white font-medium tracking-wide flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse"></span>
              SYSTEM LIVE
            </h1>
            
            <div className="h-4 w-[1px] bg-slate-700"></div>
            
            <div className="flex gap-6 text-sm">
              <Stat label="Active Courses" value="4" />
              <Stat label="Total Students" value="128" />
              <Stat label="Quizzes Today" value="2" />
              <Stat label="Avg Score" value="84%" trend="+2.1%" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Command / Search..." 
                className="bg-slate-900/50 border border-slate-700/50 text-sm rounded-md pl-9 pr-4 py-1.5 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 w-64 placeholder:text-slate-600 text-white transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <kbd className="bg-slate-800 text-[10px] px-1.5 py-0.5 rounded text-slate-400 border border-slate-700 font-mono">⌘</kbd>
                <kbd className="bg-slate-800 text-[10px] px-1.5 py-0.5 rounded text-slate-400 border border-slate-700 font-mono">K</kbd>
              </div>
            </div>
            
            <button className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded-md transition-colors flex items-center gap-1 px-3 text-sm font-medium shadow-[0_0_15px_rgba(79,70,229,0.3)]">
              <Plus className="w-4 h-4" />
              <span>New</span>
            </button>
          </div>
        </header>

        {/* Dispatch Board */}
        <div className="flex-1 overflow-y-auto p-8 z-10 custom-scrollbar">
          <div className="max-w-5xl mx-auto space-y-8">
            
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-3xl font-semibold text-white tracking-tight">Triage Queue</h2>
                <p className="text-slate-400 mt-1">5 items require your immediate attention.</p>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 text-xs font-medium bg-slate-800/80 text-white rounded border border-slate-700 hover:bg-slate-700 transition-colors">
                  Filter by Course
                </button>
                <button className="px-3 py-1.5 text-xs font-medium bg-slate-800/80 text-white rounded border border-slate-700 hover:bg-slate-700 transition-colors flex items-center gap-1">
                  <Activity className="w-3 h-3 text-indigo-400" />
                  Sort: Urgency
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* Critical Alert */}
              <AlertCard 
                level="critical"
                title="3 students at risk in Advanced Calculus"
                description="Failed last 2 quizzes and missed recent assignments. Intervention recommended."
                time="2 hrs ago"
                action="Message Students"
              />
              
              {/* High Alert */}
              <AlertCard 
                level="high"
                title="Midterm Exam Results Pending Review"
                description="42 submissions for 'Intro to Physics' await manual grading for essay questions."
                time="4 hrs ago"
                action="Grade Now"
              />

              {/* Medium Alert */}
              <AlertCard 
                level="medium"
                title="Module 3 drops tomorrow"
                description="Final check needed on reading materials and quiz questions before auto-publish."
                time="Today"
                action="Review Module"
              />

              {/* Normal Alert */}
              <AlertCard 
                level="normal"
                title="New student joined 'Web Dev 101'"
                description="Sarah Jenkins enrolled. Requires welcome email and initial assessment."
                time="Yesterday"
                action="Send Welcome"
              />

               {/* Normal Alert */}
               <AlertCard 
                level="normal"
                title="5 discussions waiting for reply"
                description="Students have posted questions in the 'React Fundamentals' forum."
                time="Yesterday"
                action="View Forum"
              />
            </div>

            {/* Upcoming Section */}
            <div className="pt-6 border-t border-slate-800/60 mt-8">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Upcoming Deadlines (Next 48h)
              </h3>
              
              <div className="grid grid-cols-3 gap-4">
                <MiniCard 
                  title="Homework #4 Due"
                  course="Data Structures"
                  time="Tomorrow, 11:59 PM"
                  students="84/120 submitted"
                />
                <MiniCard 
                  title="Live Q&A Session"
                  course="Physics 101"
                  time="Thursday, 2:00 PM"
                  students="Zoom Link Ready"
                />
                <div className="border border-slate-800/60 bg-slate-900/30 rounded-lg p-4 flex flex-col items-center justify-center text-slate-500 border-dashed hover:border-slate-600 hover:text-slate-300 transition-colors cursor-pointer group">
                  <Plus className="w-6 h-6 mb-2 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                  <span className="text-sm font-medium">Schedule Event</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
      
      {/* Custom Scrollbar Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}} />
    </div>
  );
}

// Subcomponents

function NavItem({ icon, active, onClick, badge, className = "" }: any) {
  return (
    <button 
      onClick={onClick}
      className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 group ${
        active 
          ? "bg-indigo-500/10 text-indigo-400" 
          : "text-slate-500 hover:bg-slate-800/50 hover:text-slate-300"
      } ${className}`}
    >
      {active && (
        <div className="absolute left-0 w-1 h-6 bg-indigo-500 rounded-r-full -ml-3"></div>
      )}
      <div className={`w-5 h-5 transition-transform duration-200 ${active ? "scale-110" : "group-hover:scale-110"}`}>
        {icon}
      </div>
      {badge && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-[#0F172A]">
          {badge}
        </span>
      )}
    </button>
  );
}

function Stat({ label, value, trend }: any) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500">{label}:</span>
      <span className="text-white font-medium">{value}</span>
      {trend && (
        <span className="text-emerald-400 text-xs font-medium bg-emerald-400/10 px-1.5 py-0.5 rounded flex items-center">
          <ArrowUpRight className="w-3 h-3 mr-0.5" />
          {trend}
        </span>
      )}
    </div>
  );
}

function AlertCard({ level, title, description, time, action }: any) {
  const levels = {
    critical: {
      border: "border-red-500/50",
      bg: "bg-red-500/5",
      icon: <AlertCircle className="w-5 h-5 text-red-500" />,
      indicator: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]",
      button: "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
    },
    high: {
      border: "border-amber-500/50",
      bg: "bg-amber-500/5",
      icon: <Clock className="w-5 h-5 text-amber-500" />,
      indicator: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]",
      button: "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"
    },
    medium: {
      border: "border-indigo-500/40",
      bg: "bg-indigo-500/5",
      icon: <CheckCircle2 className="w-5 h-5 text-indigo-400" />,
      indicator: "bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.5)]",
      button: "bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/20"
    },
    normal: {
      border: "border-slate-700/60",
      bg: "bg-slate-800/30",
      icon: <Bell className="w-5 h-5 text-slate-400" />,
      indicator: "bg-slate-500",
      button: "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600"
    }
  };

  const style = levels[level as keyof typeof levels];

  return (
    <div className={`group relative flex items-center gap-4 p-4 rounded-xl border ${style.border} ${style.bg} backdrop-blur-sm transition-all hover:bg-slate-800/80`}>
      <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 ${style.indicator} rounded-r-full opacity-70`}></div>
      
      <div className="w-10 h-10 rounded-lg bg-[#0F172A] border border-slate-700/50 flex items-center justify-center shrink-0">
        {style.icon}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-white font-medium text-base truncate pr-4">{title}</h4>
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{time}</span>
        </div>
        <p className="text-slate-400 text-sm truncate">{description}</p>
      </div>
      
      <div className="pl-4 border-l border-slate-700/50 flex shrink-0 items-center opacity-80 group-hover:opacity-100 transition-opacity">
        <button className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${style.button}`}>
          {action}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function MiniCard({ title, course, time, students }: any) {
  return (
    <div className="p-4 rounded-xl border border-slate-800/80 bg-[#0F172A]/80 backdrop-blur-sm hover:border-slate-700 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <h5 className="text-slate-200 font-medium text-sm">{title}</h5>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center text-xs text-slate-400">
          <BookOpen className="w-3.5 h-3.5 mr-2 text-indigo-400" />
          {course}
        </div>
        <div className="flex items-center text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5 mr-2 text-amber-400" />
          {time}
        </div>
        <div className="flex items-center text-xs text-slate-500 pt-2 border-t border-slate-800/80 mt-2">
          <Users className="w-3 h-3 mr-1.5" />
          {students}
        </div>
      </div>
    </div>
  );
}

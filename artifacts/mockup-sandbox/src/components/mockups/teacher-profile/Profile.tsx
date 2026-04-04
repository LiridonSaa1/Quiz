import { useState } from "react";
import {
  User, Mail, Phone, Globe, BookOpen, Building2,
  Camera, Save, Lock, Bell, Shield, CheckCircle2,
  Edit3, GraduationCap, Calendar, Users, FileText,
  Award, Eye, EyeOff, AlertTriangle, LayoutDashboard,
  Layers, PlayCircle, School, ClipboardList, CalendarCheck,
  Video, MessageSquare, Megaphone, BarChart3, FileBarChart,
  LogOut
} from "lucide-react";

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
    { icon: FileBarChart, label: "Quiz Results" },
  ]},
  { title: "ACCOUNT", items: [
    { icon: User, label: "Profile", active: true },
  ]},
];

const stats = [
  { label: "Students", value: 142, icon: Users, color: "text-violet-600", bg: "bg-violet-50" },
  { label: "Courses", value: 8, icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "Quizzes", value: 34, icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
  { label: "Pass Rate", value: "78%", icon: Award, color: "text-emerald-600", bg: "bg-emerald-50" },
];

export function Profile() {
  const [profile, setProfile] = useState({
    displayName: "Jordan Taylor",
    bio: "Passionate educator with 8+ years of experience in computer science and mathematics. I love helping students discover the joy of problem-solving.",
    subject: "Computer Science & Mathematics",
    institution: "Westbrook Academy",
    phone: "+1 (555) 234-5678",
    website: "https://jordantaylor.dev",
    email: "jordan.taylor@westbrook.edu",
  });

  const [notifs, setNotifs] = useState({
    quizComplete: true,
    newStudent: true,
    weeklyReport: false,
    announcements: true,
  });

  const [showPassSection, setShowPassSection] = useState(false);
  const [passwords, setPasswords] = useState({ next: "", confirm: "" });
  const [showPass, setShowPass] = useState({ next: false, confirm: false });

  const initials = profile.displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

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
        <span className="text-sm font-semibold text-slate-500">My Profile</span>
        <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
          <span className="text-xs font-bold text-violet-700">JT</span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 ml-60 px-8" style={{ paddingTop: "3.5rem" }}>
        <div className="max-w-5xl mx-auto pt-6 pb-10 space-y-6">

          {/* Hero Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="h-28 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 relative">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
              {/* Decorative blobs */}
              <div className="absolute top-3 right-8 w-20 h-20 bg-white/10 rounded-full blur-xl" />
              <div className="absolute bottom-0 left-20 w-32 h-16 bg-indigo-400/20 rounded-full blur-2xl" />
            </div>
            <div className="px-8 pb-8">
              <div className="flex items-end justify-between -mt-12 mb-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{initials}</span>
                  </div>
                  <button className="absolute -bottom-1 -right-1 w-8 h-8 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm hover:bg-slate-50 transition-all">
                    <Camera className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
                <button className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-violet-200">
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{profile.displayName}</h1>
                  <div className="flex items-center flex-wrap gap-3 mt-2">
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                      <Mail className="w-4 h-4 text-slate-400" />{profile.email}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                      <Building2 className="w-4 h-4 text-slate-400" />{profile.institution}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                      <Calendar className="w-4 h-4 text-slate-400" />Member since March 2023
                    </span>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-xl self-start sm:self-auto">
                  <GraduationCap className="w-3.5 h-3.5" />
                  Teacher
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {stats.map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
                <div className={`w-11 h-11 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{s.value}</div>
                  <div className="text-xs text-slate-400 font-medium">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Two Column */}
          <div className="grid grid-cols-5 gap-6">

            {/* Left — Info */}
            <div className="col-span-3 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-500" />
                <div className="p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-base font-bold text-slate-900">Personal Information</h2>
                    <Edit3 className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: "Full Name", key: "displayName", icon: User, placeholder: "Your full name" },
                      { label: "Subject / Specialty", key: "subject", icon: BookOpen, placeholder: "e.g. Mathematics" },
                      { label: "Institution", key: "institution", icon: Building2, placeholder: "School name" },
                      { label: "Phone", key: "phone", icon: Phone, placeholder: "+1 (555) 000-0000" },
                      { label: "Website", key: "website", icon: Globe, placeholder: "https://yoursite.com" },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">{field.label}</label>
                        <div className="relative">
                          <field.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={(profile as any)[field.key]}
                            onChange={e => setProfile(p => ({ ...p, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all"
                          />
                        </div>
                      </div>
                    ))}

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Bio</label>
                      <textarea
                        value={profile.bio}
                        onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                        rows={3}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          value={profile.email}
                          readOnly
                          className="w-full pl-9 pr-24 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">Read-only</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right */}
            <div className="col-span-2 space-y-6">

              {/* Notifications */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Bell className="w-4 h-4 text-slate-400" />
                    <h2 className="text-base font-bold text-slate-900">Notifications</h2>
                  </div>
                  <div className="space-y-4">
                    {[
                      { key: "quizComplete", label: "Quiz Completed", desc: "When a student finishes a quiz" },
                      { key: "newStudent", label: "New Student", desc: "When a student joins your class" },
                      { key: "weeklyReport", label: "Weekly Report", desc: "Summary email every Monday" },
                      { key: "announcements", label: "Announcements", desc: "Platform news & updates" },
                    ].map(n => (
                      <div key={n.key} className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{n.label}</div>
                          <div className="text-xs text-slate-400">{n.desc}</div>
                        </div>
                        <button
                          onClick={() => setNotifs(p => ({ ...p, [n.key]: !(p as any)[n.key] }))}
                          className={`w-11 h-6 rounded-full relative transition-all duration-200 shrink-0 ${(notifs as any)[n.key] ? "bg-violet-500" : "bg-slate-200"}`}
                        >
                          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${(notifs as any)[n.key] ? "left-6" : "left-1"}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Security */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Shield className="w-4 h-4 text-slate-400" />
                    <h2 className="text-base font-bold text-slate-900">Security</h2>
                  </div>

                  {/* Account status */}
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl mb-4">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-emerald-800">Account Verified</div>
                      <div className="text-[10px] text-emerald-600">Email & identity confirmed</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Password</div>
                      <div className="text-xs text-slate-400">Last changed: Unknown</div>
                    </div>
                    <button
                      onClick={() => setShowPassSection(s => !s)}
                      className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                    >
                      {showPassSection ? "Cancel" : "Change"}
                    </button>
                  </div>

                  {showPassSection && (
                    <div className="space-y-3 border-t border-slate-100 pt-4">
                      {([
                        { key: "next", label: "New Password" },
                        { key: "confirm", label: "Confirm Password" },
                      ] as { key: "next" | "confirm"; label: string }[]).map(f => (
                        <div key={f.key}>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{f.label}</label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                              type={showPass[f.key] ? "text" : "password"}
                              value={passwords[f.key]}
                              onChange={e => setPasswords(p => ({ ...p, [f.key]: e.target.value }))}
                              placeholder="••••••••"
                              className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPass(p => ({ ...p, [f.key]: !p[f.key] }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                            >
                              {showPass[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      ))}
                      {passwords.next && passwords.confirm && passwords.next !== passwords.confirm && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />Passwords don't match
                        </p>
                      )}
                      <button
                        disabled={!passwords.next || passwords.next !== passwords.confirm}
                        className="w-full py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Update Password
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

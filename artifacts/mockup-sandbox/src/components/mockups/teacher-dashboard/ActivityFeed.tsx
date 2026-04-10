import React, { useState } from "react";
import { 
  Bell, 
  Search, 
  Plus, 
  MoreHorizontal, 
  CheckCircle2, 
  MessageSquare, 
  UserPlus, 
  FileText,
  Clock,
  ChevronRight,
  Filter,
  CalendarDays,
  MoreVertical,
  Check
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// --- Mock Data ---
const currentUser = {
  name: "Sarah",
  role: "Lead Instructor",
  avatar: "/__mockup/images/teacher-avatar.jpg",
  greeting: "Good morning, Sarah."
};

type EventType = "submission" | "message" | "enrollment" | "milestone" | "system";

interface ActivityEvent {
  id: string;
  type: EventType;
  user: {
    name: string;
    avatar?: string;
    initials: string;
  };
  action: string;
  target: string;
  time: string;
  details?: string;
  isUnread?: boolean;
  actionRequired?: boolean;
  score?: number;
  maxScore?: number;
}

const activityGroups = [
  {
    date: "Today",
    events: [
      {
        id: "ev1",
        type: "submission",
        user: { name: "Marcus Chen", initials: "MC" },
        action: "submitted Quiz 3:",
        target: "Advanced JavaScript Concepts",
        time: "10 mins ago",
        actionRequired: true,
        details: "Needs manual grading for 2 essay questions."
      },
      {
        id: "ev2",
        type: "milestone",
        user: { name: "System", initials: "S" },
        action: "reported",
        target: "3 students passed Module 1",
        time: "2 hours ago",
        details: "Average score was 88%. This is 5% higher than the historical average."
      },
      {
        id: "ev3",
        type: "enrollment",
        user: { name: "Priya Patel", initials: "PP" },
        action: "enrolled in",
        target: "React for Beginners",
        time: "3 hours ago"
      },
      {
        id: "ev4",
        type: "message",
        user: { name: "James Wilson", initials: "JW" },
        action: "asked a question in",
        target: "CSS Grid Layouts",
        time: "4 hours ago",
        isUnread: true,
        details: "\"I'm having trouble understanding minmax() in grid-template-columns. Can you help?\""
      }
    ] as ActivityEvent[]
  },
  {
    date: "Yesterday",
    events: [
      {
        id: "ev5",
        type: "submission",
        user: { name: "Elena Rodriguez", initials: "ER" },
        action: "completed Quiz 2:",
        target: "CSS Fundamentals",
        time: "Yesterday at 4:30 PM",
        score: 95,
        maxScore: 100
      },
      {
        id: "ev6",
        type: "submission",
        user: { name: "David Kim", initials: "DK" },
        action: "completed Quiz 2:",
        target: "CSS Fundamentals",
        time: "Yesterday at 3:15 PM",
        score: 82,
        maxScore: 100
      },
      {
        id: "ev7",
        type: "enrollment",
        user: { name: "System", initials: "S" },
        action: "published a new course:",
        target: "TypeScript Advanced Patterns",
        time: "Yesterday at 10:00 AM"
      }
    ] as ActivityEvent[]
  }
];

const dailyDigest = {
  upcoming: [
    { id: 1, title: "JavaScript Basics Quiz due", time: "Today, 11:59 PM", type: "deadline" },
    { id: 2, title: "Office Hours", time: "Tomorrow, 2:00 PM", type: "event" },
    { id: 3, title: "Final Project Submissions", time: "Friday, 5:00 PM", type: "deadline" }
  ],
  stats: {
    newStudents: 12,
    quizzesGraded: 45,
    messagesUnread: 3
  }
};

// --- Components ---

const EventIcon = ({ type }: { type: EventType }) => {
  switch (type) {
    case "submission": return <FileText className="h-4 w-4 text-amber-600" />;
    case "message": return <MessageSquare className="h-4 w-4 text-blue-600" />;
    case "enrollment": return <UserPlus className="h-4 w-4 text-emerald-600" />;
    case "milestone": return <CheckCircle2 className="h-4 w-4 text-purple-600" />;
    case "system": return <Bell className="h-4 w-4 text-slate-600" />;
    default: return <Bell className="h-4 w-4 text-slate-600" />;
  }
};

const EventAction = ({ event }: { event: ActivityEvent }) => {
  if (event.actionRequired) {
    return <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white rounded-full px-4 h-8 text-xs font-medium shadow-sm">Review Now</Button>;
  }
  if (event.type === "message" && event.isUnread) {
    return <Button size="sm" variant="outline" className="rounded-full px-4 h-8 text-xs font-medium border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm bg-white">Reply</Button>;
  }
  if (event.score !== undefined) {
    const isHigh = event.score >= 90;
    return (
      <div className="flex items-center gap-2">
        <Badge variant={isHigh ? "default" : "secondary"} className={`shadow-sm ${isHigh ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200" : "bg-white text-slate-800 hover:bg-slate-50 border-slate-200"}`}>
          {event.score}/{event.maxScore}
        </Badge>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-slate-600 rounded-full"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    );
  }
  return <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-slate-600 rounded-full"><MoreHorizontal className="h-4 w-4" /></Button>;
};

export function ActivityFeed() {
  const [filter, setFilter] = useState("all");

  return (
    <div className="flex w-full h-[800px] bg-[#FDFBF7] font-sans text-stone-900 overflow-hidden selection:bg-orange-200 selection:text-orange-900">
      
      {/* Sidebar Navigation - Soft and Minimal */}
      <div className="w-[88px] border-r border-stone-200/60 bg-[#FDFBF7] flex flex-col items-center py-8 gap-8 z-10 shrink-0">
        <div className="h-12 w-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-sm rotate-3 hover:rotate-6 transition-transform cursor-pointer">
          Q
        </div>
        <nav className="flex flex-col gap-5 w-full px-4 mt-4">
          <Button variant="ghost" size="icon" className="w-full h-12 rounded-2xl bg-orange-100/50 text-orange-600 hover:bg-orange-100 hover:text-orange-700 shadow-sm"><Bell className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className="w-full h-12 rounded-2xl text-stone-400 hover:text-stone-700 hover:bg-stone-100"><FileText className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className="w-full h-12 rounded-2xl text-stone-400 hover:text-stone-700 hover:bg-stone-100"><UserPlus className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className="w-full h-12 rounded-2xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 relative">
            <MessageSquare className="h-5 w-5" />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-[#FDFBF7]"></span>
          </Button>
        </nav>
        <div className="mt-auto">
          <Button variant="ghost" size="icon" className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-md hover:scale-105 transition-transform">
            <Avatar className="h-full w-full">
              <AvatarImage src={currentUser.avatar} className="object-cover" />
              <AvatarFallback className="bg-orange-100 text-orange-700">SJ</AvatarFallback>
            </Avatar>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col max-w-[1400px] mx-auto overflow-hidden bg-white/50">
        
        {/* Header - Friendly & Approachable */}
        <header className="h-28 px-10 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-800 font-serif">{currentUser.greeting}</h1>
            <p className="text-stone-500 text-base mt-1.5 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Here's what happened while you were away.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 group-focus-within:text-orange-500 transition-colors" />
              <Input 
                placeholder="Search anything..." 
                className="w-72 pl-10 rounded-full bg-white border-stone-200 focus-visible:ring-orange-500/20 focus-visible:border-orange-500 shadow-sm text-sm h-11"
              />
            </div>
            <Button className="rounded-full bg-stone-900 hover:bg-stone-800 text-white shadow-md h-11 px-6 font-medium transition-all hover:shadow-lg">
              <Plus className="h-4 w-4 mr-2" />
              Create New
            </Button>
          </div>
        </header>

        {/* 2-Column Layout */}
        <div className="flex-1 flex gap-8 px-10 pb-8 overflow-hidden">
          
          {/* Left Column: The Feed */}
          <div className="flex-1 flex flex-col bg-white rounded-3xl border border-stone-200/50 shadow-sm overflow-hidden flex-shrink-0">
            {/* Feed Tabs */}
            <div className="h-16 border-b border-stone-100 flex items-center px-8 justify-between shrink-0 bg-white/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-8 text-sm font-medium h-full">
                <button 
                  onClick={() => setFilter("all")} 
                  className={`relative h-full flex items-center ${filter === "all" ? "text-stone-900" : "text-stone-500 hover:text-stone-800"}`}
                >
                  All Activity
                  {filter === "all" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-t-full" />}
                </button>
                <button 
                  onClick={() => setFilter("submissions")} 
                  className={`relative h-full flex items-center ${filter === "submissions" ? "text-stone-900" : "text-stone-500 hover:text-stone-800"}`}
                >
                  Submissions
                  {filter === "submissions" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-t-full" />}
                </button>
                <button 
                  onClick={() => setFilter("messages")} 
                  className={`relative h-full flex items-center gap-2 ${filter === "messages" ? "text-stone-900" : "text-stone-500 hover:text-stone-800"}`}
                >
                  Messages 
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 h-5 px-1.5 rounded-full text-[10px] font-bold border-0">3</Badge>
                  {filter === "messages" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-t-full" />}
                </button>
              </div>
              <Button variant="ghost" size="sm" className="text-stone-500 hover:text-stone-800 h-9 rounded-full text-xs font-medium px-4 bg-stone-50">
                <Filter className="h-3.5 w-3.5 mr-2" />
                Filter
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-10 p-8 pb-12">
                {activityGroups.map((group, gIdx) => (
                  <div key={gIdx} className="relative">
                    {/* Date Header */}
                    <div className="flex items-center gap-4 mb-6">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 bg-white px-2 rounded-full">{group.date}</h3>
                      <div className="h-px bg-stone-100 flex-1"></div>
                    </div>
                    
                    <div className="flex flex-col gap-3 relative before:absolute before:inset-y-0 before:left-6 before:w-px before:bg-stone-100/80 before:-z-10">
                      {group.events.map((event, eIdx) => (
                        <div 
                          key={event.id} 
                          className={`group relative flex items-start gap-5 p-4 rounded-2xl transition-all duration-200 
                            ${event.isUnread ? "bg-blue-50/40 border border-blue-100/50" : "hover:bg-stone-50 border border-transparent hover:border-stone-100"}`}
                        >
                          
                          {/* Timeline dot/icon */}
                          <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white border-2 border-stone-50 shadow-sm mt-0.5 group-hover:scale-105 transition-transform">
                            {event.user.avatar ? (
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={event.user.avatar} className="object-cover" />
                                <AvatarFallback>{event.user.initials}</AvatarFallback>
                              </Avatar>
                            ) : event.type === "system" || event.type === "milestone" ? (
                              <div className="h-10 w-10 rounded-full bg-stone-50 flex items-center justify-center">
                                <EventIcon type={event.type} />
                              </div>
                            ) : (
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-orange-50 text-orange-700 text-sm font-medium">{event.user.initials}</AvatarFallback>
                              </Avatar>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pt-1.5">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-[15px] leading-snug">
                                  <span className="font-semibold text-stone-900">{event.user.name}</span>{" "}
                                  <span className="text-stone-500">{event.action}</span>{" "}
                                  <span className="font-medium text-stone-800">{event.target}</span>
                                </p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="text-xs font-medium text-stone-400 flex items-center">
                                    <Clock className="h-3 w-3 mr-1.5 inline" />
                                    {event.time}
                                  </span>
                                  {event.isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm"></span>}
                                </div>
                              </div>
                              <div className="shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <EventAction event={event} />
                              </div>
                            </div>
                            
                            {/* Rich Details */}
                            {event.details && (
                              <div className={`mt-3.5 p-3.5 rounded-xl text-sm leading-relaxed border 
                                ${event.type === "message" 
                                  ? "bg-white text-stone-600 shadow-sm border-stone-200/60 relative before:absolute before:-top-2 before:left-4 before:w-4 before:h-4 before:bg-white before:border-t before:border-l before:border-stone-200/60 before:rotate-45" 
                                  : "bg-stone-50/80 text-stone-600 border-stone-100"}`}>
                                {event.type === "message" ? (
                                  <span className="relative z-10 block italic">"{event.details}"</span>
                                ) : (
                                  <span className="relative z-10 block">{event.details}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                
                {/* End of feed marker */}
                <div className="flex items-center justify-center gap-3 text-stone-300 py-4">
                  <div className="h-px bg-stone-100 w-12"></div>
                  <Check className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-widest font-bold">You're all caught up</span>
                  <div className="h-px bg-stone-100 w-12"></div>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Right Column: Digest & Stats */}
          <div className="w-[340px] shrink-0 flex flex-col gap-6 overflow-y-auto pb-4 pr-2 custom-scrollbar">
            
            {/* Beautiful gradient daily summary */}
            <Card className="border-0 shadow-md rounded-3xl overflow-hidden bg-gradient-to-br from-[#FF9A9E] to-[#FECFEF] text-stone-900 relative">
              <div className="absolute inset-0 bg-white/40 mix-blend-overlay"></div>
              <CardContent className="p-7 relative z-10">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-semibold text-stone-900 tracking-tight flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Daily Summary
                  </h3>
                  <Badge variant="outline" className="border-stone-900/10 bg-white/50 text-stone-800 font-medium rounded-full px-3 backdrop-blur-sm">
                    Oct 24
                  </Badge>
                </div>
                
                <div className="space-y-5">
                  <div className="bg-white/60 rounded-2xl p-4 backdrop-blur-sm shadow-sm border border-white/40">
                    <div className="text-3xl font-bold text-stone-900 tracking-tight mb-0.5">{dailyDigest.stats.newStudents}</div>
                    <div className="text-sm font-medium text-stone-600">New Enrollments This Week</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/40 rounded-2xl p-4 backdrop-blur-sm border border-white/20">
                      <div className="text-2xl font-semibold text-stone-800">{dailyDigest.stats.quizzesGraded}</div>
                      <div className="text-xs font-medium text-stone-600 mt-1">Quizzes Graded</div>
                    </div>
                    <div className="bg-white/40 rounded-2xl p-4 backdrop-blur-sm border border-white/20 relative overflow-hidden">
                      <div className="text-2xl font-semibold text-stone-800">{dailyDigest.stats.messagesUnread}</div>
                      <div className="text-xs font-medium text-stone-600 mt-1">Unread Msg</div>
                      {dailyDigest.stats.messagesUnread > 0 && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-[#FFE1E7]"></div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Soft Card */}
            <div className="bg-white rounded-3xl border border-stone-200/60 shadow-sm p-7">
              <h3 className="font-semibold text-stone-900 mb-5 flex items-center justify-between">
                Upcoming
                <Button variant="ghost" size="icon" className="h-8 w-8 text-stone-400 hover:text-stone-800 -mr-2"><MoreVertical className="h-4 w-4" /></Button>
              </h3>
              <div className="space-y-4">
                {dailyDigest.upcoming.map((item, idx) => (
                  <div key={item.id} className="flex gap-4 group cursor-pointer">
                    <div className="flex flex-col items-center mt-0.5">
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${item.type === 'deadline' ? 'bg-orange-500 ring-4 ring-orange-50' : 'bg-blue-500 ring-4 ring-blue-50'}`}></div>
                      {idx !== dailyDigest.upcoming.length - 1 && (
                        <div className="w-px h-full bg-stone-100 mt-2"></div>
                      )}
                    </div>
                    <div className="pb-4 group-hover:translate-x-1 transition-transform">
                      <p className="text-[14px] font-medium text-stone-800 leading-tight group-hover:text-orange-600 transition-colors">{item.title}</p>
                      <p className="text-xs font-medium text-stone-400 mt-1.5">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-2 rounded-2xl border-dashed border-stone-300 text-stone-500 hover:text-stone-800 hover:bg-stone-50 hover:border-stone-400 h-11 text-sm font-medium">
                <Plus className="h-4 w-4 mr-2" /> Add Reminder
              </Button>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-3xl border border-stone-200/60 shadow-sm p-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-4 px-2">Quick Actions</h3>
              <div className="space-y-1">
                <Button variant="ghost" className="w-full justify-start text-stone-600 font-medium h-11 rounded-xl hover:bg-orange-50 hover:text-orange-700 transition-colors">
                  <FileText className="h-4 w-4 mr-3 text-stone-400" />
                  Grade Pending Quizzes 
                  <Badge className="ml-auto bg-orange-100 text-orange-800 hover:bg-orange-200 border-0 shadow-sm rounded-full px-2">2</Badge>
                </Button>
                <Button variant="ghost" className="w-full justify-start text-stone-600 font-medium h-11 rounded-xl hover:bg-stone-50 transition-colors">
                  <UserPlus className="h-4 w-4 mr-3 text-stone-400" />
                  Review New Students
                </Button>
                <Button variant="ghost" className="w-full justify-start text-stone-600 font-medium h-11 rounded-xl hover:bg-stone-50 transition-colors">
                  <FileText className="h-4 w-4 mr-3 text-stone-400" />
                  Course Reports
                </Button>
              </div>
            </div>

          </div>
        </div>
      </div>
      
      {/* Global CSS for hiding scrollbar visually but keeping functionality */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(214, 211, 209, 0.5);
          border-radius: 20px;
        }
      `}} />
    </div>
  );
}

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X, Send, Loader2, ChevronDown, RotateCcw, Bot } from 'lucide-react';
import { cn } from '../lib/utils';
import { authFetch } from '../lib/apiUrl';

type Role = 'teacher' | 'student' | 'admin';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatbotProps {
  userRole: Role;
}

const ROLE_THEME: Record<Role, {
  accent: string;
  bubble: string;
  headerGrad: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  userBubble: string;
  sendBtn: string;
  glow: string;
}> = {
  teacher: {
    accent: 'violet',
    bubble: 'from-violet-600 to-indigo-600',
    headerGrad: 'from-violet-900/80 to-indigo-900/80',
    chipBg: 'bg-violet-500/10',
    chipBorder: 'border-violet-500/20',
    chipText: 'text-violet-300',
    userBubble: 'bg-gradient-to-br from-violet-600 to-indigo-600',
    sendBtn: 'from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-violet-900/40',
    glow: 'shadow-violet-900/60',
  },
  student: {
    accent: 'emerald',
    bubble: 'from-emerald-600 to-teal-600',
    headerGrad: 'from-emerald-900/80 to-teal-900/80',
    chipBg: 'bg-emerald-500/10',
    chipBorder: 'border-emerald-500/20',
    chipText: 'text-emerald-300',
    userBubble: 'bg-gradient-to-br from-emerald-600 to-teal-600',
    sendBtn: 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-900/40',
    glow: 'shadow-emerald-900/60',
  },
  admin: {
    accent: 'indigo',
    bubble: 'from-indigo-600 to-slate-600',
    headerGrad: 'from-indigo-900/80 to-slate-900/80',
    chipBg: 'bg-indigo-500/10',
    chipBorder: 'border-indigo-500/20',
    chipText: 'text-indigo-300',
    userBubble: 'bg-gradient-to-br from-indigo-600 to-slate-700',
    sendBtn: 'from-indigo-600 to-slate-700 hover:from-indigo-500 hover:to-slate-600 shadow-indigo-900/40',
    glow: 'shadow-indigo-900/60',
  },
};

function getPageLabel(pathname: string): string {
  const map: Record<string, string> = {
    '/teacher': 'Teacher Dashboard',
    '/teacher/courses': 'My Courses',
    '/teacher/modules': 'Modules',
    '/teacher/lessons': 'Lessons',
    '/teacher/quizzes': 'Quiz Builder',
    '/teacher/exams': 'Exams',
    '/teacher/students': 'My Students',
    '/teacher/classes': 'Classes',
    '/teacher/assignments': 'Assignments',
    '/teacher/attendance': 'Attendance',
    '/teacher/certificates': 'Certificates',
    '/teacher/live-quiz': 'Live Quiz',
    '/teacher/live-sessions': 'Live Sessions',
    '/teacher/community': 'Community',
    '/teacher/announcements': 'Announcements',
    '/teacher/progress': 'Student Progress',
    '/teacher/results': 'Quiz Results',
    '/teacher/profile': 'Profile',
    '/student': 'Student Dashboard',
    '/student/courses': 'My Courses',
    '/student/continue': 'Continue Learning',
    '/student/lessons': 'Lessons',
    '/student/quizzes': 'Quizzes',
    '/student/exams': 'Exams',
    '/student/assignments': 'Assignments',
    '/student/progress': 'My Progress',
    '/student/results': 'Results',
    '/student/certificates': 'Certificates',
    '/student/badges': 'Badges',
    '/student/live-quiz': 'Live Quiz',
    '/student/community': 'Community',
    '/student/live-classes': 'Live Classes',
    '/student/live-sessions': 'Live Sessions',
    '/student/profile': 'Profile',
    '/admin': 'Admin Dashboard',
    '/admin/courses': 'Courses',
    '/admin/modules': 'Modules',
    '/admin/lessons': 'Lessons',
    '/admin/quizzes': 'Quizzes',
    '/admin/students': 'Students',
    '/admin/teachers': 'Teachers',
    '/admin/classes': 'Classes',
    '/admin/assignments': 'Assignments',
    '/admin/attendance': 'Attendance',
    '/admin/certificates': 'Certificates',
    '/admin/live-sessions': 'Live Sessions',
    '/admin/community': 'Community',
    '/admin/announcements': 'Announcements',
    '/admin/analytics': 'Analytics',
    '/admin/reports': 'Reports',
    '/admin/payments': 'Payments',
    '/admin/invoices': 'Invoices',
    '/admin/settings': 'Settings',
    '/admin/branding': 'Branding',
    '/admin/roles': 'Roles & Permissions',
    '/admin/profile': 'Profile',
  };
  const exact = map[pathname];
  if (exact) return exact;
  for (const [prefix, label] of Object.entries(map)) {
    if (pathname.startsWith(prefix + '/')) return label;
  }
  return 'Platform';
}

function getQuickChips(pathname: string, role: Role): string[] {
  if (role === 'teacher') {
    if (pathname.includes('/quizzes')) return ['How do I create a quiz?', 'Add question types', 'Set timer & points', 'Publish quiz'];
    if (pathname.includes('/courses')) return ['How do I create a course?', 'Add course modules', 'Set pricing', 'Publish course'];
    if (pathname.includes('/lessons')) return ['Create a new lesson', 'Add video content', 'Set lesson order', 'Free preview'];
    if (pathname.includes('/live-quiz')) return ['Start a live quiz', 'Share PIN with students', 'View live scores', 'End session'];
    if (pathname.includes('/live-sessions')) return ['Start a live session', 'Invite students', 'Share screen', 'Record session'];
    if (pathname.includes('/students')) return ['View student progress', 'Manage enrollment', 'Student results'];
    if (pathname.includes('/assignments')) return ['Create assignment', 'Set due date', 'Grade submissions'];
    if (pathname.includes('/attendance')) return ['Mark attendance', 'View attendance report'];
    if (pathname.includes('/results')) return ['View quiz results', 'Export results', 'Student performance'];
    if (pathname.includes('/community')) return ['Post a question', 'Answer students', 'Pin a discussion'];
    return ['How do I create a quiz?', 'Start a live session', 'View student progress', 'Create a course'];
  }
  if (role === 'student') {
    if (pathname.includes('/quizzes')) return ['How do I start a quiz?', 'View my scores', 'Time remaining?', 'Submit quiz'];
    if (pathname.includes('/courses')) return ['Join a course', 'View my courses', 'Continue learning'];
    if (pathname.includes('/live-quiz')) return ['Join live quiz', 'Enter PIN code', 'See leaderboard'];
    if (pathname.includes('/live-sessions')) return ['Join live class', 'Raise my hand', 'View recordings'];
    if (pathname.includes('/results')) return ['View my scores', 'See correct answers', 'Download results'];
    if (pathname.includes('/assignments')) return ['Submit assignment', 'View due dates', 'Download files'];
    if (pathname.includes('/progress')) return ['My learning progress', 'Completed courses', 'Quiz statistics'];
    if (pathname.includes('/community')) return ['Ask a question', 'Reply to discussion', 'Mark as solved'];
    if (pathname.includes('/certificates')) return ['Download certificate', 'View achievements'];
    return ['How do I take a quiz?', 'Join a live class', 'View my results', 'See my progress'];
  }
  if (role === 'admin') {
    if (pathname.includes('/students')) return ['Add a student', 'Manage enrollment', 'View student data'];
    if (pathname.includes('/teachers')) return ['Add a teacher', 'Assign courses', 'Teacher permissions'];
    if (pathname.includes('/courses')) return ['Create a course', 'Assign teacher', 'Manage modules'];
    if (pathname.includes('/settings')) return ['Configure platform', 'Enable features', '2FA settings'];
    if (pathname.includes('/analytics')) return ['View platform stats', 'Export reports', 'Student activity'];
    if (pathname.includes('/payments')) return ['View transactions', 'Manage subscriptions', 'Refund policy'];
    if (pathname.includes('/roles')) return ['Create a role', 'Assign permissions', 'Manage access'];
    if (pathname.includes('/branding')) return ['Change logo', 'Update school name', 'Color theme'];
    return ['Manage users', 'View platform analytics', 'Configure settings', 'Manage courses'];
  }
  return ['How can you help me?', 'What can I do here?'];
}

function TypingDots({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn('w-2 h-2 rounded-full animate-bounce', color)}
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
        />
      ))}
    </div>
  );
}

function formatContent(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, '').trim());
        i++;
      }
      elements.push(
        <ol key={i} className="list-decimal list-inside space-y-1 mt-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm leading-relaxed">{item}</li>
          ))}
        </ol>
      );
      continue;
    }
    if (/^[-•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-•]\s/, '').trim());
        i++;
      }
      elements.push(
        <ul key={i} className="list-disc list-inside space-y-1 mt-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm leading-relaxed">{item}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (line.trim()) {
      elements.push(
        <p key={i} className="text-sm leading-relaxed">{line}</p>
      );
    }
    i++;
  }
  return <div className="space-y-1.5">{elements}</div>;
}

export default function AIChatbot({ userRole }: AIChatbotProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();

  const theme = ROLE_THEME[userRole];
  const pageLabel = getPageLabel(location.pathname);
  const chips = getQuickChips(location.pathname, userRole);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (open && messages.length === 0) {
      const greetings: Record<Role, string> = {
        teacher: `Hi! I'm your AI Teaching Assistant. I can see you're on the **${pageLabel}** page.\n\nI can help you:\n- Navigate platform features\n- Create quizzes, lessons, and courses\n- Start live sessions and quizzes\n- Understand student results\n\nWhat do you need help with?`,
        student: `Hi! I'm your AI Learning Assistant. I can see you're on the **${pageLabel}** page.\n\nI can help you:\n- Take quizzes and view scores\n- Join live classes\n- Track your progress\n- Understand your assignments\n\nWhat would you like to know?`,
        admin: `Hi! I'm your AI Platform Assistant. I can see you're on the **${pageLabel}** page.\n\nI can help you:\n- Manage users, courses and classes\n- Configure platform settings\n- Understand analytics and reports\n- Set up roles and permissions\n\nHow can I assist you?`,
      };
      setMessages([{ role: 'assistant', content: greetings[userRole], timestamp: new Date() }]);
    }
  }, [open]);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(scrollToBottom, 80);
    }
  }, [messages, open, minimized]);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimized]);

  useEffect(() => {
    if (messages.length > 0) {
      setMessages([]);
    }
  }, [location.pathname]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: 'user', content: trimmed, timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const history = newMessages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await authFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: history.slice(0, -1),
          role: userRole,
          page: pageLabel,
          path: location.pathname,
        }),
      });

      const json = await res.json();
      const reply = json.reply || "I'm sorry, I couldn't process that. Please try again.";
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, timestamp: new Date() }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Connection error. Please check your internet and try again.", timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, userRole, pageLabel, location.pathname]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setTimeout(() => {
      const greetings: Record<Role, string> = {
        teacher: `Hi again! I'm on the **${pageLabel}** page with you. What do you need help with?`,
        student: `Hi again! You're on the **${pageLabel}** page. How can I help you?`,
        admin: `Hi again! You're on the **${pageLabel}** page. What would you like to know?`,
      };
      setMessages([{ role: 'assistant', content: greetings[userRole], timestamp: new Date() }]);
    }, 100);
  };

  return (
    <>
      {/* Floating Bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            'fixed bottom-6 right-6 z-[999] w-14 h-14 rounded-2xl flex items-center justify-center',
            'bg-gradient-to-br shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95',
            theme.bubble, theme.glow
          )}
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)' }}
          title="AI Assistant"
        >
          <Sparkles className="w-6 h-6 text-white" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-slate-900 animate-pulse" />
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-[999] flex flex-col rounded-2xl overflow-hidden"
          style={{
            width: '360px',
            height: minimized ? 'auto' : '520px',
            background: 'linear-gradient(145deg, #0a0c14, #0f1120)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)',
          }}
        >
          {/* Top accent line */}
          <div className={cn('h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-60',
            userRole === 'teacher' ? 'text-violet-500' : userRole === 'student' ? 'text-emerald-500' : 'text-indigo-500'
          )} />

          {/* Header */}
          <div className={cn('px-4 py-3 flex items-center justify-between bg-gradient-to-r backdrop-blur-sm shrink-0', theme.headerGrad)}>
            <div className="flex items-center gap-2.5">
              <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shadow-lg bg-gradient-to-br', theme.bubble)}>
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-white leading-tight">AI Assistant</div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
                  {pageLabel}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={resetChat}
                title="New conversation"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setMinimized((m) => !m)}
                title={minimized ? 'Expand' : 'Minimize'}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-all"
              >
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', minimized ? 'rotate-180' : '')} />
              </button>
              <button
                onClick={() => { setOpen(false); setMinimized(false); }}
                title="Close"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-none min-h-0">
                {messages.map((msg, idx) => (
                  <div key={idx} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && (
                      <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center mr-2 mt-0.5 shrink-0 bg-gradient-to-br', theme.bubble)}>
                        <Bot className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div
                      className={cn(
                        'max-w-[82%] rounded-2xl px-3.5 py-2.5',
                        msg.role === 'user'
                          ? cn('text-white rounded-tr-sm', theme.userBubble)
                          : 'bg-white/[0.06] text-slate-200 rounded-tl-sm border border-white/[0.06]'
                      )}
                    >
                      {msg.role === 'assistant' ? formatContent(msg.content) : (
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      )}
                      <div className="text-[10px] text-white/30 mt-1 text-right">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center mr-2 mt-0.5 shrink-0 bg-gradient-to-br', theme.bubble)}>
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                    <div className="bg-white/[0.06] border border-white/[0.06] rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                      <TypingDots color={
                        userRole === 'teacher' ? 'bg-violet-400' :
                        userRole === 'student' ? 'bg-emerald-400' : 'bg-indigo-400'
                      } />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Chips */}
              {messages.length <= 1 && (
                <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
                  {chips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => sendMessage(chip)}
                      disabled={loading}
                      className={cn(
                        'text-[11px] px-2.5 py-1 rounded-lg border transition-all font-medium disabled:opacity-40',
                        theme.chipBg, theme.chipBorder, theme.chipText,
                        'hover:bg-white/10'
                      )}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="px-3 pb-3 pt-2 border-t border-white/[0.06] shrink-0">
                <div className="flex items-end gap-2 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 focus-within:border-white/20 transition-all">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything..."
                    rows={1}
                    disabled={loading}
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 resize-none focus:outline-none leading-relaxed max-h-24 scrollbar-none disabled:opacity-50"
                    style={{ minHeight: '24px' }}
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || loading}
                    className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all',
                      'bg-gradient-to-br shadow-lg disabled:opacity-30 disabled:cursor-not-allowed active:scale-95',
                      theme.sendBtn
                    )}
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-white" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-600 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

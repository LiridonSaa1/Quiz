import React, { useState, useRef, useEffect } from 'react';
import {
  MessageCircle, X, Send, Bot, User, Loader2,
  Sparkles, Map, ChevronDown, RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { apiUrl } from '../lib/apiUrl';
import { TOURS, TOUR_KEYWORDS, detectTourFromMessage, Tour } from '../lib/tourDefinitions';
import GuidedTour from './GuidedTour';
import { useLocation } from 'react-router-dom';

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  tourId?: string | null;
  timestamp: Date;
}

interface ChatBotProps {
  userRole?: string;
}

const PAGE_NAMES: Record<string, string> = {
  '/': 'Dashboard',
  '/courses': 'Courses',
  '/quizzes': 'Quizzes',
  '/modules': 'Modules',
  '/lessons': 'Lessons',
  '/students': 'Students',
  '/classes': 'Classes',
  '/live-sessions': 'Live Sessions',
  '/assignments': 'Assignments',
  '/attendance': 'Attendance',
  '/certificates': 'Certificates',
  '/results': 'Results',
  '/settings': 'Settings',
};

function getPageName(path: string): string {
  for (const [key, name] of Object.entries(PAGE_NAMES)) {
    if (path.includes(key) && key !== '/') return name;
  }
  return 'Platform';
}

const SUGGESTIONS = [
  'How do I create a quiz?',
  'How do I create a course?',
  'How do I add a student?',
  'How do I start a live session?',
  'How do I create a module?',
];

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

function MessageBubble({ msg, onStartTour }: { msg: Message; onStartTour: (id: string) => void }) {
  const isUser = msg.role === 'user';
  const tour = msg.tourId ? TOURS[msg.tourId] : null;

  return (
    <div className={cn('flex items-end gap-2', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5',
        isUser
          ? 'bg-gradient-to-br from-slate-600 to-slate-800'
          : 'bg-gradient-to-br from-indigo-500 to-violet-600'
      )}>
        {isUser
          ? <User className="w-3.5 h-3.5 text-white" />
          : <Bot className="w-3.5 h-3.5 text-white" />
        }
      </div>

      <div className={cn('flex flex-col gap-2 max-w-[82%]', isUser && 'items-end')}>
        {/* Bubble */}
        <div className={cn(
          'px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-br-sm'
            : 'bg-slate-100 text-slate-800 rounded-bl-sm'
        )}>
          {msg.content}
        </div>

        {/* Tour CTA */}
        {tour && !isUser && (
          <button
            onClick={() => onStartTour(tour.id)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border-2 border-indigo-200 rounded-xl text-xs font-semibold text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm"
          >
            <Map className="w-3.5 h-3.5" />
            Start Step-by-Step Tour →
          </button>
        )}
      </div>
    </div>
  );
}

export default function ChatBot({ userRole = 'student' }: ChatBotProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 100);
      if (messages.length === 0) {
        const greeting: Message = {
          id: 'welcome',
          role: 'bot',
          content: `Hi there! 👋 I'm your AI assistant for this platform.\n\nI can answer your questions and launch interactive step-by-step guides to help you get things done. Try asking me:\n• "How do I create a quiz?"\n• "How do I add a student?"\n• "How do I start a live session?"`,
          timestamp: new Date(),
        };
        setMessages([greeting]);
      }
    }
  }, [open]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const tourId = detectTourFromMessage(trimmed);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowSuggestions(false);
    setLoading(true);

    try {
      const history = messages
        .slice(-8)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

      const res = await fetch(apiUrl('/api/ai/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          role: userRole,
          page: getPageName(location.pathname),
          path: location.pathname,
          history,
        }),
      });

      const data = await res.json();
      const reply = data.reply || data.error || 'Sorry, I could not process that request.';

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: reply,
        tourId: tourId,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);

      if (!open) setHasUnread(true);
    } catch {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        content: 'I\'m having trouble connecting. Please check that your GEMINI_API_KEY is configured in Secrets.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
    setTimeout(() => {
      const greeting: Message = {
        id: 'welcome-reset',
        role: 'bot',
        content: `Chat cleared! How can I help you? 😊`,
        timestamp: new Date(),
      };
      setMessages([greeting]);
    }, 50);
  };

  return (
    <>
      {/* Guided Tour Overlay */}
      {activeTour && (
        <GuidedTour
          tour={activeTour}
          onClose={() => setActiveTour(null)}
        />
      )}

      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl hover:shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
        >
          <MessageCircle className="w-6 h-6" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
          )}
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
          style={{ height: '560px' }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-white">AI Assistant</h3>
              <p className="text-[11px] text-indigo-200">Powered by Gemini · Always here to help</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                title="Clear chat"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onStartTour={(id) => setActiveTour(TOURS[id] || null)}
              />
            ))}
            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {showSuggestions && messages.length <= 1 && (
            <div className="px-4 pb-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Quick questions</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-4 pb-4 pt-2 border-t border-slate-100">
            <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything… (Enter to send)"
                rows={1}
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 resize-none outline-none max-h-24 leading-relaxed"
                style={{ scrollbarWidth: 'none' }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className={cn(
                  'p-2 rounded-xl transition-all shrink-0 mb-0.5',
                  input.trim() && !loading
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                )}
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

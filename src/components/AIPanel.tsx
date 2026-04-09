import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2, AlertCircle } from 'lucide-react';

interface AIPanelProps {
  placeholder?: string;
  label?: string;
  description?: string;
  buttonLabel?: string;
  onSubmit: (input: string) => Promise<void>;
  open: boolean;
  onClose: () => void;
}

export function AIPanel({
  placeholder = 'Describe what you want to create...',
  label = 'AI Assistant',
  description,
  buttonLabel = 'Generate',
  onSubmit,
  open,
  onClose,
}: AIPanelProps) {
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const textareaRef           = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setInput('');
      setError(null);
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(input.trim());
      setInput('');
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Check your Gemini API key.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        disabled={loading}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(145deg,#0f1117,#14101f)' }}>

        {/* Top gradient accent */}
        <div className="h-px bg-gradient-to-r from-transparent via-violet-500/60 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/50">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">{label}</div>
              {description && <div className="text-[11px] text-slate-500 mt-0.5">{description}</div>}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/8 transition-all disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
            placeholder={placeholder}
            rows={4}
            disabled={loading}
            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all resize-none leading-relaxed disabled:opacity-50"
          />

          {error && (
            <div className="flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-600">⌘ + Enter to generate</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-300 hover:bg-white/6 transition-all disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                ) : (
                  <><Send className="w-3.5 h-3.5" /> {buttonLabel}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Trigger button ─────────────────────────────────────────── */

interface AITriggerProps {
  onClick: () => void;
  label?: string;
  size?: 'sm' | 'md';
}

export function AITriggerButton({ onClick, label = 'AI Fill', size = 'md' }: AITriggerProps) {
  if (size === 'sm') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-all"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-200 active:scale-[0.98]"
    >
      <Sparkles className="w-4 h-4" />
      {label}
    </button>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Loader2, AlertCircle, Paperclip } from 'lucide-react';

interface AIPanelProps {
  placeholder?: string;
  label?: string;
  description?: string;
  buttonLabel?: string;
  onSubmit: (input: string) => Promise<void>;
  open: boolean;
  onClose: () => void;
  allowTextFileUpload?: boolean;
  acceptedTextFileTypes?: string;
  fileUploadLabel?: string;
  fileUploadHint?: string;
  maxTextFileChars?: number;
}

const DEFAULT_TEXT_FILE_TYPES = '.txt,.md,.srt,.vtt,.json,.csv,text/plain,text/vtt,application/json,text/csv';

export function AIPanel({
  placeholder = 'Describe what you want to create...',
  label = 'AI Assistant',
  description,
  buttonLabel = 'Generate',
  onSubmit,
  open,
  onClose,
  allowTextFileUpload = false,
  acceptedTextFileTypes = DEFAULT_TEXT_FILE_TYPES,
  fileUploadLabel = 'Attach transcript/text file',
  fileUploadHint = 'Supported: .txt, .md, .srt, .vtt, .json, .csv',
  maxTextFileChars = 20000,
}: AIPanelProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setInput('');
      setError(null);
      setAttachedFile('');
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [open]);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || loading) return;

    try {
      const raw = await file.text();
      const cleaned = raw.replace(/\r/g, '\n').replace(/\u0000/g, '').trim();
      if (!cleaned) {
        setError('The uploaded file is empty. Please upload a file with transcript/text content.');
        return;
      }

      const clipped = cleaned.length > maxTextFileChars ? cleaned.slice(0, maxTextFileChars) : cleaned;
      setInput((prev) => (prev.trim() ? `${prev.trim()}\n\n${clipped}` : clipped));
      setAttachedFile(
        cleaned.length > maxTextFileChars
          ? `${file.name} (trimmed to ${maxTextFileChars.toLocaleString()} chars)`
          : `${file.name} (${cleaned.length.toLocaleString()} chars)`,
      );
      setError(null);
    } catch {
      setError('Could not read this file. Please upload a plain text or transcript file.');
    }
  };

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(input.trim());
      setInput('');
      setAttachedFile('');
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Check your AI key/configuration.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} disabled={loading} />

      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(145deg,#0f1117,#14101f)' }}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-violet-500/60 to-transparent" />

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

        <div className="p-5 space-y-4">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
            placeholder={placeholder}
            rows={6}
            disabled={loading}
            className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all resize-none leading-relaxed disabled:opacity-50"
          />

          {allowTextFileUpload && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <Paperclip className="w-3.5 h-3.5 text-violet-400" />
                  {fileUploadLabel}
                </span>
                <input
                  type="file"
                  accept={acceptedTextFileTypes}
                  className="hidden"
                  onChange={(e) => void handleFilePick(e)}
                  disabled={loading}
                />
                <span className="text-[11px] font-semibold text-violet-300 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  Upload
                </span>
              </label>
              <p className="text-[11px] text-slate-500 mt-2">{fileUploadHint}</p>
              {attachedFile && <p className="text-[11px] text-emerald-300 mt-1.5">Attached: {attachedFile}</p>}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-600">Ctrl/Cmd + Enter to generate</span>
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
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> {buttonLabel}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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

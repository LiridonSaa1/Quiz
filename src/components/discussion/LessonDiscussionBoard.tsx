import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MessageSquare, Pin, Search, ThumbsUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../../supabase';
import {
  addAnswer,
  addReply,
  createLessonQuestion,
  getQuestionThread,
  listLessonQuestions,
  markBestAnswer,
  pinQuestion,
  reactToDiscussion,
  reportDiscussion,
} from '../../lib/discussions';
import { authFetch } from '../../lib/apiUrl';

type QuestionRow = any;

type Props = {
  lessonId: string;
  canModerate?: boolean;
  title?: string;
};

export default function LessonDiscussionBoard({ lessonId, canModerate = false, title = 'Lesson Discussion' }: Props) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string>('');
  const [answers, setAnswers] = useState<any[]>([]);
  const [replies, setReplies] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'helpful' | 'unanswered'>('recent');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [answerBody, setAnswerBody] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [myStats, setMyStats] = useState<any | null>(null);
  const [myBadges, setMyBadges] = useState<any[]>([]);

  const loadQuestions = async (append = false) => {
    try {
      setLoading(!append);
      const json = await listLessonQuestions(lessonId, { q, sort, cursor: append ? cursor || undefined : undefined, limit: 20 });
      const incoming = Array.isArray(json?.questions) ? json.questions : [];
      setQuestions((prev) => (append ? [...prev, ...incoming] : incoming));
      setHasMore(Boolean(json?.hasMore));
      setCursor(json?.nextCursor || null);
      if (!append && incoming[0]?.id) setActiveQuestionId(String(incoming[0].id));
    } catch (e: any) {
      toast.error(e.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const loadThread = async (questionId: string) => {
    try {
      const json = await getQuestionThread(questionId);
      setAnswers(Array.isArray(json?.answers) ? json.answers : []);
      setReplies(Array.isArray(json?.replies) ? json.replies : []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load discussion thread');
    }
  };

  useEffect(() => {
    if (!lessonId) return;
    void loadQuestions(false);
  }, [lessonId, q, sort]);

  useEffect(() => {
    const loadStats = async () => {
      const res = await authFetch('/api/student/discussions/me/stats');
      const json = res.ok ? await res.json() : null;
      setMyStats(json?.stats || null);
      setMyBadges(Array.isArray(json?.badges) ? json.badges : []);
    };
    void loadStats();
  }, []);

  useEffect(() => {
    if (!activeQuestionId) return;
    void loadThread(activeQuestionId);
  }, [activeQuestionId]);

  useEffect(() => {
    const channel = supabase
      .channel(`lesson-discussions-${lessonId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_discussion_questions', filter: `lesson_id=eq.${lessonId}` }, () => {
        void loadQuestions(false);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [lessonId, q, sort]);

  const activeQuestion = useMemo(() => questions.find((row) => String(row.id) === activeQuestionId) || null, [questions, activeQuestionId]);

  const groupedReplies = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const row of replies) {
      const answerId = String(row?.answer_id || '');
      if (!answerId) continue;
      if (!map[answerId]) map[answerId] = [];
      map[answerId].push(row);
    }
    return map;
  }, [replies]);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-5 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        <div className="text-right">
          <div className="text-xs text-slate-400">{questions.length} questions</div>
          {myStats ? <div className="text-xs text-indigo-600 font-semibold">Reputation: {myStats.reputation || 0}</div> : null}
        </div>
      </div>
      {myBadges.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {myBadges.slice(0, 4).map((row) => (
            <span key={String(row?.badge?.id || row?.awarded_at)} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-md">
              {String(row?.badge?.label || 'Badge')}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-5">
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm" placeholder="Search questions" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="recent">Most recent</option>
            <option value="helpful">Most helpful</option>
            <option value="unanswered">Unanswered</option>
          </select>
          <div className="space-y-2 max-h-[440px] overflow-auto pr-1">
            {loading ? <p className="text-sm text-slate-400">Loading questions...</p> : null}
            {questions.map((row) => (
              <button key={row.id} type="button" onClick={() => setActiveQuestionId(String(row.id))}
                className={`w-full text-left rounded-xl border px-3 py-2 ${activeQuestionId === String(row.id) ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}>
                <div className="flex items-center gap-2">
                  {row.is_pinned ? <Pin className="w-3.5 h-3.5 text-indigo-600" /> : <MessageSquare className="w-3.5 h-3.5 text-slate-500" />}
                  <span className="text-sm font-semibold text-slate-800 line-clamp-1">{row.title}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{row.body}</p>
                <div className="text-[11px] text-slate-400 mt-1">
                  {row.answers_count || 0} answers · {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                </div>
              </button>
            ))}
          </div>
          {hasMore ? <button type="button" onClick={() => void loadQuestions(true)} className="w-full text-sm rounded-xl border border-slate-200 py-2 hover:bg-slate-50">Load more</button> : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 p-3 space-y-2">
            <p className="text-sm font-bold text-slate-800">Ask a question</p>
            <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Question title" />
            <textarea value={formBody} onChange={(e) => setFormBody(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[84px]" placeholder="Describe your question" />
            <button
              type="button"
              onClick={async () => {
                if (!formTitle.trim() || !formBody.trim()) return;
                try {
                  await createLessonQuestion(lessonId, { title: formTitle.trim(), body: formBody.trim() });
                  setFormTitle('');
                  setFormBody('');
                  await loadQuestions(false);
                } catch (e: any) {
                  toast.error(e.message || 'Failed to create question');
                }
              }}
              className="rounded-lg bg-indigo-600 text-white text-sm px-3 py-2"
            >
              Post question
            </button>
          </div>

          {!activeQuestion ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500 text-center">Select a question to view replies.</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-slate-900">{activeQuestion.title}</h3>
                  {canModerate ? (
                    <button
                      className="text-xs rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
                      onClick={async () => {
                        try {
                          await pinQuestion(String(activeQuestion.id), !Boolean(activeQuestion.is_pinned));
                          await loadQuestions(false);
                        } catch (e: any) {
                          toast.error(e.message || 'Failed to update pin');
                        }
                      }}
                    >
                      {activeQuestion.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                  ) : null}
                </div>
                <p className="text-sm text-slate-600 mt-2">{activeQuestion.body}</p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-3 space-y-2">
                <textarea value={answerBody} onChange={(e) => setAnswerBody(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[72px]" placeholder="Write an answer" />
                <button
                  type="button"
                  onClick={async () => {
                    if (!answerBody.trim()) return;
                    try {
                      await addAnswer(String(activeQuestion.id), answerBody.trim());
                      setAnswerBody('');
                      await loadThread(String(activeQuestion.id));
                      await loadQuestions(false);
                    } catch (e: any) {
                      toast.error(e.message || 'Failed to post answer');
                    }
                  }}
                  className="rounded-lg bg-slate-900 text-white text-sm px-3 py-2"
                >
                  Post answer
                </button>
              </div>

              {answers.map((answer) => (
                <div key={answer.id} className={`rounded-2xl border p-3 ${answer.is_best ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{answer?.author?.display_name || 'Anonymous'}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => void reactToDiscussion('answer', String(answer.id), 'helpful')} className="text-xs inline-flex items-center gap-1 border border-slate-300 rounded-md px-2 py-1 hover:bg-slate-50">
                        <ThumbsUp className="w-3 h-3" /> Helpful
                      </button>
                      {canModerate && !answer.is_best ? (
                        <button
                          className="text-xs rounded-md border border-emerald-300 text-emerald-700 px-2 py-1 hover:bg-emerald-50"
                          onClick={async () => {
                            try {
                              await markBestAnswer(String(activeQuestion.id), String(answer.id));
                              await loadThread(String(activeQuestion.id));
                              await loadQuestions(false);
                            } catch (e: any) {
                              toast.error(e.message || 'Failed to mark best answer');
                            }
                          }}
                        >
                          Mark best
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 mt-1">{answer.body}</p>
                  {answer.is_best ? <p className="text-xs text-emerald-700 mt-1 font-semibold">Best answer</p> : null}

                  <div className="mt-2 space-y-2">
                    {(groupedReplies[String(answer.id)] || []).slice(0, 6).map((reply) => (
                      <div key={reply.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <p className="font-medium text-slate-700">{reply?.author?.display_name || 'Anonymous'}</p>
                        <p className="text-slate-600">{reply.body}</p>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        value={replyDrafts[String(answer.id)] || ''}
                        onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [String(answer.id)]: e.target.value }))}
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Reply to this answer"
                      />
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                        onClick={async () => {
                          const draft = String(replyDrafts[String(answer.id)] || '').trim();
                          if (!draft) return;
                          try {
                            await addReply(String(answer.id), draft);
                            setReplyDrafts((prev) => ({ ...prev, [String(answer.id)]: '' }));
                            await loadThread(String(activeQuestion.id));
                          } catch (e: any) {
                            toast.error(e.message || 'Failed to post reply');
                          }
                        }}
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 text-rose-700 px-3 py-2 text-sm hover:bg-rose-50"
                        onClick={async () => {
                          try {
                            await reportDiscussion('answer', String(answer.id), 'Inappropriate content');
                            toast.success('Reported');
                          } catch (e: any) {
                            toast.error(e.message || 'Failed to report');
                          }
                        }}
                      >
                        Report
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

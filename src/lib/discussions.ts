import { authFetch, readApiError } from './apiUrl';

export type DiscussionSort = 'recent' | 'helpful' | 'unanswered';

export async function listLessonQuestions(lessonId: string, params: { q?: string; sort?: DiscussionSort; cursor?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.sort) query.set('sort', params.sort);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const res = await authFetch(`/api/student/lessons/${encodeURIComponent(lessonId)}/discussions${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function createLessonQuestion(lessonId: string, payload: { title: string; body: string }) {
  const res = await authFetch(`/api/student/lessons/${encodeURIComponent(lessonId)}/discussions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function getQuestionThread(questionId: string) {
  const res = await authFetch(`/api/student/discussions/questions/${encodeURIComponent(questionId)}`);
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function addAnswer(questionId: string, body: string) {
  const res = await authFetch(`/api/student/discussions/questions/${encodeURIComponent(questionId)}/answers`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function addReply(answerId: string, body: string, parentReplyId?: string) {
  const res = await authFetch(`/api/student/discussions/answers/${encodeURIComponent(answerId)}/replies`, {
    method: 'POST',
    body: JSON.stringify({ body, parent_reply_id: parentReplyId || null }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function reactToDiscussion(target_type: 'question' | 'answer' | 'reply', target_id: string, reaction_type: 'like' | 'helpful' = 'helpful') {
  const res = await authFetch('/api/student/discussions/reactions', {
    method: 'POST',
    body: JSON.stringify({ target_type, target_id, reaction_type }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function markBestAnswer(questionId: string, answerId: string) {
  const res = await authFetch(`/api/teacher/discussions/questions/${encodeURIComponent(questionId)}/best-answer/${encodeURIComponent(answerId)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function pinQuestion(questionId: string, isPinned: boolean) {
  const res = await authFetch(`/api/teacher/discussions/questions/${encodeURIComponent(questionId)}/pin`, {
    method: 'POST',
    body: JSON.stringify({ is_pinned: isPinned }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function reportDiscussion(target_type: 'question' | 'answer' | 'reply', target_id: string, reason: string) {
  const res = await authFetch('/api/student/discussions/reports', {
    method: 'POST',
    body: JSON.stringify({ target_type, target_id, reason }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

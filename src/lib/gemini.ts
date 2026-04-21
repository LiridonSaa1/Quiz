import { GoogleGenAI } from '@google/genai';

const QUIZ_PROMPT_MAX_CHARS = 16000;

const getApiKey = (): string => {
  const processKey = (process.env.GEMINI_API_KEY as string | undefined) || '';
  const viteKey = import.meta.env?.VITE_GEMINI_API_KEY || '';
  return String(processKey || viteKey).trim();
};

const getClient = () => {
  const key = getApiKey();
  if (!key) throw new Error('GEMINI_API_KEY is not configured. Add it to your Secrets.');
  return new GoogleGenAI({ apiKey: key });
};

const getOptionalClient = () => {
  const key = getApiKey();
  return key ? new GoogleGenAI({ apiKey: key }) : null;
};

async function ask(prompt: string): Promise<string> {
  const ai = getClient();
  const res = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  });
  return res.text ?? '';
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function findJsonSlice(text: string, openCh: '{' | '[', closeCh: '}' | ']'): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (ch === '\\') {
        escaping = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === openCh) {
      if (start === -1) start = i;
      depth += 1;
      continue;
    }

    if (ch === closeCh && start !== -1) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function extractJson(raw: string): any {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : raw).trim();

  const direct = tryParseJson(text);
  if (direct !== null) return direct;

  const arraySlice = findJsonSlice(text, '[', ']');
  if (arraySlice) {
    const parsed = tryParseJson(arraySlice);
    if (parsed !== null) return parsed;
  }

  const objectSlice = findJsonSlice(text, '{', '}');
  if (objectSlice) {
    const parsed = tryParseJson(objectSlice);
    if (parsed !== null) return parsed;
  }

  throw new Error('No JSON found in AI response');
}

function collapseWhitespace(input: string): string {
  return input.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function countWords(text: string): number {
  const words = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g);
  return words?.length || 0;
}

function autoQuestionCount(content: string): number {
  const words = countWords(content);
  if (words <= 120) return 3;
  if (words <= 250) return 4;
  if (words <= 450) return 5;
  if (words <= 850) return 7;
  if (words <= 1400) return 9;
  if (words <= 2200) return 11;
  if (words <= 3200) return 13;
  return 15;
}

function stripTimestampNoise(text: string): string {
  return text
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, ' ')
    .replace(/^\s*\d+\s*$/gm, ' ')
    .replace(/-->\s*\d{1,2}:\d{2}(?::\d{2})?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text: string): string[] {
  const base = stripTimestampNoise(text);
  const raw = base
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 28);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function sentenceScore(sentence: string): number {
  const words = countWords(sentence);
  let score = 0;
  if (words >= 8 && words <= 28) score += 2;
  if (/[0-9]/.test(sentence)) score += 1;
  if (/\b(is|are|means|includes|consists|defined|because|therefore|causes|results)\b/i.test(sentence)) score += 1;
  if (sentence.length >= 50 && sentence.length <= 180) score += 2;
  return score;
}

function pickKeySentences(content: string, needed: number): string[] {
  const candidates = splitSentences(content);
  if (!candidates.length) {
    const fallback = collapseWhitespace(content);
    return fallback ? [fallback.slice(0, 220)] : [];
  }
  return candidates
    .map((text, index) => ({ text, index, score: sentenceScore(text) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(needed + 6, needed * 2))
    .map((item) => item.text);
}

function shortTopic(sentence: string): string {
  const cleaned = sentence.replace(/[^A-Za-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean);
  return words.slice(0, 6).join(' ') || 'the provided content';
}

function mutateSentence(source: string, seed: number): string {
  const text = source.replace(/\s+/g, ' ').trim();
  if (!text) return `The content notes an additional detail (${seed + 1}).`;

  const numberMatch = text.match(/\d+(\.\d+)?/);
  if (numberMatch) {
    const num = Number(numberMatch[0]);
    const next = Number.isFinite(num) ? String(num + seed + 1) : numberMatch[0];
    return text.replace(numberMatch[0], next);
  }

  const words = text.split(' ');
  if (words.length >= 6) {
    const index = Math.min(words.length - 2, Math.max(1, Math.floor(words.length / 2)));
    words[index] = seed % 2 === 0 ? 'rarely' : 'not';
    return words.join(' ');
  }

  return `The content does not support: ${text}`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface QuizJsonQuestion {
  question: string;
  options: string[];
  correct_answer: string;
}

function buildFallbackQuizJson(content: string, count: number): QuizJsonQuestion[] {
  const sentences = pickKeySentences(content, count);
  if (!sentences.length) return [];

  const out: QuizJsonQuestion[] = [];

  for (let i = 0; i < count; i += 1) {
    const correct = sentences[i % sentences.length];
    const topic = shortTopic(correct);
    const questionBase = `According to the provided content, what is stated about "${topic}"?`;
    const question =
      i < sentences.length
        ? questionBase
        : `${questionBase} (focus ${i + 1})`;

    const distractorPool = sentences
      .filter((s) => s.toLowerCase() !== correct.toLowerCase())
      .slice(0, 8);

    while (distractorPool.length < 3) {
      distractorPool.push(mutateSentence(correct, distractorPool.length + i));
    }

    const options = uniqueStrings([correct, ...distractorPool]).slice(0, 4);
    while (options.length < 4) {
      options.push(mutateSentence(correct, options.length + i + 2));
    }

    const shuffled = shuffle(options.slice(0, 4));
    if (!shuffled.some((o) => o.toLowerCase() === correct.toLowerCase())) {
      shuffled[0] = correct;
    }

    out.push({
      question,
      options: shuffled,
      correct_answer: correct,
    });
  }

  return out.slice(0, count);
}

function normalizeQuizJsonQuestion(raw: any, fallback: QuizJsonQuestion): QuizJsonQuestion {
  const question = String(raw?.question ?? raw?.text ?? fallback.question).trim() || fallback.question;

  const rawOptions: unknown[] = Array.isArray(raw?.options)
    ? raw.options
    : Array.isArray(raw?.choices)
      ? raw.choices
      : [];

  const options = uniqueStrings(
    rawOptions.map((opt) => {
      if (typeof opt === 'string') return opt;
      if (opt && typeof opt === 'object' && 'text' in (opt as Record<string, unknown>)) {
        return String((opt as { text?: unknown }).text ?? '');
      }
      return '';
    }),
  );

  let correct = String(raw?.correct_answer ?? raw?.correctAnswer ?? raw?.answer ?? '').trim();

  if (/^[ABCD]$/i.test(correct) && options.length >= 4) {
    correct = options['ABCD'.indexOf(correct.toUpperCase())] || correct;
  }

  if (/^[1-4]$/.test(correct) && options.length >= Number(correct)) {
    correct = options[Number(correct) - 1] || correct;
  }

  const mergedOptions = uniqueStrings([...options, ...fallback.options]);
  while (mergedOptions.length < 4) {
    mergedOptions.push(mutateSentence(fallback.correct_answer, mergedOptions.length));
  }

  const finalOptions = mergedOptions.slice(0, 4);

  if (!correct) correct = fallback.correct_answer;
  if (!finalOptions.some((opt) => opt.toLowerCase() === correct.toLowerCase())) {
    finalOptions[0] = correct;
  }

  return {
    question,
    options: finalOptions,
    correct_answer: correct,
  };
}

function normalizeQuizJsonArray(raw: unknown, fallback: QuizJsonQuestion[], count: number): QuizJsonQuestion[] {
  if (!fallback.length) return [];

  const rawArray = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { questions?: unknown[] }).questions)
      ? (raw as { questions: unknown[] }).questions
      : [];

  const out: QuizJsonQuestion[] = [];
  const used = new Set<string>();

  for (let i = 0; i < count; i += 1) {
    const base = fallback[i % fallback.length];
    const candidate = normalizeQuizJsonQuestion(rawArray[i] ?? {}, base);
    const signature = `${candidate.question.toLowerCase()}::${candidate.correct_answer.toLowerCase()}`;
    if (used.has(signature)) continue;
    used.add(signature);
    out.push(candidate);
  }

  for (const f of fallback) {
    if (out.length >= count) break;
    const signature = `${f.question.toLowerCase()}::${f.correct_answer.toLowerCase()}`;
    if (used.has(signature)) continue;
    used.add(signature);
    out.push(f);
  }

  return out.slice(0, count);
}

function toBuilderQuestion(q: QuizJsonQuestion): AIQuestion {
  const options = q.options.slice(0, 4).map((text, idx) => ({ id: String(idx + 1), text }));
  const correctIndex = options.findIndex((o) => o.text.toLowerCase() === q.correct_answer.toLowerCase());
  const safeCorrectIndex = correctIndex >= 0 ? correctIndex : 0;
  return {
    type: 'multiple-choice',
    text: q.question,
    options,
    correctAnswer: options[safeCorrectIndex].id,
    explanation: '',
    points: 1,
  };
}

/* Course fill */

export interface AICourseData {
  name: string;
  short_description: string;
  description: string;
  language: string;
  level: string;
  category: string;
  tags: string[];
  is_free: boolean;
  price: number;
}

export async function generateCourseData(userInput: string): Promise<AICourseData> {
  const prompt = `You are an educational platform assistant. The teacher says:
"${userInput}"

Extract and return ONLY a valid JSON object with these fields:
{
  "name": "Course title (clear, engaging)",
  "short_description": "One sentence summary (max 120 chars)",
  "description": "3-5 sentence full description explaining what students will learn",
  "language": "One of: English, Albanian, Spanish, French, German, Italian, Portuguese, Arabic, Chinese",
  "level": "One of: Beginner, Intermediate, Advanced, All Levels",
  "category": "One of: Mathematics, Science, Programming, Language Arts, History, Arts, Music, Physical Education, Other",
  "tags": ["array", "of", "3-6", "relevant", "tags"],
  "is_free": true or false (default true unless price mentioned),
  "price": 0 (or a number if paid)
}

Return ONLY the JSON object, no explanation.`;

  const raw = await ask(prompt);
  const data = extractJson(raw);
  return {
    name: String(data.name || ''),
    short_description: String(data.short_description || ''),
    description: String(data.description || ''),
    language: String(data.language || 'English'),
    level: String(data.level || 'All Levels'),
    category: String(data.category || 'Other'),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    is_free: data.is_free !== false,
    price: Number(data.price) || 0,
  };
}

/* Quiz questions */

export interface AIQuestion {
  type: 'multiple-choice';
  text: string;
  options: { id: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  points: number;
}

export async function generateQuizQuestions(contentInput: string, explicitCount?: number): Promise<AIQuestion[]> {
  const cleaned = collapseWhitespace(contentInput);
  if (!cleaned) throw new Error('Please provide source content first.');

  const count =
    Number.isFinite(explicitCount) && typeof explicitCount === 'number'
      ? Math.max(3, Math.min(15, Math.round(explicitCount)))
      : autoQuestionCount(cleaned);

  const clipped = cleaned.length > QUIZ_PROMPT_MAX_CHARS ? cleaned.slice(0, QUIZ_PROMPT_MAX_CHARS) : cleaned;
  const fallback = buildFallbackQuizJson(clipped, count);

  const aiClient = getOptionalClient();
  if (!aiClient) {
    return fallback.map(toBuilderQuestion);
  }

  try {
    const prompt = `You are creating student-friendly quiz questions for an LMS.

Rules:
1) Use ONLY the content below. Do not add external knowledge.
2) First identify main ideas from the content, then create questions.
3) Create exactly ${count} questions.
4) Multiple-choice only.
5) Each question must have exactly 4 options.
6) Exactly 1 correct answer, and it must appear in options.
7) Avoid duplicate or very similar questions.
8) Keep language simple and clear for students.
9) Difficulty should match the content complexity.

Return ONLY valid JSON in this exact schema (array only, no markdown):
[
  {
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A"
  }
]

Content:
"""${clipped}"""`;

    const res = await aiClient.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    const raw = res.text ?? '';
    const parsed = extractJson(raw);
    const normalized = normalizeQuizJsonArray(parsed, fallback, count);
    return normalized.map(toBuilderQuestion);
  } catch {
    return fallback.map(toBuilderQuestion);
  }
}

/* Generic page assistant */

export async function askPageAssistant(context: string, userMessage: string): Promise<string> {
  const prompt = `You are a helpful AI assistant embedded in an educational platform teacher portal.
Context: ${context}
Teacher's request: "${userMessage}"

Give a concise, helpful response (max 3 sentences). Be practical and specific.`;
  return ask(prompt);
}

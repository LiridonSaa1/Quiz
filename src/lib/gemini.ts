import { GoogleGenAI } from '@google/genai';

const getClient = () => {
  const key = (process.env.GEMINI_API_KEY as string) || '';
  if (!key) throw new Error('GEMINI_API_KEY is not configured. Add it to your Secrets.');
  return new GoogleGenAI({ apiKey: key });
};

async function ask(prompt: string): Promise<string> {
  const ai = getClient();
  const res = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  });
  return res.text ?? '';
}

function extractJson(raw: string): any {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in AI response');
  return JSON.parse(text.slice(start, end + 1));
}

/* ── Course fill ─────────────────────────────────────────────── */

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

/* ── Quiz questions ──────────────────────────────────────────── */

export interface AIQuestion {
  type: 'multiple-choice' | 'true-false' | 'open-text';
  text: string;
  options: { id: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  points: number;
}

export async function generateQuizQuestions(topic: string, count: number = 5): Promise<AIQuestion[]> {
  const prompt = `You are an educational quiz creator. Generate ${count} quiz questions about:
"${topic}"

Return ONLY a valid JSON object:
{
  "questions": [
    {
      "type": "multiple-choice",
      "text": "The question text",
      "options": [
        {"id": "1", "text": "Option A"},
        {"id": "2", "text": "Option B"},
        {"id": "3", "text": "Option C"},
        {"id": "4", "text": "Option D"}
      ],
      "correctAnswer": "1",
      "explanation": "Why this is correct",
      "points": 1
    }
  ]
}

Mix question types: mostly multiple-choice, 1-2 true-false. For true-false use options [{"id":"1","text":"True"},{"id":"2","text":"False"}].
Return ONLY the JSON object.`;

  const raw = await ask(prompt);
  const data = extractJson(raw);
  const questions: AIQuestion[] = [];

  for (const q of data.questions || []) {
    questions.push({
      type: q.type === 'true-false' ? 'true-false' : q.type === 'open-text' ? 'open-text' : 'multiple-choice',
      text: String(q.text || ''),
      options: Array.isArray(q.options)
        ? q.options.map((o: any) => ({ id: String(o.id), text: String(o.text) }))
        : [],
      correctAnswer: String(q.correctAnswer || ''),
      explanation: String(q.explanation || ''),
      points: Number(q.points) || 1,
    });
  }
  return questions;
}

/* ── Generic page assistant ──────────────────────────────────── */

export async function askPageAssistant(context: string, userMessage: string): Promise<string> {
  const prompt = `You are a helpful AI assistant embedded in an educational platform teacher portal.
Context: ${context}
Teacher's request: "${userMessage}"

Give a concise, helpful response (max 3 sentences). Be practical and specific.`;
  return ask(prompt);
}

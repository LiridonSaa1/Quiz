export type UserRole = 'admin' | 'teacher' | 'student';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  teacherId?: string; // For students
  status?: 'active' | 'inactive';
  createdAt: string;
}

export interface Teacher {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  specialization?: string;
  experienceYears?: number;
  qualification?: string;
  status: 'active' | 'inactive';
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  profilePhoto?: string;
  preferredLanguage: string;
  currentLevel?: string;
  status: 'active' | 'inactive';
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  title: string;
  name?: string; // Some pages use name
  slug: string;
  description?: string;
  shortDescription?: string;
  language: string;
  level?: string;
  teacherId?: string;
  studentIds?: string[]; // Some pages use studentIds
  thumbnail?: string;
  price: number;
  isFree: boolean;
  status: 'draft' | 'published';
  totalLessons: number;
  totalStudents: number;
  certificateEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Module {
  id: string;
  courseId: string;
  title: string;
  slug: string;
  description?: string;
  order: number;
  status: string;
  totalLessons: number;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  slug: string;
  shortDescription?: string;
  type: 'video' | 'text' | 'quiz';
  durationMinutes: number;
  order: number;
  status: string;
  isFreePreview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LessonContent {
  id: string;
  lessonId: string;
  contentType: string;
  title?: string;
  content?: string;
  fileUrl?: string;
  order: number;
}

export interface Quiz {
  id: string;
  courseId: string;
  teacherId?: string; // Some pages use teacherId
  lessonId?: string;
  title: string;
  description?: string;
  type: string;
  timeLimit: number;
  totalMarks: number;
  passMark: number;
  maxAttempts: number;
  status: string;
  published?: boolean; // Some pages use published
  settings?: any; // Some pages use settings
  createdAt: string;
  updatedAt: string;
}

export type QuestionType = 'multiple-choice' | 'true-false' | 'short-answer' | 'long-answer' | 'file-upload';

export interface Question {
  id: string;
  quizId: string;
  type: string;
  text?: string; // Some pages use text
  questionText: string;
  mediaUrl?: string;
  mediaType?: string; // Some pages use mediaType
  readingPassage?: string; // Some pages use readingPassage
  options?: any; // Some pages use options
  correctAnswer?: any; // Some pages use correctAnswer
  explanation?: any; // Some pages use explanation
  points: number;
  order: number;
  orderIndex?: number; // Some pages use orderIndex
}

export interface Answer {
  id: string;
  questionId: string;
  answerText: string;
  isCorrect: boolean;
}

export interface CourseStudent {
  id: string;
  courseId: string;
  studentId: string;
  progress: number;
  enrolledAt: string;
  completedAt?: string;
}

export interface QuizAttempt {
  id: string;
  studentId: string;
  quizId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  status: string;
  startedAt: string;
  completedAt: string;
}

export interface LessonProgress {
  id: string;
  lessonId: string;
  studentId: string;
  progressPercent: number;
  status: string;
  completedAt?: string;
}

export interface Certificate {
  id: string;
  studentId: string;
  courseId: string;
  score: number;
  issuedAt: string;
  certificateUrl: string;
}

export interface Discussion {
  id: string;
  courseId: string;
  userId: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  discussionId: string;
  userId: string;
  message: string;
  parentId?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  type: string;
  message: string;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

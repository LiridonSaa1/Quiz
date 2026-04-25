-- Lesson content and progress foundation tables
create extension if not exists pgcrypto;

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  short_description text null,
  course_id uuid null,
  module_id uuid null,
  type text not null default 'video',
  duration_minutes integer not null default 0,
  status text not null default 'published',
  is_free_preview boolean not null default false,
  slug text null,
  "order" integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_contents (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  type text not null check (type in ('video', 'audio', 'pdf', 'text')),
  title text null,
  description text null,
  storage_path text null,
  mime_type text null,
  size_bytes bigint null,
  text_content text null,
  pdf_page integer null,
  duration_seconds integer null,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lesson_contents_lesson_id on public.lesson_contents (lesson_id);
create index if not exists idx_lesson_contents_position on public.lesson_contents (lesson_id, position);

create table if not exists public.lesson_progress (
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed boolean not null default false,
  last_video_position numeric not null default 0,
  last_opened_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

create index if not exists idx_lesson_progress_lesson on public.lesson_progress (lesson_id);
create index if not exists idx_lesson_progress_student on public.lesson_progress (student_id);

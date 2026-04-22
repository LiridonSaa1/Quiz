-- Lesson-only discussion system (questions, answers, replies, reactions, moderation, reputation)

create table if not exists public.lesson_discussion_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  best_answer_id uuid null,
  answers_count integer not null default 0,
  reactions_count integer not null default 0,
  helpful_score integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.lesson_discussion_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.lesson_discussion_questions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  is_best boolean not null default false,
  replies_count integer not null default 0,
  reactions_count integer not null default 0,
  helpful_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.lesson_discussion_replies (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.lesson_discussion_answers(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_reply_id uuid null references public.lesson_discussion_replies(id) on delete cascade,
  body text not null,
  depth smallint not null default 0 check (depth >= 0 and depth <= 3),
  reactions_count integer not null default 0,
  helpful_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists public.lesson_discussion_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('question', 'answer', 'reply')),
  target_id uuid not null,
  reaction_type text not null check (reaction_type in ('like', 'helpful')),
  created_at timestamptz not null default now(),
  unique(user_id, target_type, target_id, reaction_type)
);

create table if not exists public.lesson_discussion_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('question', 'answer', 'reply')),
  target_id uuid not null,
  reason text not null,
  details text null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discussion_user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reputation integer not null default 0,
  answers_count integer not null default 0,
  best_answers_count integer not null default 0,
  helpful_reactions_received integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discussion_badges (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text not null,
  threshold integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.discussion_user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.discussion_badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create table if not exists public.discussion_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('question', 'answer', 'reply', 'report')),
  target_id uuid not null,
  action_type text not null check (action_type in ('delete', 'restore', 'lock', 'unlock', 'dismiss_report', 'resolve_report')),
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ldq_lesson_recent on public.lesson_discussion_questions (lesson_id, created_at desc);
create index if not exists idx_ldq_lesson_activity on public.lesson_discussion_questions (lesson_id, last_activity_at desc);
create index if not exists idx_ldq_lesson_helpful on public.lesson_discussion_questions (lesson_id, helpful_score desc);
create index if not exists idx_lda_question on public.lesson_discussion_answers (question_id, created_at asc);
create index if not exists idx_ldr_answer on public.lesson_discussion_replies (answer_id, created_at asc);
create index if not exists idx_reports_status on public.lesson_discussion_reports (status, created_at desc);

alter table public.lesson_discussion_questions
  add column if not exists best_answer_id uuid null;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'lesson_discussion_questions'
      and constraint_name = 'fk_lesson_discussion_best_answer'
  ) then
    alter table public.lesson_discussion_questions
      add constraint fk_lesson_discussion_best_answer
      foreign key (best_answer_id) references public.lesson_discussion_answers(id) on delete set null;
  end if;
end $$;

insert into public.discussion_badges (key, label, description, threshold)
values
  ('first_answer', 'First Answer', 'Posted your first answer', 1),
  ('helpful_contributor', 'Helpful Contributor', 'Received helpful reactions', 10),
  ('mentor', 'Mentor', 'Got multiple best answers', 5)
on conflict (key) do nothing;

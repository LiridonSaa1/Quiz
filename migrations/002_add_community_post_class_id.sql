ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_community_posts_class_id
  ON public.community_posts(class_id);

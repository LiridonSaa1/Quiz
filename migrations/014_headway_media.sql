-- Migration 014: headway_media — Drive-imported audio/video per level+unit

CREATE TABLE IF NOT EXISTS headway_media (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  level        TEXT        NOT NULL DEFAULT 'Beginner',
  unit_number  INTEGER,
  module_id    UUID        REFERENCES modules(id)  ON DELETE SET NULL,
  lesson_id    UUID        REFERENCES lessons(id)  ON DELETE SET NULL,
  type         TEXT        NOT NULL CHECK (type IN ('student_audio', 'workbook_audio', 'video')),
  title        TEXT,
  file_name    TEXT,
  drive_file_id TEXT       UNIQUE NOT NULL,
  url          TEXT,
  mime_type    TEXT,
  size_bytes   BIGINT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_headway_media_level_unit
  ON headway_media (level, unit_number);

CREATE INDEX IF NOT EXISTS idx_headway_media_lesson
  ON headway_media (lesson_id)
  WHERE lesson_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_headway_media_type
  ON headway_media (type);

CREATE INDEX IF NOT EXISTS idx_headway_media_drive_id
  ON headway_media (drive_file_id);

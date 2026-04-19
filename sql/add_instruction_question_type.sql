-- Add display-only "instruction" text blocks to quizzes (no student answer / 0 points).
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN (
  'multiple-choice', 'true-false', 'open-text', 'fill-in-the-blank', 'matching', 'ordering',
  'image', 'video', 'reading', 'instruction'
));

-- Story 3.1: a short human-readable number so an admin can name a question as "Q 1234". Alters only question.
-- Existing (seeded) rows are backfilled by the identity; a number is never reused.
ALTER TABLE question ADD COLUMN display_no bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE question ADD CONSTRAINT question_display_no_key UNIQUE (display_no);

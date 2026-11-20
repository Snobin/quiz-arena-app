-- Story 3.2: the question editor. Alters only question and question_version.
-- Actor columns are null for seeded rows (shown as "seed"). Actors are core app_user ids, not enforced by a foreign key.
ALTER TABLE question ADD COLUMN created_by uuid;
ALTER TABLE question ADD COLUMN deleted_by uuid;

ALTER TABLE question_version ADD COLUMN created_by uuid;
ALTER TABLE question_version ADD COLUMN updated_at timestamptz;
ALTER TABLE question_version ADD COLUMN updated_by uuid;
-- Optimistic lock for an in-place draft save.
ALTER TABLE question_version ADD COLUMN row_version integer NOT NULL DEFAULT 0;

-- At most one open draft per question.
CREATE UNIQUE INDEX question_version_one_draft_key ON question_version (question_id) WHERE status = 'DRAFT';

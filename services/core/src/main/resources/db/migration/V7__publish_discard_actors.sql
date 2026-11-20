-- Story 3.4: the draft review queue. Alters only question_version.
-- Actors are core app_user ids, not enforced by a foreign key. Seeded published versions keep null actors (shown as "seed").
ALTER TABLE question_version ADD COLUMN published_by uuid;
ALTER TABLE question_version ADD COLUMN published_at timestamptz;
ALTER TABLE question_version ADD COLUMN discarded_by uuid;
ALTER TABLE question_version ADD COLUMN discarded_at timestamptz;

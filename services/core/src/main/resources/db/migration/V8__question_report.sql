-- Story 3.5: players report a wrong question. Adds only question_report, in the core schema.
-- reporter_id is a core app_user id, not enforced by a foreign key (accounts are soft-deleted; reports are never deleted).
CREATE TABLE question_report (
    id                uuid        PRIMARY KEY,
    question_id       uuid        NOT NULL,
    version           integer     NOT NULL,
    reporter_id       uuid        NOT NULL,
    note              text        CHECK (note IS NULL OR char_length(note) <= 500),
    surface           text        NOT NULL CHECK (surface IN ('LIVE_REVEAL', 'RESULTS', 'SOLO')),
    match_id          text,
    status            text        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED_FIXED', 'DISMISSED')),
    created_at        timestamptz NOT NULL,
    resolved_at       timestamptz,
    resolved_by       uuid,
    resolution_note   text,
    fixed_by_version  integer,
    CONSTRAINT question_report_version_fk FOREIGN KEY (question_id, version) REFERENCES question_version (question_id, version)
);

-- A player has at most one OPEN report per question version; once it is closed she can report again.
CREATE UNIQUE INDEX question_report_open_key ON question_report (reporter_id, question_id, version) WHERE status = 'OPEN';
CREATE INDEX question_report_version_idx ON question_report (question_id, version);

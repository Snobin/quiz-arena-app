-- Story 1.4: the question bank (AD-12). core schema only (AD-3); ids are generated in Java.

CREATE TABLE subject (
    id         uuid        PRIMARY KEY,
    name       text        NOT NULL CHECK (btrim(name) <> ''),
    created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX subject_name_key ON subject (lower(name));

CREATE TABLE topic (
    id         uuid        PRIMARY KEY,
    subject_id uuid        NOT NULL REFERENCES subject (id),
    name       text        NOT NULL CHECK (btrim(name) <> ''),
    created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX topic_subject_name_key ON topic (subject_id, lower(name));

CREATE TABLE question (
    id         uuid        PRIMARY KEY,
    source_ref text,
    created_at timestamptz NOT NULL,
    -- Soft delete: null = live.
    deleted_at timestamptz
);
CREATE UNIQUE INDEX question_source_ref_key ON question (source_ref) WHERE source_ref IS NOT NULL;

-- A PUBLISHED version is immutable: a change is a new version (enforced in the domain and by the
-- repository's draft-only update).
CREATE TABLE question_version (
    id               uuid        PRIMARY KEY,
    question_id      uuid        NOT NULL REFERENCES question (id),
    version          integer     NOT NULL CHECK (version >= 1),
    status           text        NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'DISCARDED')),
    content_category text        NOT NULL CHECK (content_category IN ('KERALA_PSC', 'SCHOOL_QUIZ', 'GENERAL_KERALA')),
    subject_id       uuid        NOT NULL REFERENCES subject (id),
    topic_id         uuid        NOT NULL REFERENCES topic (id),
    exam_level       text        NOT NULL CHECK (exam_level IN ('TENTH', 'DEGREE', 'OTHER')),
    difficulty       text        NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    text_ml          text,
    text_en          text,
    options          text[]      NOT NULL CHECK (cardinality(options) = 4 AND array_position(options, NULL) IS NULL
                                                 AND btrim(options[1]) <> '' AND btrim(options[2]) <> ''
                                                 AND btrim(options[3]) <> '' AND btrim(options[4]) <> ''),
    answer_index     smallint    NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
    explanation      text        NOT NULL CHECK (btrim(explanation) <> ''),
    attribution      text,
    reviewed_by      text,
    reviewed_at      timestamptz,
    created_at       timestamptz NOT NULL,
    CONSTRAINT question_version_text_present CHECK (text_ml IS NOT NULL OR text_en IS NOT NULL),
    -- Only an admin-reviewed version may be published.
    CONSTRAINT question_version_published_reviewed CHECK (status <> 'PUBLISHED' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
    CONSTRAINT question_version_question_version_key UNIQUE (question_id, version)
);

-- The draw: latest PUBLISHED version per question.
CREATE INDEX question_version_published_idx ON question_version (question_id, version DESC) WHERE status = 'PUBLISHED';

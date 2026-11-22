-- Story 6.1: a registered player's private custom topics. Adds only custom_topic and custom_question, in the core schema.
-- Neither table is read by the bank catalogue, the admin console or the bank branch of /internal/question-sets.
CREATE TABLE custom_topic (
    id             uuid        PRIMARY KEY,
    owner_user_id  uuid        NOT NULL REFERENCES app_user (id),
    name           text        NOT NULL,
    name_key       text        NOT NULL,
    question_count integer     NOT NULL,
    revision       integer     NOT NULL DEFAULT 1,
    created_at     timestamptz NOT NULL,
    updated_at     timestamptz NOT NULL,
    CONSTRAINT custom_topic_owner_name_key UNIQUE (owner_user_id, name_key)
);

CREATE INDEX custom_topic_owner_idx ON custom_topic (owner_user_id);

CREATE TABLE custom_question (
    id              uuid     PRIMARY KEY,
    custom_topic_id uuid     NOT NULL REFERENCES custom_topic (id) ON DELETE CASCADE,
    position        integer  NOT NULL,
    text            text     NOT NULL,
    lang            text     NOT NULL CHECK (lang IN ('ml', 'en')),
    option_a        text     NOT NULL,
    option_b        text     NOT NULL,
    option_c        text     NOT NULL,
    option_d        text     NOT NULL,
    answer_index    smallint NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
    explanation     text     NOT NULL,
    CONSTRAINT custom_question_topic_position UNIQUE (custom_topic_id, position)
);

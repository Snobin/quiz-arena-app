-- Story 2.3: the player's profile and the transactional outbox (AD-15, AD-16).
CREATE TABLE user_profile (
    user_id      uuid        PRIMARY KEY REFERENCES app_user (id),
    display_name text        NOT NULL,
    district     text        NOT NULL,
    exam_level   text        NOT NULL CHECK (exam_level IN ('TENTH', 'DEGREE', 'OTHER')),
    language     text        NOT NULL CHECK (language IN ('ml', 'en')),
    updated_at   timestamptz NOT NULL
);

-- An event is written in the same transaction as the change it describes; a relay publishes it later.
CREATE TABLE event_outbox (
    id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stream       text        NOT NULL,
    payload      jsonb       NOT NULL,
    created_at   timestamptz NOT NULL,
    published_at timestamptz,
    attempts     integer     NOT NULL DEFAULT 0
);
CREATE INDEX event_outbox_unpublished_idx ON event_outbox (id) WHERE published_at IS NULL;

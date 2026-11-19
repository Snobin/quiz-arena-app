-- Story 2.5: ratings-service's own schema (AD-3): no foreign keys to other schemas, and nothing here is ever
-- stored for a guest or a bot.
CREATE TABLE rating (
    user_id       uuid        NOT NULL,
    mode          text        NOT NULL CHECK (mode IN ('QUICK', 'TOPIC_DUEL', 'BATTLE_ROOM')),
    rating        integer     NOT NULL,
    matches_rated integer     NOT NULL DEFAULT 0,
    updated_at    timestamptz NOT NULL,
    PRIMARY KEY (user_id, mode)
);

CREATE TABLE rating_event (
    id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id      uuid        NOT NULL,
    match_id      uuid        NOT NULL,
    user_id       uuid        NOT NULL,
    mode          text        NOT NULL CHECK (mode IN ('QUICK', 'TOPIC_DUEL', 'BATTLE_ROOM')),
    rating_before integer     NOT NULL,
    rating_after  integer     NOT NULL,
    delta         integer     NOT NULL,
    ended_at      timestamptz NOT NULL,
    UNIQUE (match_id, user_id)
);

CREATE TABLE match_record (
    match_id      uuid        NOT NULL,
    user_id       uuid        NOT NULL,
    mode          text        NOT NULL CHECK (mode IN ('QUICK', 'TOPIC_DUEL', 'BATTLE_ROOM')),
    placement     integer     NOT NULL,
    result        text        NOT NULL CHECK (result IN ('WIN', 'LOSS', 'DRAW')),
    score         integer     NOT NULL,
    correct_count integer     NOT NULL,
    forfeited     boolean     NOT NULL,
    rated         boolean     NOT NULL,
    rating_delta  integer,
    ended_at      timestamptz NOT NULL,
    PRIMARY KEY (match_id, user_id)
);
CREATE INDEX match_record_user_ended_idx ON match_record (user_id, ended_at DESC);

CREATE TABLE player_directory (
    user_id       uuid        PRIMARY KEY,
    display_name  text        NOT NULL,
    district      text        NOT NULL,
    exam_level    text        NOT NULL,
    language      text        NOT NULL,
    updated_at    timestamptz NOT NULL,
    tombstoned_at timestamptz
);

CREATE TABLE event_outbox (
    id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stream       text        NOT NULL,
    payload      jsonb       NOT NULL,
    created_at   timestamptz NOT NULL,
    published_at timestamptz,
    attempts     integer     NOT NULL DEFAULT 0
);
CREATE INDEX event_outbox_unpublished_idx ON event_outbox (id) WHERE published_at IS NULL;

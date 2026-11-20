-- Story 4.1: the topics a player used recently, so the picker can offer them again. Adds only recent_topic, in the core schema.
-- user_id is a core app_user id, not enforced by a foreign key (accounts are soft-deleted; rows are removed with the account).
CREATE TABLE recent_topic (
    user_id      uuid        NOT NULL,
    topic_id     uuid        NOT NULL REFERENCES topic (id),
    last_used_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, topic_id)
);

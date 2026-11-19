-- Story 2.1: accounts and sessions (AD-3, AD-9). core schema only.
-- email holds the Google address only when Google marked it verified, so the ADMIN check at every
-- token issue can trust it; given_name feeds the access token's `name` until a profile exists (2.3).
CREATE TABLE app_user (
    id              uuid        PRIMARY KEY,
    status          text        NOT NULL CHECK (status IN ('ACTIVE', 'DELETED')),
    email           text,
    given_name      text,
    created_at      timestamptz NOT NULL,
    last_sign_in_at timestamptz NOT NULL
);

CREATE TABLE user_identity (
    provider         text        NOT NULL CHECK (btrim(provider) <> ''),
    provider_subject text        NOT NULL CHECK (btrim(provider_subject) <> ''),
    user_id          uuid        NOT NULL REFERENCES app_user (id),
    created_at       timestamptz NOT NULL,
    PRIMARY KEY (provider, provider_subject)
);
CREATE INDEX user_identity_user_id_idx ON user_identity (user_id);

-- Only the SHA-256 hash of a refresh token is stored, never the token itself.
CREATE TABLE refresh_token (
    id         uuid        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES app_user (id),
    token_hash text        NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
);
CREATE INDEX refresh_token_user_id_idx ON refresh_token (user_id);

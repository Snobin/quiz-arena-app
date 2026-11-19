-- Story 2.2: refresh-token rotation. Every token belongs to a family; a rotated token keeps its row
-- (rotated_at) so a replay is detected as reuse, and a revoked family (revoked_at) is dead for good.
ALTER TABLE refresh_token
    ADD COLUMN family_id  uuid,
    ADD COLUMN rotated_at timestamptz,
    ADD COLUMN revoked_at timestamptz;

-- Each existing token becomes its own family.
UPDATE refresh_token SET family_id = gen_random_uuid();

ALTER TABLE refresh_token ALTER COLUMN family_id SET NOT NULL;
CREATE INDEX refresh_token_family_id_idx ON refresh_token (family_id);

-- Mirrors deploy/postgres/init: the app login owns schema ratings and uses it by default.
CREATE SCHEMA ratings;
ALTER ROLE CURRENT_USER SET search_path = ratings;

-- Mirrors deploy/postgres/init: the app login owns schema core and uses it by default.
CREATE SCHEMA core;
ALTER ROLE CURRENT_USER SET search_path = core;

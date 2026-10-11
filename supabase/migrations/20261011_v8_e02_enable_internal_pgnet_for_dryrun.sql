-- Enable internal HTTP transport only, for free-only rehearsal.
-- No external provider endpoints appear in this migration.
create extension if not exists pg_net;

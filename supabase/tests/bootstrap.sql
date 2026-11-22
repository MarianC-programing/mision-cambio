-- Prepara un Postgres vacío para imitar lo mínimo de Supabase (solo para pruebas locales).
create role anon nologin;
create role authenticated nologin;
create schema extensions;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated;

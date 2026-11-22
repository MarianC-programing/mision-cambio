-- =====================================================================
-- MISIÓN: CAMBIO · Esquema completo de Supabase
-- =====================================================================
-- Cómo usarlo: Supabase Dashboard > SQL Editor > New query > pegar > Run.
-- Es idempotente: se puede ejecutar más de una vez sin duplicar datos.
--
-- Modelo de seguridad
--   * El navegador solo usa la clave pública (anon). Ninguna tabla sensible
--     tiene políticas de lectura/escritura: todo pasa por funciones RPC
--     (SECURITY DEFINER) que validan en el servidor.
--   * Las respuestas correctas viven en `questions` (sin acceso público).
--     Al teléfono solo llega la pregunta sin la solución; la solución se
--     publica en `games.reveal` cuando el administrador la muestra.
--   * Solo `games` y `players` son legibles (necesarios para Realtime).
--     El token secreto de cada jugador está en `player_secrets` (sin acceso).
--   * El administrador se identifica con un PIN guardado como hash bcrypt.
--
-- ⚠️ CAMBIA EL PIN antes de la exposición (ver el final de este archivo).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  pos           int  not null unique check (pos between 0 and 9),
  model         text not null,
  prompt        text not null,
  options       jsonb not null,
  correct_index int  not null check (correct_index between 0 and 3),
  explanation   text not null default '',
  updated_at    timestamptz not null default now(),
  constraint questions_four_options
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4)
);

create table if not exists public.games (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  status              text not null default 'lobby'
                      check (status in ('lobby','question','paused','reveal','finished')),
  q_index             int  not null default -1,
  q_total             int  not null,
  duration_ms         int  not null default 30000,
  ends_at             timestamptz,
  paused_remaining_ms int,
  current_question    jsonb,
  reveal              jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.players (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 24),
  score          int  not null default 0,
  correct_count  int  not null default 0,
  total_time_ms  bigint not null default 0,
  answers_count  int  not null default 0,
  last_answer_at timestamptz,
  created_at     timestamptz not null default now()
);
create unique index if not exists players_game_name_uq
  on public.players (game_id, lower(name));

create table if not exists public.player_secrets (
  player_id uuid primary key references public.players(id) on delete cascade,
  token     uuid not null default gen_random_uuid()
);

create table if not exists public.answers (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  question_id   uuid not null references public.questions(id) on delete cascade,
  question_pos  int  not null,
  choice        int  not null check (choice between 0 and 3),
  is_correct    boolean not null,
  elapsed_ms    int  not null,
  points        int  not null,
  created_at    timestamptz not null default now(),
  unique (player_id, question_pos)   -- una sola respuesta por pregunta
);
create index if not exists answers_game_idx on public.answers (game_id, question_pos);

-- ---------------------------------------------------------------------
-- 2. RLS (Row Level Security)
-- ---------------------------------------------------------------------

alter table public.app_config     enable row level security;
alter table public.questions      enable row level security;
alter table public.games          enable row level security;
alter table public.players        enable row level security;
alter table public.player_secrets enable row level security;
alter table public.answers        enable row level security;

-- Lectura pública SOLO de partidas y jugadores (no contienen secretos).
drop policy if exists games_public_read   on public.games;
drop policy if exists players_public_read on public.players;
create policy games_public_read   on public.games   for select to anon, authenticated using (true);
create policy players_public_read on public.players for select to anon, authenticated using (true);

-- Sin políticas en app_config, questions, player_secrets y answers:
-- con RLS activo nadie puede leerlas ni escribirlas desde la API.
-- Se refuerza quitando también los privilegios de tabla.
revoke all on public.app_config, public.questions, public.player_secrets, public.answers
  from anon, authenticated;
revoke all on public.games, public.players from anon, authenticated;
grant select on public.games, public.players to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. REALTIME
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games') then
      alter publication supabase_realtime add table public.games;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players') then
      alter publication supabase_realtime add table public.players;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. FUNCIONES INTERNAS (no expuestas a la API)
-- ---------------------------------------------------------------------

create or replace function public._assert_admin(p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare h text;
begin
  select value into h from public.app_config where key = 'admin_pin_hash';
  if h is null or p_pin is null or extensions.crypt(p_pin, h) <> h then
    perform pg_sleep(0.4);                       -- frena la fuerza bruta
    raise exception 'unauthorized' using errcode = '28000';
  end if;
end $$;

create or replace function public._start_question(p_game uuid, p_idx int)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare q public.questions;
begin
  select * into q from public.questions where pos = p_idx;
  if not found then raise exception 'questions_incomplete'; end if;
  update public.games set
    status = 'question',
    q_index = p_idx,
    current_question = jsonb_build_object(
      'index', q.pos, 'model', q.model, 'prompt', q.prompt, 'options', q.options),
    reveal = null,
    paused_remaining_ms = null,
    ends_at = clock_timestamp() + duration_ms * interval '1 millisecond',
    updated_at = clock_timestamp()
  where id = p_game;
end $$;

create or replace function public._recompute_scores(p_game uuid)
returns void
language sql security definer set search_path = public, extensions, pg_temp
as $$
  update public.players p set
    score = coalesce((select sum(a.points) from public.answers a where a.player_id = p.id), 0),
    correct_count = coalesce((select count(*) from public.answers a
                              where a.player_id = p.id and a.is_correct), 0),
    total_time_ms = coalesce((select sum(a.elapsed_ms) from public.answers a
                              where a.player_id = p.id and a.is_correct), 0)
  where p.game_id = p_game;
$$;

-- ---------------------------------------------------------------------
-- 5. FUNCIONES PÚBLICAS (participantes)
-- ---------------------------------------------------------------------

create or replace function public.server_time()
returns timestamptz
language sql stable
as $$ select clock_timestamp(); $$;

create or replace function public.join_game(p_code text, p_name text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  g public.games;
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  pid uuid;
  tok uuid;
begin
  if char_length(nm) < 1 or char_length(nm) > 24 then raise exception 'invalid_name'; end if;
  select * into g from public.games where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'game_not_found'; end if;
  if g.status = 'finished' then raise exception 'game_finished'; end if;
  if (select count(*) from public.players where game_id = g.id) >= 300 then
    raise exception 'game_full';
  end if;
  begin
    insert into public.players (game_id, name) values (g.id, nm) returning id into pid;
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  insert into public.player_secrets (player_id) values (pid) returning token into tok;
  return jsonb_build_object('player_id', pid, 'token', tok, 'game_id', g.id, 'code', g.code);
end $$;

create or replace function public.submit_answer(p_player uuid, p_token uuid, p_pos int, p_choice int)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  pl public.players;
  g  public.games;
  q  public.questions;
  remaining_ms numeric;
  el int;
  ok boolean;
  pts int;
begin
  select * into pl from public.players where id = p_player;
  if not found then raise exception 'unauthorized'; end if;
  perform 1 from public.player_secrets where player_id = p_player and token = p_token;
  if not found then raise exception 'unauthorized'; end if;

  -- FOR SHARE: si el administrador revela/pausa a la vez, uno espera al otro.
  select * into g from public.games where id = pl.game_id for share;
  if g.status <> 'question' then raise exception 'closed'; end if;
  if g.q_index <> p_pos then raise exception 'stale_question'; end if;
  if clock_timestamp() > g.ends_at + interval '300 milliseconds' then
    raise exception 'closed';                    -- 300 ms de margen por latencia de red
  end if;
  if p_choice is null or p_choice not between 0 and 3 then raise exception 'invalid_choice'; end if;

  select * into q from public.questions where pos = g.q_index;
  remaining_ms := extract(epoch from (g.ends_at - clock_timestamp())) * 1000;
  el  := least(g.duration_ms, greatest(0, g.duration_ms - remaining_ms))::int;
  ok  := (p_choice = q.correct_index);
  pts := case when ok then 100 + round(50 * (1 - el::numeric / g.duration_ms))::int else 0 end;

  insert into public.answers (game_id, player_id, question_id, question_pos, choice, is_correct, elapsed_ms, points)
  values (g.id, p_player, q.id, g.q_index, p_choice, ok, el, pts)
  on conflict (player_id, question_pos) do nothing;
  if not found then raise exception 'already_answered'; end if;

  update public.players set answers_count = answers_count + 1, last_answer_at = clock_timestamp()
  where id = p_player;

  return jsonb_build_object('ok', true);          -- nunca revela si fue correcta
end $$;

create or replace function public.my_answers(p_player uuid, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games; res jsonb;
begin
  perform 1 from public.player_secrets where player_id = p_player and token = p_token;
  if not found then raise exception 'unauthorized'; end if;
  select g2.* into g from public.games g2 join public.players p on p.game_id = g2.id where p.id = p_player;

  select coalesce(jsonb_agg(jsonb_build_object(
      'question_pos', a.question_pos,
      'choice', a.choice,
      'is_correct', case when rv then a.is_correct end,
      'points',     case when rv then a.points end,
      'elapsed_ms', case when rv then a.elapsed_ms end
    ) order by a.question_pos), '[]'::jsonb)
  into res
  from (
    select a0.*, (g.status = 'finished'
                  or a0.question_pos < g.q_index
                  or (a0.question_pos = g.q_index and g.status = 'reveal')) as rv
    from public.answers a0 where a0.player_id = p_player
  ) a;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- 6. FUNCIONES DE ADMINISTRADOR (requieren PIN)
-- ---------------------------------------------------------------------

create or replace function public.admin_questions(p_pin text)
returns setof public.questions
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
begin
  perform public._assert_admin(p_pin);
  return query select * from public.questions order by pos;
end $$;

create or replace function public.admin_save_question(
  p_pin text, p_id uuid, p_model text, p_prompt text,
  p_options jsonb, p_correct int, p_explanation text)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare qpos int; i int;
begin
  perform public._assert_admin(p_pin);
  select pos into qpos from public.questions where id = p_id;
  if not found then raise exception 'questions_incomplete'; end if;
  if exists (select 1 from public.games
             where status in ('question','paused') and q_index = qpos) then
    raise exception 'question_live';
  end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) <> 4 then
    raise exception 'invalid_choice';
  end if;
  for i in 0..3 loop
    if char_length(btrim(coalesce(p_options->>i, ''))) = 0 then raise exception 'invalid_choice'; end if;
  end loop;
  if char_length(btrim(coalesce(p_prompt, ''))) = 0 or p_correct not between 0 and 3 then
    raise exception 'invalid_choice';
  end if;
  update public.questions set
    model = btrim(p_model), prompt = btrim(p_prompt), options = p_options,
    correct_index = p_correct, explanation = btrim(coalesce(p_explanation, '')),
    updated_at = now()
  where id = p_id;
end $$;

create or replace function public.admin_create_game(p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text; n int; mx int; i int; g public.games;
begin
  perform public._assert_admin(p_pin);
  select count(*), coalesce(max(pos), -1) + 1 into n, mx from public.questions;
  if n = 0 or mx <> n then raise exception 'questions_incomplete'; end if;
  loop
    c := '';
    for i in 1..5 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.games where code = c);
  end loop;
  insert into public.games (code, q_total) values (c, n) returning * into g;
  return to_jsonb(g);
end $$;

create or replace function public.admin_latest_game(p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games order by created_at desc limit 1;
  if not found then return null; end if;
  return to_jsonb(g);
end $$;

create or replace function public.admin_snapshot(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game;
  if not found then raise exception 'game_not_found'; end if;
  return jsonb_build_object(
    'game', to_jsonb(g),
    'players', coalesce((select jsonb_agg(to_jsonb(p) order by p.score desc, p.total_time_ms, p.created_at)
                         from public.players p where p.game_id = g.id), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', a.id, 'player_id', a.player_id, 'player_name', p.name,
                  'question_pos', a.question_pos, 'choice', a.choice,
                  'is_correct', a.is_correct, 'elapsed_ms', a.elapsed_ms,
                  'points', a.points, 'created_at', a.created_at) order by a.created_at desc)
                from public.answers a join public.players p on p.id = a.player_id
                where a.game_id = g.id), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(to_jsonb(q) order by q.pos) from public.questions q), '[]'::jsonb),
    'server_time', clock_timestamp()
  );
end $$;

create or replace function public.admin_start(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status <> 'lobby' then raise exception 'invalid_state'; end if;
  if not exists (select 1 from public.players where game_id = g.id) then raise exception 'no_players'; end if;
  perform public._start_question(g.id, 0);
  select * into g from public.games where id = p_game;
  return to_jsonb(g);
end $$;

create or replace function public.admin_pause(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games; rem int;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status <> 'question' then raise exception 'invalid_state'; end if;
  rem := greatest(0, ceil(extract(epoch from (g.ends_at - clock_timestamp())) * 1000))::int;
  update public.games set status = 'paused', ends_at = null, paused_remaining_ms = rem,
    updated_at = clock_timestamp() where id = g.id returning * into g;
  return to_jsonb(g);
end $$;

create or replace function public.admin_resume(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status <> 'paused' then raise exception 'invalid_state'; end if;
  update public.games set status = 'question',
    ends_at = clock_timestamp() + coalesce(paused_remaining_ms, 0) * interval '1 millisecond',
    paused_remaining_ms = null, updated_at = clock_timestamp()
  where id = g.id returning * into g;
  return to_jsonb(g);
end $$;

create or replace function public.admin_reveal(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games; q public.questions; counts jsonb;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status not in ('question','paused') then raise exception 'invalid_state'; end if;
  select * into q from public.questions where pos = g.q_index;
  perform public._recompute_scores(g.id);
  select jsonb_agg(c order by i) into counts from (
    select s.i, count(a.id) as c
    from generate_series(0, 3) as s(i)
    left join public.answers a
      on a.game_id = g.id and a.question_pos = g.q_index and a.choice = s.i
    group by s.i) t;
  update public.games set status = 'reveal', ends_at = null, paused_remaining_ms = null,
    reveal = jsonb_build_object('correct_index', q.correct_index,
                                'explanation', q.explanation, 'counts', counts),
    updated_at = clock_timestamp()
  where id = g.id returning * into g;
  return to_jsonb(g);
end $$;

create or replace function public.admin_next(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status <> 'reveal' then raise exception 'invalid_state'; end if;
  if g.q_index + 1 < g.q_total then
    perform public._start_question(g.id, g.q_index + 1);
  else
    perform public._recompute_scores(g.id);
    update public.games set status = 'finished', ends_at = null, updated_at = clock_timestamp()
    where id = g.id;
  end if;
  select * into g from public.games where id = p_game;
  return to_jsonb(g);
end $$;

create or replace function public.admin_finish(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status = 'finished' then raise exception 'invalid_state'; end if;
  perform public._recompute_scores(g.id);
  update public.games set status = 'finished', ends_at = null, paused_remaining_ms = null,
    updated_at = clock_timestamp() where id = g.id returning * into g;
  return to_jsonb(g);
end $$;

create or replace function public.admin_remove_player(p_pin text, p_player uuid)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
begin
  perform public._assert_admin(p_pin);
  delete from public.players where id = p_player;
end $$;

-- ---------------------------------------------------------------------
-- 7. PERMISOS DE EJECUCIÓN
-- ---------------------------------------------------------------------

revoke execute on function
  public._assert_admin(text), public._start_question(uuid, int), public._recompute_scores(uuid)
  from public, anon, authenticated;

revoke execute on function
  public.server_time(), public.join_game(text, text),
  public.submit_answer(uuid, uuid, int, int), public.my_answers(uuid, uuid),
  public.admin_questions(text),
  public.admin_save_question(text, uuid, text, text, jsonb, int, text),
  public.admin_create_game(text), public.admin_latest_game(text),
  public.admin_snapshot(text, uuid), public.admin_start(text, uuid),
  public.admin_pause(text, uuid), public.admin_resume(text, uuid),
  public.admin_reveal(text, uuid), public.admin_next(text, uuid),
  public.admin_finish(text, uuid), public.admin_remove_player(text, uuid)
  from public;

grant execute on function
  public.server_time(), public.join_game(text, text),
  public.submit_answer(uuid, uuid, int, int), public.my_answers(uuid, uuid),
  public.admin_questions(text),
  public.admin_save_question(text, uuid, text, text, jsonb, int, text),
  public.admin_create_game(text), public.admin_latest_game(text),
  public.admin_snapshot(text, uuid), public.admin_start(text, uuid),
  public.admin_pause(text, uuid), public.admin_resume(text, uuid),
  public.admin_reveal(text, uuid), public.admin_next(text, uuid),
  public.admin_finish(text, uuid), public.admin_remove_player(text, uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. DATOS INICIALES
-- ---------------------------------------------------------------------

-- Preguntas de ejemplo: SIN contenido académico. Edítalas desde /admin > Preguntas.
insert into public.questions (pos, model, prompt, options, correct_index, explanation) values
 (0, 'Quick-Fix', '[EDITAR] Pregunta sobre el Modelo Quick-Fix',
   '["[EDITAR] Opción A","[EDITAR] Opción B","[EDITAR] Opción C","[EDITAR] Opción D"]', 0,
   '[EDITAR] Explicación de la respuesta correcta.'),
 (1, 'Boehm', '[EDITAR] Pregunta sobre el Modelo de Boehm',
   '["[EDITAR] Opción A","[EDITAR] Opción B","[EDITAR] Opción C","[EDITAR] Opción D"]', 0,
   '[EDITAR] Explicación de la respuesta correcta.'),
 (2, 'Osborne', '[EDITAR] Pregunta sobre el Modelo de Osborne',
   '["[EDITAR] Opción A","[EDITAR] Opción B","[EDITAR] Opción C","[EDITAR] Opción D"]', 0,
   '[EDITAR] Explicación de la respuesta correcta.'),
 (3, 'Mejora iterativa', '[EDITAR] Pregunta sobre el Modelo de mejora iterativa',
   '["[EDITAR] Opción A","[EDITAR] Opción B","[EDITAR] Opción C","[EDITAR] Opción D"]', 0,
   '[EDITAR] Explicación de la respuesta correcta.'),
 (4, 'Orientado a la reutilización', '[EDITAR] Pregunta sobre el Modelo orientado a la reutilización',
   '["[EDITAR] Opción A","[EDITAR] Opción B","[EDITAR] Opción C","[EDITAR] Opción D"]', 0,
   '[EDITAR] Explicación de la respuesta correcta.')
on conflict (pos) do nothing;

-- PIN de administrador inicial. ⚠️ CÁMBIALO: sustituye 'MISION2026' por tu PIN
-- antes de ejecutar, o corre después:
--   update public.app_config set value = extensions.crypt('TU-NUEVO-PIN', extensions.gen_salt('bf'))
--   where key = 'admin_pin_hash';
insert into public.app_config (key, value)
values ('admin_pin_hash', extensions.crypt('MISION2026', extensions.gen_salt('bf')))
on conflict (key) do nothing;

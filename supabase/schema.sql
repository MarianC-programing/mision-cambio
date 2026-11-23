-- =====================================================================
-- MISIÓN: CAMBIO · Escape room grupal · Esquema completo de Supabase
-- =====================================================================
-- Cómo usarlo: Supabase Dashboard > SQL Editor > New query > pegar > Run.
-- Es idempotente: se puede ejecutar más de una vez sin duplicar datos y
-- también migra instalaciones anteriores (quiz individual / escape room v1).
--
-- Cómo se juega
--   1. El servidor reparte a los participantes al azar en 4 equipos.
--   2. 10 puertas (preguntas fáciles). El primer miembro que responde fija la
--      respuesta de todo el equipo. Si aciertan: llave. Si fallan o no
--      responden: un miembro al azar queda eliminado.
--   3. LA ÚLTIMA PUERTA (traición). Cada sobreviviente vota en secreto:
--        "share" = salimos todos   ·   "steal" = salgo yo solo
--        - Nadie traiciona        -> la puerta se sella: empiezan de CERO (pierden
--                                    todas las llaves) y juegan la RONDA DIFÍCIL.
--        - Traiciona UNO solo     -> sale ya y gana; el resto queda eliminado.
--        - Traicionan DOS o más   -> el servidor sortea UNA variante por partida y
--                                    la aplica a todos los equipos en disputa:
--                                      A duelo de traidores (pregunta de velocidad)
--                                      B segunda vuelta (se revela cuántos, no quiénes)
--                                      C acusación (cada uno señala a un sospechoso)
--                                    Quienes cooperaron pasan a la RONDA DIFÍCIL.
--        - Un único sobreviviente -> pasa directo a la RONDA DIFÍCIL.
--   4. RONDA DIFÍCIL (preguntas kind='hard', posiciones 11 en adelante, 25 s).
--      Cada acierto da una llave; cada error o silencio elimina a DOS miembros
--      al azar (o a uno si solo queda uno). El equipo que termina con al menos
--      un miembro vivo escapa.
--
-- Modelo de seguridad
--   * El navegador solo usa la clave pública (anon). Ninguna tabla sensible
--     tiene políticas de lectura/escritura: todo pasa por funciones RPC
--     (SECURITY DEFINER) que validan en el servidor.
--   * Las respuestas correctas viven en `questions` (sin acceso público).
--     Al teléfono solo llega la pregunta sin la solución; la solución se
--     publica en `games.reveal` cuando el administrador la muestra.
--   * Los votos de la traición (`finale_votes`) no son legibles: nadie los ve
--     hasta que el administrador cierra la votación.
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

-- kind = 'door'  -> una de las puertas normales (posiciones 0..n-1, contiguas)
-- kind = 'final' -> pregunta de velocidad del duelo de traidores (una sola, pos 10)
-- kind = 'hard'  -> preguntas de la ronda difícil (posiciones 11..10+n, contiguas)
create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  pos           int  not null unique check (pos between 0 and 19),
  kind          text not null default 'door' check (kind in ('door','final','hard')),
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
                      check (status in ('lobby','question','paused','reveal',
                                        'betrayal','betrayal_reveal','variant','variant_reveal',
                                        'trial','trial_reveal','finished')),
  q_index             int  not null default -1,
  q_total             int  not null,
  hard_total          int  not null default 5,   -- preguntas de la ronda difícil
  betrayal_variant    text check (betrayal_variant is null or betrayal_variant in ('A','B','C')),
  variant_round       int  not null default 1,   -- ronda de voto en curso (B suma rondas)
  duration_ms         int  not null default 25000,
  phase_ms            int,                       -- duración total de la fase con reloj en curso
  ends_at             timestamptz,
  paused_remaining_ms int,
  current_question    jsonb,
  reveal              jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 1b. EQUIPOS
-- ---------------------------------------------------------------------

-- outcome: null mientras juegan las puertas / vota la traición.
--   hard        -> está en la ronda difícil (o pasará a ella)
--   dispute     -> varios traidores: espera/juega la variante sorteada
--   escaped     -> terminó la ronda difícil con al menos un vivo: escapó
--   lone_winner -> un traidor salió solo (winner_player_id)
--   wiped       -> sin sobrevivientes
--   trap, reset -> obsoletos (prueba final de una pregunta); solo por compatibilidad
create table if not exists public.groups (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games(id) on delete cascade,
  color         text not null check (color in ('red','blue','green','yellow','purple','orange')),
  key_count     int  not null default 0,
  eliminated    boolean not null default false,
  outcome       text check (outcome in ('trap','escaped','lone_winner','reset','wiped','hard','dispute')),
  traitor_count int  not null default 0,   -- cuántos traicionaron (se revela en disputa)
  created_at    timestamptz not null default now()
);

create table if not exists public.players (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games(id) on delete cascade,
  group_id       uuid references public.groups(id) on delete set null,
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

-- Respuestas individuales del quiz original (ya no se usan en el escape room,
-- se conservan para no romper instalaciones anteriores).
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
  unique (player_id, question_pos)
);
create index if not exists answers_game_idx on public.answers (game_id, question_pos);

-- ---------------------------------------------------------------------
-- 1c. TABLAS DE EQUIPO
-- ---------------------------------------------------------------------

create table if not exists public.group_members (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  eliminated     boolean not null default false,
  eliminated_at  timestamptz,
  elimination_reason text,
  escaped        boolean not null default false,
  joined_at      timestamptz not null default now(),
  unique (group_id, player_id)
);
create unique index if not exists group_members_player_uq on public.group_members (player_id);

create table if not exists public.group_answers (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  question_pos  int  not null check (question_pos between 0 and 19),
  choice        int  not null check (choice between 0 and 3),
  answered_by   uuid references public.players(id) on delete set null,
  answered_at   timestamptz not null default now(),
  unique (group_id, question_pos)
);

create table if not exists public.group_keys (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  question_pos int not null check (question_pos between 0 and 19),
  color       text not null,
  earned_at   timestamptz not null default now(),
  unique (group_id, question_pos)
);

create table if not exists public.eliminations (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  question_pos    int  not null check (question_pos between 0 and 19),
  reason          text not null,
  eliminated_at   timestamptz not null default now()
);

-- Votos secretos de la última puerta. vote: share = salimos todos · steal = salgo yo solo.
-- auto = true cuando el jugador no votó a tiempo (cuenta como "share").
-- round: 1 es la votación original; la variante B añade las rondas 2 y 3.
create table if not exists public.finale_votes (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  vote       text not null check (vote in ('share','steal')),
  auto       boolean not null default false,
  round      int  not null default 1,
  voted_at   timestamptz not null default now(),
  constraint finale_votes_player_round_key unique (player_id, round)
);

-- Variante A (duelo de traidores): respuesta de velocidad de cada traidor.
create table if not exists public.duel_answers (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  choice      int  not null check (choice between 0 and 3),
  is_correct  boolean not null,
  answered_at timestamptz not null default clock_timestamp(),
  unique (player_id)
);

-- Variante C (acusación): a quién señala cada sobreviviente.
create table if not exists public.accusations (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  accuser_id  uuid not null references public.players(id) on delete cascade,
  suspect_id  uuid not null references public.players(id) on delete cascade,
  accused_at  timestamptz not null default clock_timestamp(),
  unique (accuser_id),
  check (accuser_id <> suspect_id)
);

-- ---------------------------------------------------------------------
-- 1d. MIGRACIONES (instalaciones creadas antes de esta versión). Idempotentes.
-- ---------------------------------------------------------------------

alter table public.questions     add column if not exists kind text not null default 'door';
alter table public.games         add column if not exists phase_ms int;
alter table public.groups        add column if not exists outcome text;
alter table public.groups        add column if not exists winner_player_id uuid references public.players(id) on delete set null;
alter table public.players       add column if not exists group_id uuid references public.groups(id) on delete set null;
alter table public.group_members add column if not exists escaped boolean not null default false;
alter table public.games alter column duration_ms set default 25000;

-- Expulsar a un jugador no debe fallar ni borrar la respuesta de su equipo.
alter table public.group_answers alter column answered_by drop not null;
alter table public.group_answers drop constraint if exists group_answers_answered_by_fkey;
alter table public.group_answers add  constraint group_answers_answered_by_fkey
  foreign key (answered_by) references public.players(id) on delete set null;
alter table public.eliminations drop constraint if exists eliminations_player_id_fkey;
alter table public.eliminations add  constraint eliminations_player_id_fkey
  foreign key (player_id) references public.players(id) on delete cascade;

alter table public.questions drop constraint if exists questions_pos_check;
alter table public.questions add  constraint questions_pos_check check (pos between 0 and 19);
alter table public.questions drop constraint if exists questions_kind_check;
alter table public.questions add  constraint questions_kind_check check (kind in ('door','final','hard'));

alter table public.games drop constraint if exists games_status_check;
alter table public.games add  constraint games_status_check
  check (status in ('lobby','question','paused','reveal','betrayal','betrayal_reveal','variant','variant_reveal',
                    'trial','trial_reveal','finished'));

alter table public.groups drop constraint if exists groups_outcome_check;
alter table public.groups add  constraint groups_outcome_check
  check (outcome in ('trap','escaped','lone_winner','reset','wiped','hard','dispute'));

-- Ronda difícil y variantes de la traición (instalaciones anteriores).
alter table public.games  add column if not exists hard_total int not null default 5;
alter table public.games  add column if not exists betrayal_variant text;
alter table public.games  add column if not exists variant_round int not null default 1;
alter table public.games drop constraint if exists games_variant_check;
alter table public.games add  constraint games_variant_check
  check (betrayal_variant is null or betrayal_variant in ('A','B','C'));
alter table public.groups add column if not exists traitor_count int not null default 0;
-- El voto pasa a ser único por jugador Y ronda (la variante B repite la votación).
alter table public.finale_votes add column if not exists round int not null default 1;
alter table public.finale_votes drop constraint if exists finale_votes_player_id_key;
alter table public.finale_votes drop constraint if exists finale_votes_player_round_key;
alter table public.finale_votes add  constraint finale_votes_player_round_key unique (player_id, round);

alter table public.group_answers drop constraint if exists group_answers_question_pos_check;
alter table public.group_answers add  constraint group_answers_question_pos_check check (question_pos between 0 and 19);
alter table public.group_keys drop constraint if exists group_keys_question_pos_check;
alter table public.group_keys add  constraint group_keys_question_pos_check check (question_pos between 0 and 19);
alter table public.eliminations drop constraint if exists eliminations_question_pos_check;
alter table public.eliminations add  constraint eliminations_question_pos_check check (question_pos between 0 and 19);

-- ---------------------------------------------------------------------
-- 2. RLS (Row Level Security)
-- ---------------------------------------------------------------------

alter table public.app_config        enable row level security;
alter table public.questions          enable row level security;
alter table public.games              enable row level security;
alter table public.players            enable row level security;
alter table public.player_secrets     enable row level security;
alter table public.answers            enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.group_answers      enable row level security;
alter table public.group_keys         enable row level security;
alter table public.eliminations       enable row level security;
alter table public.finale_votes       enable row level security;
alter table public.duel_answers       enable row level security;
alter table public.accusations        enable row level security;

-- Lectura pública SOLO de partidas y jugadores (no contienen secretos ni respuestas correctas).
-- El estado privado de cada equipo se lee con la función my_group_state (valida el token).
drop policy if exists games_public_read    on public.games;
drop policy if exists players_public_read  on public.players;
drop policy if exists groups_public_read   on public.groups;
drop policy if exists group_members_public_read on public.group_members;
create policy games_public_read     on public.games       for select to anon, authenticated using (true);
create policy players_public_read   on public.players     for select to anon, authenticated using (true);

-- Con RLS activo y sin políticas, nadie puede leer ni escribir esas tablas desde la API.
-- Se refuerza quitando también los privilegios de tabla.
revoke all on public.app_config, public.questions, public.player_secrets, public.answers,
            public.group_answers, public.group_keys, public.eliminations, public.finale_votes,
            public.duel_answers, public.accusations
  from anon, authenticated;
revoke all on public.games, public.players, public.groups, public.group_members from anon, authenticated;
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

-- Abre una pregunta (puerta normal o prueba final) con su reloj.
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
    phase_ms = duration_ms,
    ends_at = clock_timestamp() + duration_ms * interval '1 millisecond',
    updated_at = clock_timestamp()
  where id = p_game;
end $$;

-- Elimina a un miembro concreto y deja constancia.
create or replace function public._eliminate(p_group uuid, p_player uuid, p_pos int, p_reason text)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
begin
  update public.group_members
     set eliminated = true, eliminated_at = clock_timestamp(), elimination_reason = p_reason
   where group_id = p_group and player_id = p_player and not eliminated;
  if found then
    insert into public.eliminations (group_id, player_id, question_pos, reason)
    values (p_group, p_player, p_pos, p_reason);
  end if;
end $$;

-- Abre la votación de la última puerta (45 s).
create or replace function public._open_betrayal(p_game uuid)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
begin
  -- Un solo sobreviviente: no hay a quién traicionar, pasa directo a la ronda difícil.
  update public.groups gr set outcome = 'hard'
  where gr.game_id = p_game and gr.outcome is null
    and (select count(*) from public.group_members m
         where m.group_id = gr.id and not m.eliminated) = 1;
  -- Sin sobrevivientes: el equipo queda fuera.
  update public.groups gr set outcome = 'wiped', eliminated = true
  where gr.game_id = p_game and gr.outcome is null
    and not exists (select 1 from public.group_members m
                    where m.group_id = gr.id and not m.eliminated);
  update public.games set
    status = 'betrayal',
    current_question = null,
    reveal = null,
    betrayal_variant = null,
    variant_round = 1,
    paused_remaining_ms = null,
    phase_ms = 45000,
    ends_at = clock_timestamp() + interval '45 seconds',
    updated_at = clock_timestamp()
  where id = p_game;
end $$;

-- Abre la fase de la variante sorteada para los equipos en disputa.
--   A: duelo de traidores (pregunta de velocidad, 25 s)
--   B: segunda vuelta (suma una ronda de voto, 30 s)
--   C: acusación (45 s)
create or replace function public._open_variant(p_game uuid)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games; q public.questions;
begin
  select * into g from public.games where id = p_game;
  if g.betrayal_variant = 'A' then
    select * into q from public.questions where kind = 'final';
    if not found then raise exception 'questions_incomplete'; end if;
    update public.games set
      status = 'variant', q_index = q.pos,
      current_question = jsonb_build_object(
        'index', q.pos, 'model', q.model, 'prompt', q.prompt, 'options', q.options),
      reveal = null, paused_remaining_ms = null,
      phase_ms = duration_ms,
      ends_at = clock_timestamp() + duration_ms * interval '1 millisecond',
      updated_at = clock_timestamp()
    where id = p_game;
  elsif g.betrayal_variant = 'B' then
    update public.games set
      status = 'variant', variant_round = variant_round + 1,
      current_question = null, reveal = null, paused_remaining_ms = null,
      phase_ms = 30000, ends_at = clock_timestamp() + interval '30 seconds',
      updated_at = clock_timestamp()
    where id = p_game;
  else
    update public.games set
      status = 'variant',
      current_question = null, reveal = null, paused_remaining_ms = null,
      phase_ms = 45000, ends_at = clock_timestamp() + interval '45 seconds',
      updated_at = clock_timestamp()
    where id = p_game;
  end if;
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
  -- Los equipos se forman en la sala: quien llega después no tendría equipo.
  if g.status <> 'lobby' then raise exception 'game_started'; end if;
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

-- (Quiz individual original; no se usa en el escape room.)
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

  select * into g from public.games where id = pl.game_id for share;
  if g.status <> 'question' then raise exception 'closed'; end if;
  if g.q_index <> p_pos then raise exception 'stale_question'; end if;
  if clock_timestamp() > g.ends_at + interval '300 milliseconds' then
    raise exception 'closed';
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

  return jsonb_build_object('ok', true);
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

-- Estado privado de un equipo. El token del jugador evita exponer otros equipos
-- mediante las tablas públicas o Realtime. Los votos de la traición solo se
-- muestran cuando el administrador ya cerró la votación.
create or replace function public.my_group_state(p_player uuid, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  pl public.players;
  gm public.group_members;
  grp public.groups;
  gam public.games;
  gchoice int;
  gby text;
  show_votes boolean;
  show_acc boolean;
  v_round int;
  my_round int;
begin
  select * into pl from public.players where id = p_player;
  if not found then raise exception 'unauthorized'; end if;
  perform 1 from public.player_secrets where player_id = p_player and token = p_token;
  if not found then raise exception 'unauthorized'; end if;

  select * into gm from public.group_members where player_id = p_player;
  if not found then
    return jsonb_build_object('group', null, 'members', '[]'::jsonb, 'keys', '[]'::jsonb,
      'eliminations', '[]'::jsonb, 'answered', false, 'group_choice', null, 'answered_by', null,
      'my_vote', null, 'votes_cast', 0, 'votes', '[]'::jsonb,
      'my_duel_choice', null, 'duel_cast', 0, 'my_accusation', null, 'accusations', '[]'::jsonb);
  end if;
  select * into grp from public.groups where id = gm.group_id;
  select * into gam from public.games where id = pl.game_id;
  my_round := gam.variant_round;
  select max(v.round) into v_round from public.finale_votes v where v.group_id = grp.id;
  -- Los votos solo se ven cuando el administrador cerró la votación. En las variantes
  -- B y C, mientras el equipo siga en disputa, se revela cuántos traicionaron pero no quiénes.
  show_votes := gam.status in ('betrayal_reveal', 'variant', 'variant_reveal', 'trial', 'trial_reveal', 'finished')
    and not (coalesce(grp.outcome, '') = 'dispute' and gam.betrayal_variant in ('B', 'C'));
  show_acc := gam.status in ('variant_reveal', 'trial', 'trial_reveal', 'finished');

  select a.choice, pa.name into gchoice, gby
  from public.group_answers a left join public.players pa on pa.id = a.answered_by
  where a.group_id = grp.id and a.question_pos = gam.q_index;

  return jsonb_build_object(
    'group', to_jsonb(grp),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'group_id', m.group_id, 'player_id', m.player_id, 'player_name', p.name,
        'eliminated', m.eliminated, 'eliminated_at', m.eliminated_at,
        'elimination_reason', m.elimination_reason, 'escaped', m.escaped,
        'joined_at', m.joined_at) order by p.name)
      from public.group_members m join public.players p on p.id = m.player_id
      where m.group_id = grp.id), '[]'::jsonb),
    'keys', coalesce((select jsonb_agg(to_jsonb(k) order by k.question_pos)
                      from public.group_keys k where k.group_id = grp.id), '[]'::jsonb),
    'eliminations', coalesce((select jsonb_agg(jsonb_build_object(
        'player_id', e.player_id, 'player_name', pe.name, 'question_pos', e.question_pos,
        'reason', e.reason, 'eliminated_at', e.eliminated_at) order by e.eliminated_at)
      from public.eliminations e join public.players pe on pe.id = e.player_id
      where e.group_id = grp.id), '[]'::jsonb),
    'answered', gchoice is not null,
    'group_choice', gchoice,
    'answered_by', gby,
    'my_vote', (select v.vote from public.finale_votes v where v.player_id = p_player and v.round = my_round),
    'votes_cast', (select count(*) from public.finale_votes v
                   join public.group_members vm on vm.player_id = v.player_id and not vm.eliminated and not vm.escaped
                   where v.group_id = grp.id and v.round = my_round),
    'votes', case when show_votes then coalesce((select jsonb_agg(jsonb_build_object(
        'player_id', v.player_id, 'player_name', pv.name, 'vote', v.vote, 'auto', v.auto)
        order by pv.name)
      from public.finale_votes v join public.players pv on pv.id = v.player_id
      where v.group_id = grp.id and v.round = v_round), '[]'::jsonb) else '[]'::jsonb end,
    'my_duel_choice', (select d.choice from public.duel_answers d where d.player_id = p_player),
    'duel_cast', (select count(*) from public.duel_answers d where d.group_id = grp.id),
    'my_accusation', (select a.suspect_id from public.accusations a where a.accuser_id = p_player),
    'accusations', case when show_acc then coalesce((select jsonb_agg(jsonb_build_object(
        'accuser_name', pa.name, 'suspect_name', ps.name) order by pa.name)
      from public.accusations a
      join public.players pa on pa.id = a.accuser_id
      join public.players ps on ps.id = a.suspect_id
      where a.group_id = grp.id), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

-- El primer miembro activo del equipo que responde fija la respuesta de todos.
-- Sirve para las puertas y para la prueba final (solo equipos clasificados).
create or replace function public.submit_group_answer(p_player uuid, p_token uuid, p_pos int, p_choice int)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  pl public.players;
  gm public.group_members;
  g  public.games;
begin
  select * into pl from public.players where id = p_player;
  if not found then raise exception 'unauthorized'; end if;
  perform 1 from public.player_secrets where player_id = p_player and token = p_token;
  if not found then raise exception 'unauthorized'; end if;

  select * into gm from public.group_members
   where player_id = p_player and eliminated = false and escaped = false;
  if not found then raise exception 'not_in_group_or_eliminated'; end if;

  select * into g from public.games where id = pl.game_id for share;
  if g.status not in ('question', 'trial') then raise exception 'closed'; end if;
  if g.q_index <> p_pos then raise exception 'stale_question'; end if;
  if clock_timestamp() > g.ends_at + interval '300 milliseconds' then
    raise exception 'closed';
  end if;
  if p_choice is null or p_choice not between 0 and 3 then raise exception 'invalid_choice'; end if;

  if g.status = 'trial' then
    perform 1 from public.groups where id = gm.group_id and outcome = 'hard';
    if not found then raise exception 'not_in_trial'; end if;
  end if;

  begin
    insert into public.group_answers (group_id, question_pos, choice, answered_by)
    values (gm.group_id, g.q_index, p_choice, p_player);
  exception when unique_violation then
    raise exception 'group_already_answered';
  end;

  update public.players set answers_count = answers_count + 1, last_answer_at = clock_timestamp()
  where id = p_player;

  return jsonb_build_object('ok', true, 'group_id', gm.group_id);
end $$;

-- Voto secreto de la última puerta. Se puede cambiar hasta que cierre el tiempo.
create or replace function public.submit_vote(p_player uuid, p_token uuid, p_vote text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  pl public.players;
  gm public.group_members;
  g  public.games;
  grp public.groups;
begin
  select * into pl from public.players where id = p_player;
  if not found then raise exception 'unauthorized'; end if;
  perform 1 from public.player_secrets where player_id = p_player and token = p_token;
  if not found then raise exception 'unauthorized'; end if;

  select * into gm from public.group_members
   where player_id = p_player and eliminated = false and escaped = false;
  if not found then raise exception 'not_in_group_or_eliminated'; end if;

  select * into g from public.games where id = pl.game_id for share;
  if g.status not in ('betrayal', 'variant') then raise exception 'closed'; end if;
  if clock_timestamp() > g.ends_at + interval '300 milliseconds' then
    raise exception 'closed';
  end if;
  if p_vote is null or p_vote not in ('share', 'steal') then raise exception 'invalid_choice'; end if;

  select * into grp from public.groups where id = gm.group_id;
  if g.status = 'betrayal' then
    if grp.outcome is not null then raise exception 'vote_not_needed'; end if;
  else
    -- Segunda vuelta (variante B): solo votan los equipos en disputa.
    if g.betrayal_variant is distinct from 'B' or grp.outcome is distinct from 'dispute' then
      raise exception 'vote_not_needed';
    end if;
  end if;

  insert into public.finale_votes (group_id, player_id, vote, round)
  values (gm.group_id, p_player, p_vote, g.variant_round)
  on conflict (player_id, round)
  do update set vote = excluded.vote, auto = false, voted_at = clock_timestamp();

  return jsonb_build_object('ok', true);
end $$;

-- Variante A (duelo de traidores): solo responden quienes votaron "steal" en la ronda 1.
-- Gana el primero en acertar; se mide con el reloj del servidor.
create or replace function public.submit_duel_answer(p_player uuid, p_token uuid, p_pos int, p_choice int)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  pl public.players;
  gm public.group_members;
  g  public.games;
  grp public.groups;
  q  public.questions;
begin
  select * into pl from public.players where id = p_player;
  if not found then raise exception 'unauthorized'; end if;
  perform 1 from public.player_secrets where player_id = p_player and token = p_token;
  if not found then raise exception 'unauthorized'; end if;

  select * into gm from public.group_members
   where player_id = p_player and eliminated = false and escaped = false;
  if not found then raise exception 'not_in_group_or_eliminated'; end if;

  select * into g from public.games where id = pl.game_id for share;
  if g.status <> 'variant' or g.betrayal_variant is distinct from 'A' then raise exception 'closed'; end if;
  if g.q_index <> p_pos then raise exception 'stale_question'; end if;
  if clock_timestamp() > g.ends_at + interval '300 milliseconds' then
    raise exception 'closed';
  end if;
  if p_choice is null or p_choice not between 0 and 3 then raise exception 'invalid_choice'; end if;

  select * into grp from public.groups where id = gm.group_id;
  if grp.outcome is distinct from 'dispute' then raise exception 'not_in_duel'; end if;
  perform 1 from public.finale_votes where player_id = p_player and round = 1 and vote = 'steal';
  if not found then raise exception 'not_in_duel'; end if;

  select * into q from public.questions where pos = g.q_index;
  insert into public.duel_answers (group_id, player_id, choice, is_correct)
  values (gm.group_id, p_player, p_choice, p_choice = q.correct_index)
  on conflict (player_id) do nothing;
  if not found then raise exception 'already_answered'; end if;

  return jsonb_build_object('ok', true);
end $$;

-- Variante C (acusación): cada sobreviviente señala a un compañero. Se puede cambiar
-- hasta que se acabe el tiempo.
create or replace function public.submit_accusation(p_player uuid, p_token uuid, p_suspect uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  pl public.players;
  gm public.group_members;
  g  public.games;
  grp public.groups;
begin
  select * into pl from public.players where id = p_player;
  if not found then raise exception 'unauthorized'; end if;
  perform 1 from public.player_secrets where player_id = p_player and token = p_token;
  if not found then raise exception 'unauthorized'; end if;

  select * into gm from public.group_members
   where player_id = p_player and eliminated = false and escaped = false;
  if not found then raise exception 'not_in_group_or_eliminated'; end if;

  select * into g from public.games where id = pl.game_id for share;
  if g.status <> 'variant' or g.betrayal_variant is distinct from 'C' then raise exception 'closed'; end if;
  if clock_timestamp() > g.ends_at + interval '300 milliseconds' then
    raise exception 'closed';
  end if;

  select * into grp from public.groups where id = gm.group_id;
  if grp.outcome is distinct from 'dispute' then raise exception 'vote_not_needed'; end if;

  if p_suspect is null or p_suspect = p_player or not exists (
       select 1 from public.group_members m
       where m.group_id = gm.group_id and m.player_id = p_suspect
         and not m.eliminated and not m.escaped) then
    raise exception 'invalid_choice';
  end if;

  insert into public.accusations (group_id, accuser_id, suspect_id)
  values (gm.group_id, p_player, p_suspect)
  on conflict (accuser_id)
  do update set suspect_id = excluded.suspect_id, accused_at = clock_timestamp();

  return jsonb_build_object('ok', true);
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
             where status in ('question','paused','trial','variant') and q_index = qpos) then
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
  c text; n int; mx int; i int; g public.games; hn int;
begin
  perform public._assert_admin(p_pin);
  -- Puertas contiguas 0..n-1, una pregunta de duelo y la ronda difícil (11..10+n).
  select count(*), coalesce(max(pos), -1) + 1 into n, mx from public.questions where kind = 'door';
  if n = 0 or mx <> n then raise exception 'questions_incomplete'; end if;
  if (select count(*) from public.questions where kind = 'final') <> 1 then
    raise exception 'questions_incomplete';
  end if;
  select count(*) into hn from public.questions where kind = 'hard';
  if hn < 1 or hn > 8
     or (select min(pos) from public.questions where kind = 'hard') <> 11
     or (select max(pos) from public.questions where kind = 'hard') <> 10 + hn then
    raise exception 'questions_incomplete';
  end if;
  loop
    c := '';
    for i in 1..5 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.games where code = c);
  end loop;
  insert into public.games (code, q_total, hard_total) values (c, n, hn) returning * into g;
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
    'players', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at)
                         from public.players p where p.game_id = g.id), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', gr.id, 'game_id', gr.game_id, 'color', gr.color,
                  'key_count', gr.key_count, 'eliminated', gr.eliminated,
                  'outcome', gr.outcome, 'winner_player_id', gr.winner_player_id,
                  'traitor_count', gr.traitor_count,
                  'created_at', gr.created_at,
                  'members', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', gm.id, 'group_id', gm.group_id, 'player_id', gm.player_id,
                    'player_name', p.name, 'eliminated', gm.eliminated,
                    'eliminated_at', gm.eliminated_at, 'elimination_reason', gm.elimination_reason,
                    'escaped', gm.escaped, 'joined_at', gm.joined_at) order by p.name)
                    from public.group_members gm join public.players p on p.id = gm.player_id
                    where gm.group_id = gr.id), '[]'::jsonb)) order by gr.color)
                from public.groups gr where gr.game_id = g.id), '[]'::jsonb),
    'group_answers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', ga.id, 'group_id', ga.group_id, 'question_pos', ga.question_pos,
      'choice', ga.choice, 'answered_by', ga.answered_by,
      'answered_by_name', coalesce(pa.name, '(expulsado)'), 'answered_at', ga.answered_at)
      order by ga.answered_at desc)
      from public.group_answers ga
      join public.groups gr on gr.id = ga.group_id
      left join public.players pa on pa.id = ga.answered_by
      where gr.game_id = g.id), '[]'::jsonb),
    'finale_votes', coalesce((select jsonb_agg(jsonb_build_object(
      'group_id', v.group_id, 'player_id', v.player_id, 'player_name', pv.name,
      'vote', v.vote, 'auto', v.auto, 'round', v.round) order by v.round, pv.name)
      from public.finale_votes v
      join public.groups gr on gr.id = v.group_id
      join public.players pv on pv.id = v.player_id
      where gr.game_id = g.id), '[]'::jsonb),
    'duel_answers', coalesce((select jsonb_agg(jsonb_build_object(
      'group_id', d.group_id, 'player_id', d.player_id, 'player_name', pd.name,
      'choice', d.choice, 'is_correct', d.is_correct, 'answered_at', d.answered_at)
      order by d.answered_at)
      from public.duel_answers d
      join public.groups gr on gr.id = d.group_id
      join public.players pd on pd.id = d.player_id
      where gr.game_id = g.id), '[]'::jsonb),
    'accusations', coalesce((select jsonb_agg(jsonb_build_object(
      'group_id', a.group_id, 'accuser_name', pa.name, 'suspect_name', ps.name)
      order by pa.name)
      from public.accusations a
      join public.groups gr on gr.id = a.group_id
      join public.players pa on pa.id = a.accuser_id
      join public.players ps on ps.id = a.suspect_id
      where gr.game_id = g.id), '[]'::jsonb),
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
  if exists (select 1 from public.players where game_id = g.id and group_id is null) then
    raise exception 'groups_required';
  end if;
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

-- Cierra una puerta: los equipos que acertaron ganan la llave; los que fallaron
-- o no respondieron pierden a un miembro al azar. Un equipo sin miembros queda fuera.
create or replace function public.admin_reveal(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  g public.games;
  q public.questions;
  counts jsonb;
  victim record;
  reasons constant text[] := array[
    'Fuiste aplastado por la puerta.', 'Te incineró el láser de seguridad.',
    'Caíste en la trampa de pinchos.', 'El gas tóxico te alcanzó.',
    'La corriente eléctrica te noqueó.', 'Te tragó el pozo sin fondo.'
  ];
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status not in ('question','paused') then raise exception 'invalid_state'; end if;
  select * into q from public.questions where pos = g.q_index;
  select jsonb_agg(c order by i) into counts from (
    select s.i, count(a.id) as c
    from generate_series(0, 3) as s(i)
    left join public.group_answers a
      on a.question_pos = g.q_index and a.choice = s.i
      and a.group_id in (select id from public.groups where game_id = g.id)
    group by s.i) t;

  -- Llave del color del equipo para quien acertó.
  insert into public.group_keys (group_id, question_pos, color)
  select ga.group_id, g.q_index, gr.color
  from public.group_answers ga
  join public.groups gr on gr.id = ga.group_id
  where gr.game_id = g.id and ga.question_pos = g.q_index and ga.choice = q.correct_index
  on conflict (group_id, question_pos) do nothing;
  update public.groups gr set key_count = (
    select count(*) from public.group_keys k where k.group_id = gr.id
  ) where gr.game_id = g.id;

  -- Quien falló o no respondió pierde un miembro al azar.
  for victim in
    select gr.id as group_id, gm.player_id
    from public.groups gr
    join lateral (
      select gm0.player_id from public.group_members gm0
      where gm0.group_id = gr.id and not gm0.eliminated
      order by random() limit 1
    ) gm on true
    left join public.group_answers ga on ga.group_id = gr.id and ga.question_pos = g.q_index
    where gr.game_id = g.id and (ga.id is null or ga.choice <> q.correct_index)
  loop
    perform public._eliminate(victim.group_id, victim.player_id, g.q_index,
      reasons[1 + floor(random() * array_length(reasons, 1))::int]);
  end loop;

  update public.groups gr set eliminated = true, outcome = 'wiped'
  where gr.game_id = g.id and gr.outcome is null
    and not exists (select 1 from public.group_members m where m.group_id = gr.id and not m.eliminated);

  update public.games set status = 'reveal', ends_at = null, paused_remaining_ms = null,
    reveal = jsonb_build_object('correct_index', q.correct_index,
                                'explanation', q.explanation, 'counts', counts),
    updated_at = clock_timestamp()
  where id = g.id returning * into g;
  return to_jsonb(g);
end $$;

-- Avanza: de la respuesta mostrada a la siguiente puerta (o a la última puerta
-- tras la décima), y de cada pregunta de la ronda difícil a la siguiente o al cierre.
create or replace function public.admin_next(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status = 'reveal' then
    if g.q_index + 1 < g.q_total then
      perform public._start_question(g.id, g.q_index + 1);
    else
      perform public._open_betrayal(g.id);
    end if;
  elsif g.status = 'trial_reveal' then
    if g.q_index < 10 + g.hard_total
       and exists (select 1 from public.groups where game_id = g.id and outcome = 'hard') then
      -- Siguiente pregunta de la ronda difícil.
      perform public._start_question(g.id, g.q_index + 1);
      update public.games set status = 'trial', updated_at = clock_timestamp() where id = g.id;
    else
      -- Terminó la ronda difícil: quien sigue con vida escapa.
      update public.group_members gm set escaped = true
      where not gm.eliminated and not gm.escaped and gm.group_id in (
        select id from public.groups where game_id = g.id and outcome = 'hard');
      update public.groups set outcome = 'escaped' where game_id = g.id and outcome = 'hard';
      update public.games set status = 'finished', ends_at = null, phase_ms = null,
        updated_at = clock_timestamp() where id = g.id;
    end if;
  else
    raise exception 'invalid_state';
  end if;
  select * into g from public.games where id = p_game;
  return to_jsonb(g);
end $$;

-- Cierra la votación de la última puerta y aplica las reglas de la traición.
drop function if exists public.admin_resolve_betrayal(text, uuid);
create or replace function public.admin_resolve_betrayal(p_pin text, p_game uuid, p_variant text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  g public.games;
  grp record;
  mem record;
  n int;
  t int;
  traitors uuid[];
  tname text;
  disputes int := 0;
  variants constant text[] := array['A', 'B', 'C'];
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status <> 'betrayal' then raise exception 'invalid_state'; end if;
  if p_variant is not null and p_variant not in ('A', 'B', 'C') then raise exception 'invalid_choice'; end if;

  for grp in select * from public.groups where game_id = g.id and outcome is null order by color loop
    -- Quien no votó cuenta como "salimos todos".
    insert into public.finale_votes (group_id, player_id, vote, auto)
    select grp.id, gm.player_id, 'share', true
    from public.group_members gm
    where gm.group_id = grp.id and not gm.eliminated
      and not exists (select 1 from public.finale_votes v where v.player_id = gm.player_id);

    select count(*) into n from public.group_members where group_id = grp.id and not eliminated;
    select coalesce(array_agg(v.player_id), '{}'::uuid[]) into traitors
    from public.finale_votes v
    join public.group_members gm on gm.player_id = v.player_id and not gm.eliminated
    where v.group_id = grp.id and v.vote = 'steal';
    t := coalesce(array_length(traitors, 1), 0);

    if n = 0 then
      update public.groups set outcome = 'wiped', eliminated = true where id = grp.id;
    elsif t = 0 then
      -- Todos confiaron: la puerta se sella y empiezan la ronda difícil.
      update public.groups set outcome = 'hard', traitor_count = 0 where id = grp.id;
    elsif t = 1 then
      -- Un solo traidor: sale ahora mismo y gana; el resto queda atrapado.
      select name into tname from public.players where id = traitors[1];
      update public.group_members set escaped = true
        where group_id = grp.id and player_id = traitors[1];
      for mem in
        select player_id from public.group_members
        where group_id = grp.id and not eliminated and player_id <> traitors[1]
      loop
        perform public._eliminate(grp.id, mem.player_id, g.q_total,
          'Traicionado por ' || tname || ': escapó solo y selló la puerta.');
      end loop;
      update public.groups set outcome = 'lone_winner', winner_player_id = traitors[1]
        where id = grp.id;
    else
      -- Dos o más traidores: el equipo queda en disputa y la variante sorteada decide.
      update public.groups set outcome = 'dispute', traitor_count = t where id = grp.id;
      disputes := disputes + 1;
    end if;
  end loop;

  update public.games set status = 'betrayal_reveal', ends_at = null, paused_remaining_ms = null,
    variant_round = 1,
    betrayal_variant = case when disputes > 0
      then coalesce(p_variant, variants[1 + floor(random() * array_length(variants, 1))::int])
      else null end,
    updated_at = clock_timestamp() where id = g.id;
  select * into g from public.games where id = p_game;
  return to_jsonb(g);
end $$;

-- Reparte el resultado de un equipo en disputa una vez aplicada la variante:
-- con cooperadores vivos sigue a la ronda difícil; sin ellos, gana el traidor que
-- escapó (si lo hay) o el equipo queda aniquilado.
create or replace function public._settle_dispute(p_group uuid)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare coop int; w uuid;
begin
  select winner_player_id into w from public.groups where id = p_group;
  select count(*) into coop from public.group_members
   where group_id = p_group and not eliminated and not escaped;
  if coop > 0 then
    update public.groups set outcome = 'hard' where id = p_group;
  elsif w is not null then
    update public.groups set outcome = 'lone_winner' where id = p_group;
  else
    update public.groups set outcome = 'wiped', eliminated = true where id = p_group;
  end if;
end $$;

-- Avanza desde la traición resuelta o desde una variante resuelta:
--   * si quedan equipos en disputa (solo la segunda vuelta B), abre otra ronda;
--   * si hay equipos para la ronda difícil, empiezan de CERO (pierden las llaves)
--     y se lanza la primera pregunta difícil;
--   * si no queda ninguno, la partida termina.
create or replace function public.admin_start_trial(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare g public.games; hpos int;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status not in ('betrayal_reveal', 'variant_reveal') then raise exception 'invalid_state'; end if;

  if exists (select 1 from public.groups where game_id = g.id and outcome = 'dispute') then
    perform public._open_variant(g.id);
  elsif not exists (select 1 from public.groups where game_id = g.id and outcome = 'hard') then
    update public.games set status = 'finished', ends_at = null, phase_ms = null,
      updated_at = clock_timestamp() where id = g.id;
  else
    select min(pos) into hpos from public.questions where kind = 'hard';
    if hpos is null then raise exception 'questions_incomplete'; end if;
    delete from public.group_keys
      where group_id in (select id from public.groups where game_id = g.id and outcome = 'hard');
    update public.groups set key_count = 0 where game_id = g.id and outcome = 'hard';
    perform public._start_question(g.id, hpos);
    update public.games set status = 'trial', updated_at = clock_timestamp() where id = g.id;
  end if;
  select * into g from public.games where id = p_game;
  return to_jsonb(g);
end $$;

-- Cierra la variante sorteada para los equipos en disputa.
--   A duelo: gana el primer traidor que acierta y escapa solo; los demás traidores caen.
--   B segunda vuelta: 0 traidores -> ronda difícil; 1 -> sale solo; 2 o más -> otra
--     vuelta (hasta la ronda 3, donde los traidores caen).
--   C acusación: cae el traidor señalado por alguien y quien acusó a un inocente.
-- Los que cooperaron siempre pasan a la ronda difícil.
create or replace function public.admin_resolve_variant(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  g public.games;
  q public.questions;
  grp record;
  mem record;
  traitors uuid[];
  t int;
  winner uuid;
  wname text;
  counts jsonb;
  rnd int;
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status <> 'variant' then raise exception 'invalid_state'; end if;
  rnd := g.variant_round;

  if g.betrayal_variant = 'A' then
    select * into q from public.questions where pos = g.q_index;
    for grp in select * from public.groups where game_id = g.id and outcome = 'dispute' order by color loop
      select coalesce(array_agg(v.player_id), '{}'::uuid[]) into traitors
      from public.finale_votes v
      join public.group_members gm on gm.player_id = v.player_id and not gm.eliminated and not gm.escaped
      where v.group_id = grp.id and v.round = 1 and v.vote = 'steal';

      winner := null;
      select d.player_id into winner from public.duel_answers d
      where d.group_id = grp.id and d.is_correct and d.player_id = any (traitors)
      order by d.answered_at limit 1;

      if winner is not null then
        select name into wname from public.players where id = winner;
        update public.group_members set escaped = true where group_id = grp.id and player_id = winner;
        update public.groups set winner_player_id = winner where id = grp.id;
      end if;
      for mem in
        select player_id from public.group_members
        where group_id = grp.id and not eliminated and not escaped and player_id = any (traitors)
      loop
        perform public._eliminate(grp.id, mem.player_id, g.q_total,
          case when winner is not null
            then 'Perdiste el duelo: ' || wname || ' respondió primero y escapó solo.'
            else 'Nadie ganó el duelo de traidores: la puerta se los tragó a todos.' end);
      end loop;
      perform public._settle_dispute(grp.id);
    end loop;

    select jsonb_agg(c order by i) into counts from (
      select s.i, count(d.id) as c
      from generate_series(0, 3) as s(i)
      left join public.duel_answers d
        on d.choice = s.i and d.group_id in (select id from public.groups where game_id = g.id)
      group by s.i) x;
    update public.games set reveal = jsonb_build_object('correct_index', q.correct_index,
      'explanation', q.explanation, 'counts', counts) where id = g.id;

  elsif g.betrayal_variant = 'B' then
    for grp in select * from public.groups where game_id = g.id and outcome = 'dispute' order by color loop
      -- Quien no votó en esta vuelta cuenta como "salimos todos".
      insert into public.finale_votes (group_id, player_id, vote, auto, round)
      select grp.id, gm.player_id, 'share', true, rnd
      from public.group_members gm
      where gm.group_id = grp.id and not gm.eliminated and not gm.escaped
        and not exists (select 1 from public.finale_votes v
                        where v.player_id = gm.player_id and v.round = rnd);
      select coalesce(array_agg(v.player_id), '{}'::uuid[]) into traitors
      from public.finale_votes v
      join public.group_members gm on gm.player_id = v.player_id and not gm.eliminated and not gm.escaped
      where v.group_id = grp.id and v.round = rnd and v.vote = 'steal';
      t := coalesce(array_length(traitors, 1), 0);

      if t = 0 then
        update public.groups set outcome = 'hard', traitor_count = 0 where id = grp.id;
      elsif t = 1 then
        select name into wname from public.players where id = traitors[1];
        update public.group_members set escaped = true
          where group_id = grp.id and player_id = traitors[1];
        for mem in
          select player_id from public.group_members
          where group_id = grp.id and not eliminated and not escaped
        loop
          perform public._eliminate(grp.id, mem.player_id, g.q_total,
            'Traicionado por ' || wname || ' en la segunda vuelta: escapó solo y selló la puerta.');
        end loop;
        update public.groups set outcome = 'lone_winner', winner_player_id = traitors[1],
          traitor_count = 1 where id = grp.id;
      elsif rnd < 3 then
        update public.groups set traitor_count = t where id = grp.id;
      else
        for mem in
          select player_id from public.group_members
          where group_id = grp.id and not eliminated and not escaped and player_id = any (traitors)
        loop
          perform public._eliminate(grp.id, mem.player_id, g.q_total,
            'Dos traidores se anularon entre sí: nadie salió por esa puerta.');
        end loop;
        update public.groups set traitor_count = t where id = grp.id;
        perform public._settle_dispute(grp.id);
      end if;
    end loop;

  else
    for grp in select * from public.groups where game_id = g.id and outcome = 'dispute' order by color loop
      select coalesce(array_agg(v.player_id), '{}'::uuid[]) into traitors
      from public.finale_votes v
      join public.group_members gm on gm.player_id = v.player_id and not gm.eliminated and not gm.escaped
      where v.group_id = grp.id and v.round = 1 and v.vote = 'steal';

      -- Cae el traidor señalado por alguien...
      for mem in
        select distinct a.suspect_id as pid from public.accusations a
        where a.group_id = grp.id and a.suspect_id = any (traitors)
      loop
        perform public._eliminate(grp.id, mem.pid, g.q_total,
          'Te señalaron y eras traidor: la puerta te expulsó.');
      end loop;
      -- ...y cae quien acusó a un inocente.
      for mem in
        select a.accuser_id as pid from public.accusations a
        where a.group_id = grp.id and not (a.suspect_id = any (traitors))
      loop
        perform public._eliminate(grp.id, mem.pid, g.q_total,
          'Acusaste a un inocente: la puerta te castigó.');
      end loop;
      perform public._settle_dispute(grp.id);
    end loop;
  end if;

  update public.games set status = 'variant_reveal', ends_at = null, paused_remaining_ms = null,
    updated_at = clock_timestamp() where id = g.id;
  select * into g from public.games where id = p_game;
  return to_jsonb(g);
end $$;

-- Cierra la pregunta de la ronda difícil: el equipo que acierta gana una llave; el que
-- falla o no responde pierde a DOS miembros al azar (a uno si solo queda uno).
-- Un equipo sin miembros activos queda aniquilado.
create or replace function public.admin_resolve_trial(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  g public.games;
  q public.questions;
  counts jsonb;
  victim record;
  first_reasons constant text[] := array[
    'El techo se vino abajo: la ronda difícil no perdona.',
    'La niebla ácida del pasillo te devoró.',
    'El suelo se abrió bajo tus pies.',
    'Una cuchilla te alcanzó en la oscuridad.',
    'El silencio de la sala te venció.',
    'Te atrapó la reja que se cerró de golpe.'
  ];
  second_reasons constant text[] := array[
    'La puerta se cobró doble: caíste junto a tu compañero.',
    'La trampa tenía dos víctimas y tú eras la segunda.',
    'Te alcanzó la onda expansiva del error de tu equipo.'
  ];
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status <> 'trial' then raise exception 'invalid_state'; end if;
  select * into q from public.questions where pos = g.q_index;

  select jsonb_agg(c order by i) into counts from (
    select s.i, count(a.id) as c
    from generate_series(0, 3) as s(i)
    left join public.group_answers a
      on a.question_pos = g.q_index and a.choice = s.i
      and a.group_id in (select id from public.groups where game_id = g.id and outcome = 'hard')
    group by s.i) t;

  -- Llave para el equipo que acertó.
  insert into public.group_keys (group_id, question_pos, color)
  select ga.group_id, g.q_index, gr.color
  from public.group_answers ga
  join public.groups gr on gr.id = ga.group_id
  where gr.game_id = g.id and gr.outcome = 'hard'
    and ga.question_pos = g.q_index and ga.choice = q.correct_index
  on conflict (group_id, question_pos) do nothing;
  update public.groups gr set key_count = (
    select count(*) from public.group_keys k where k.group_id = gr.id
  ) where gr.game_id = g.id and gr.outcome = 'hard';

  -- Error o silencio: caen hasta dos miembros al azar.
  for victim in
    select gr.id as group_id, x.player_id, x.rn
    from public.groups gr
    join lateral (
      select m.player_id, row_number() over (order by random()) as rn
      from public.group_members m
      where m.group_id = gr.id and not m.eliminated and not m.escaped
    ) x on x.rn <= 2
    left join public.group_answers ga on ga.group_id = gr.id and ga.question_pos = g.q_index
    where gr.game_id = g.id and gr.outcome = 'hard'
      and (ga.id is null or ga.choice <> q.correct_index)
  loop
    perform public._eliminate(victim.group_id, victim.player_id, g.q_index,
      case when victim.rn = 1
        then first_reasons[1 + floor(random() * array_length(first_reasons, 1))::int]
        else second_reasons[1 + floor(random() * array_length(second_reasons, 1))::int] end);
  end loop;

  -- Sin miembros activos: el equipo cae (o gana el traidor que escapó antes).
  update public.groups gr set
    outcome = case when gr.winner_player_id is not null then 'lone_winner' else 'wiped' end,
    eliminated = (gr.winner_player_id is null)
  where gr.game_id = g.id and gr.outcome = 'hard'
    and not exists (select 1 from public.group_members m
                    where m.group_id = gr.id and not m.eliminated and not m.escaped);

  update public.games set status = 'trial_reveal', ends_at = null, paused_remaining_ms = null,
    reveal = jsonb_build_object('correct_index', q.correct_index,
                                'explanation', q.explanation, 'counts', counts),
    updated_at = clock_timestamp()
  where id = g.id;
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
  update public.games set status = 'finished', ends_at = null, paused_remaining_ms = null,
    phase_ms = null, updated_at = clock_timestamp() where id = g.id returning * into g;
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
-- 6b. EQUIPOS: formación y correcciones manuales
-- ---------------------------------------------------------------------

-- Reparte a todos los participantes al azar en hasta 4 equipos equilibrados
-- (21 personas -> 6, 5, 5, 5). Se puede repetir mientras la partida esté en sala.
create or replace function public.admin_form_groups(p_pin text, p_game uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  g public.games;
  player_ids uuid[];
  player_count int;
  group_count int;
  base_size int;
  remainder int;
  i int;
  j int;
  idx int := 1;
  gid uuid;
  colors constant text[] := array['red','blue','green','yellow'];
begin
  perform public._assert_admin(p_pin);
  select * into g from public.games where id = p_game for update;
  if not found then raise exception 'game_not_found'; end if;
  if g.status <> 'lobby' then raise exception 'invalid_state'; end if;

  -- El orden aleatorio va DENTRO del array_agg; fuera no mezclaría nada.
  select array_agg(id order by random()) into player_ids
  from public.players where game_id = p_game;
  player_count := coalesce(array_length(player_ids, 1), 0);
  if player_count = 0 then raise exception 'no_players'; end if;
  group_count := least(4, player_count);

  base_size := player_count / group_count;
  remainder := player_count % group_count;

  delete from public.group_members where group_id in (select id from public.groups where game_id = p_game);
  delete from public.groups where game_id = p_game;
  update public.players set group_id = null where game_id = p_game;

  for i in 1..group_count loop
    insert into public.groups (game_id, color) values (p_game, colors[i]) returning id into gid;
    for j in 1..(base_size + case when i <= remainder then 1 else 0 end) loop
      insert into public.group_members (group_id, player_id) values (gid, player_ids[idx]);
      update public.players set group_id = gid where id = player_ids[idx];
      idx := idx + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'groups', (select jsonb_agg(jsonb_build_object(
      'id', gr.id, 'color', gr.color,
      'member_count', (select count(*) from public.group_members gm where gm.group_id = gr.id)
    ) order by gr.color) from public.groups gr where gr.game_id = p_game)
  );
end $$;

-- Corrección manual del administrador: elimina a un miembro al azar.
create or replace function public.eliminate_random_member(p_pin text, p_group uuid, p_pos int)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  gam public.games;
  victim public.players;
  reasons constant text[] := array[
    'Fuiste aplastado por la puerta.',
    'Te incineró el láser de seguridad.',
    'Caíste en la trampa de pinchos.',
    'El gas tóxico te alcanzó.',
    'La corriente eléctrica te noqueó.',
    'Te tragó el pozo sin fondo.'
  ];
  reason_text text;
begin
  perform public._assert_admin(p_pin);
  select ga.* into gam from public.games ga where ga.id = (select game_id from public.groups where id = p_group);
  if not found then raise exception 'group_not_found'; end if;
  if gam.q_index <> p_pos then raise exception 'stale_question'; end if;

  select p.* into victim
  from public.players p
  join public.group_members gm on gm.player_id = p.id
  where gm.group_id = p_group and gm.eliminated = false and gm.escaped = false
  order by random()
  limit 1;
  if not found then
    return jsonb_build_object('eliminated', false, 'message', 'No hay miembros para eliminar');
  end if;

  reason_text := reasons[1 + floor(random() * array_length(reasons, 1))::int];
  perform public._eliminate(p_group, victim.id, p_pos, reason_text);

  update public.groups gr set eliminated = true, outcome = 'wiped'
  where gr.id = p_group and gr.outcome is null
    and not exists (select 1 from public.group_members m where m.group_id = gr.id and not m.eliminated);

  return jsonb_build_object('eliminated', true, 'player_id', victim.id, 'player_name', victim.name,
                            'reason', reason_text, 'group_id', p_group);
end $$;

-- Corrección manual del administrador: entrega la llave de una puerta a un equipo.
create or replace function public.award_group_key(p_pin text, p_group uuid, p_pos int)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  grp public.groups;
begin
  perform public._assert_admin(p_pin);
  select * into grp from public.groups where id = p_group;
  if not found then raise exception 'group_not_found'; end if;
  perform 1 from public.questions where pos = p_pos;
  if not found then raise exception 'question_not_found'; end if;

  insert into public.group_keys (group_id, question_pos, color)
  values (p_group, p_pos, grp.color)
  on conflict (group_id, question_pos) do nothing;

  update public.groups set key_count = (select count(*) from public.group_keys where group_id = p_group)
  where id = p_group;

  return jsonb_build_object('key_color', grp.color, 'group_id', p_group, 'question_pos', p_pos);
end $$;

-- ---------------------------------------------------------------------
-- 7. PERMISOS DE EJECUCIÓN
-- ---------------------------------------------------------------------

revoke execute on function
  public._assert_admin(text), public._start_question(uuid, int), public._recompute_scores(uuid),
  public._eliminate(uuid, uuid, int, text), public._open_betrayal(uuid),
  public._open_variant(uuid), public._settle_dispute(uuid)
  from public, anon, authenticated;

revoke execute on function
  public.server_time(), public.join_game(text, text),
  public.submit_answer(uuid, uuid, int, int), public.my_answers(uuid, uuid), public.my_group_state(uuid, uuid),
  public.submit_group_answer(uuid, uuid, int, int), public.submit_vote(uuid, uuid, text),
  public.submit_duel_answer(uuid, uuid, int, int), public.submit_accusation(uuid, uuid, uuid),
  public.admin_resolve_variant(text, uuid),
  public.admin_questions(text),
  public.admin_save_question(text, uuid, text, text, jsonb, int, text),
  public.admin_form_groups(text, uuid),
  public.admin_create_game(text), public.admin_latest_game(text),
  public.admin_snapshot(text, uuid), public.admin_start(text, uuid),
  public.admin_pause(text, uuid), public.admin_resume(text, uuid),
  public.admin_reveal(text, uuid), public.admin_next(text, uuid),
  public.admin_resolve_betrayal(text, uuid, text), public.admin_start_trial(text, uuid),
  public.admin_resolve_trial(text, uuid),
  public.admin_finish(text, uuid), public.admin_remove_player(text, uuid),
  public.eliminate_random_member(text, uuid, int), public.award_group_key(text, uuid, int)
  from public;

grant execute on function
  public.server_time(), public.join_game(text, text),
  public.submit_answer(uuid, uuid, int, int), public.my_answers(uuid, uuid), public.my_group_state(uuid, uuid),
  public.submit_group_answer(uuid, uuid, int, int), public.submit_vote(uuid, uuid, text),
  public.submit_duel_answer(uuid, uuid, int, int), public.submit_accusation(uuid, uuid, uuid),
  public.admin_resolve_variant(text, uuid),
  public.admin_questions(text),
  public.admin_save_question(text, uuid, text, text, jsonb, int, text),
  public.admin_form_groups(text, uuid),
  public.admin_create_game(text), public.admin_latest_game(text),
  public.admin_snapshot(text, uuid), public.admin_start(text, uuid),
  public.admin_pause(text, uuid), public.admin_resume(text, uuid),
  public.admin_reveal(text, uuid), public.admin_next(text, uuid),
  public.admin_resolve_betrayal(text, uuid, text), public.admin_start_trial(text, uuid),
  public.admin_resolve_trial(text, uuid),
  public.admin_finish(text, uuid), public.admin_remove_player(text, uuid),
  public.eliminate_random_member(text, uuid, int), public.award_group_key(text, uuid, int)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. DATOS INICIALES
-- ---------------------------------------------------------------------

-- 10 puertas fáciles (0..9) + 1 pregunta de duelo (10) + 5 de la ronda difícil (11..15).
-- Se pueden editar desde /admin > Preguntas. Al volver a ejecutar este script solo se
-- reescriben las filas que sigan con el texto de ejemplo «[EDITAR]»: tus cambios se respetan.
insert into public.questions as q (pos, kind, model, prompt, options, correct_index, explanation) values
 (0, 'door', 'Mantenimiento',
   '¿Qué es el mantenimiento del software?',
   '["Crear el software desde cero","Modificar el software ya entregado para corregirlo, adaptarlo o mejorarlo","Borrar el software que ya no se usa","Vender el software a nuevos clientes"]', 1,
   'El mantenimiento empieza después de la entrega: se corrigen errores, se adapta el sistema a cambios del entorno y se mejora.'),
 (1, 'door', 'Quick-Fix',
   'El modelo Quick-Fix consiste en…',
   '["Planear todo el cambio con mucho detalle antes de tocar el código","Calcular primero el costo y beneficio de cada cambio","Arreglar el código rápido y actualizar la documentación después","Reconstruir el sistema completo desde cero"]', 2,
   'Quick-Fix significa arreglo rápido: se cambia el código de inmediato y la documentación queda para después. Es rápido y barato, pero deteriora la estructura del sistema.'),
 (2, 'door', 'Tipos de mantenimiento',
   'Si un usuario encuentra un error y lo arreglamos, hacemos mantenimiento…',
   '["Correctivo","Adaptativo","Perfectivo","Preventivo"]', 0,
   'El mantenimiento correctivo repara errores (bugs) detectados en el software.'),
 (3, 'door', 'Boehm',
   'El modelo de Boehm decide qué cambios hacer según…',
   '["El orden en que llegan las solicitudes","La preferencia del programador","El tamaño del equipo de trabajo","El costo y el beneficio (criterio económico) de cada cambio"]', 3,
   'Boehm propone un modelo económico: los cambios se aprueban y priorizan según su relación costo-beneficio.'),
 (4, 'door', 'Tipos de mantenimiento',
   'Cambiar un programa para que funcione en un nuevo sistema operativo es mantenimiento…',
   '["Correctivo","Perfectivo","Adaptativo","Preventivo"]', 2,
   'El mantenimiento adaptativo ajusta el software a cambios del entorno: sistema operativo, hardware, leyes.'),
 (5, 'door', 'Osborne',
   '¿Qué destaca el modelo de Osborne?',
   '["Que la documentación se escriba solo al final","Que la mantenibilidad se piense desde el diseño y haya retroalimentación en cada etapa","Que los cambios se hagan sin planear","Que el sistema se reemplace cada año"]', 1,
   'Osborne insiste en considerar la mantenibilidad desde el diseño y en mantener retroalimentación durante todo el proceso de mantenimiento.'),
 (6, 'door', 'Tipos de mantenimiento',
   'Añadir una función nueva que piden los usuarios es mantenimiento…',
   '["Preventivo","Perfectivo","Correctivo","Adaptativo"]', 1,
   'El mantenimiento perfectivo mejora o amplía las funciones y el rendimiento del software.'),
 (7, 'door', 'Mejora iterativa',
   'El modelo de mejora iterativa mejora el sistema…',
   '["Reemplazándolo por completo de una sola vez","Sin analizar el sistema actual","Solo cuando falla en producción","En ciclos sucesivos, partiendo del sistema que ya existe"]', 3,
   'La mejora iterativa parte del sistema existente y lo evoluciona en ciclos: analizar, rediseñar e implementar, una y otra vez.'),
 (8, 'door', 'Reutilización',
   'El modelo orientado a la reutilización se basa en…',
   '["Reutilizar partes del sistema existente, adaptándolas e integrándolas","Escribir todo el código de nuevo","Eliminar la documentación","Cambiar de lenguaje de programación"]', 0,
   'Se identifican las partes del sistema actual que sirven, se entienden, se modifican y se integran en la nueva versión.'),
 (9, 'door', 'Reutilización',
   'Una ventaja de reutilizar componentes del sistema existente es…',
   '["Escribir menos documentación","Evitar que el sistema tenga usuarios","Ahorrar tiempo y esfuerzo al aprovechar piezas ya probadas","Hacer el sistema más lento"]', 2,
   'Reutilizar piezas que ya funcionan ahorra tiempo y esfuerzo, y reduce errores nuevos.'),
 (10, 'final', 'Duelo de traidores',
   'Reestructurar el código hoy para evitar fallos futuros y facilitar cambios es mantenimiento…',
   '["Correctivo","Adaptativo","Perfectivo","Preventivo"]', 3,
   'El mantenimiento preventivo mejora la estructura del software antes de que aparezcan problemas.'),
 -- Ronda difícil (posiciones 11..15). Preguntas de aplicación: piden razonar, no recordar.
 (11, 'hard', 'Quick-Fix',
   'Un equipo aplica Quick-Fix durante años y casi nunca actualiza la documentación. ¿Qué es lo más probable que ocurra?',
   '["El sistema se vuelve más fácil de mantener porque cada arreglo es pequeño","Baja el costo de mantenimiento de forma permanente","La estructura se degrada y cada cambio futuro cuesta más y rompe más cosas","Deja de hacer falta el mantenimiento preventivo"]', 2,
   'Quick-Fix es barato hoy, pero los parches acumulados y la documentación desactualizada erosionan la estructura: cada cambio posterior es más caro y arriesgado.'),
 (12, 'hard', 'Boehm',
   'Según el modelo económico de Boehm, un cambio cuyo costo estimado supera con claridad su beneficio esperado debería…',
   '["Rechazarse o posponerse, porque la decisión se basa en la relación costo-beneficio","Hacerse de inmediato porque el usuario lo pidió","Resolverse con Quick-Fix para ahorrar tiempo","Delegarse siempre al área de documentación"]', 0,
   'Boehm trata el mantenimiento como una decisión económica: los cambios se priorizan por su relación costo-beneficio y los que no se justifican se descartan o posponen.'),
 (13, 'hard', 'Osborne',
   'En el modelo de Osborne, ¿para qué sirve la retroalimentación sobre los problemas que aparecen durante el mantenimiento?',
   '["Solo para registrar las quejas de los usuarios","Para sustituir las pruebas del software","Para decidir cuándo se retira el sistema","Para mejorar la mantenibilidad: lo aprendido se incorpora al diseño y a los cambios siguientes"]', 3,
   'Osborne propone considerar la mantenibilidad desde el diseño y mantener retroalimentación durante todo el proceso, de modo que lo aprendido mejore los cambios y los sistemas futuros.'),
 (14, 'hard', 'Mejora iterativa',
   'Un equipo aplica mejora iterativa y termina un ciclo de análisis, rediseño e implementación. ¿Qué hace después?',
   '["Da el sistema por terminado sin evaluarlo de nuevo","Evalúa el sistema ya mejorado y, si hace falta, empieza otro ciclo partiendo de él","Descarta el sistema y lo reconstruye desde cero","Elimina la documentación del ciclo anterior"]', 1,
   'En la mejora iterativa cada ciclo parte del sistema ya existente: se analiza el resultado y se repite el ciclo mientras haga falta.'),
 (15, 'hard', 'Tipos de mantenimiento',
   'Los usuarios piden que un reporte cargue en 2 segundos en lugar de 10, sin cambiar sus resultados. Ese cambio es mantenimiento…',
   '["Correctivo","Adaptativo","Perfectivo","Preventivo"]', 2,
   'El mantenimiento perfectivo mejora el rendimiento o las funciones de un software que ya funciona correctamente.')
on conflict (pos) do update set
  kind = excluded.kind, model = excluded.model, prompt = excluded.prompt,
  options = excluded.options, correct_index = excluded.correct_index,
  explanation = excluded.explanation, updated_at = now()
where q.prompt like '[EDITAR]%';

-- PIN de administrador inicial. ⚠️ CÁMBIALO: sustituye 'MISION2026' por tu PIN
-- antes de ejecutar, o corre después:
--   update public.app_config set value = extensions.crypt('TU-NUEVO-PIN', extensions.gen_salt('bf'))
--   where key = 'admin_pin_hash';
insert into public.app_config (key, value)
values ('admin_pin_hash', extensions.crypt('MISION2026', extensions.gen_salt('bf')))
on conflict (key) do nothing;

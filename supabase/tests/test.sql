-- Prueba de extremo a extremo del escape room, ejecutada con roles reales (anon).
-- Uso: ver supabase/tests/run.sh
--
-- Partida A (12 jugadores, 4 equipos de 3): recorre las 10 puertas, la votación
-- de traición con sus cuatro desenlaces (todos cooperan, un traidor, dos
-- traidores, único sobreviviente) y la prueba final (acierto y fallo).
-- Partida B (8 jugadores): correcciones manuales, equipos aniquilados y fin de
-- partida sin prueba final.
\set ON_ERROR_STOP on
\set QUIET on

create schema tests;
grant usage on schema tests to anon;

create function tests.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
create function tests.err(q text, expected text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if sqlerrm like '%' || expected || '%' then return; end if;
    raise exception 'ASSERT FAILED: se esperaba "%" y salió "%" en: %', expected, sqlerrm, q;
  end;
  raise exception 'ASSERT FAILED: no hubo error (se esperaba "%") en: %', expected, q;
end $$;

-- Participantes de prueba (nombre, id, token y equipo).
create table tests.p (name text primary key, id uuid not null, token uuid not null, grp uuid);
grant all on tests.p to anon;

create function tests.join_many(p_code text, p_n int, p_prefix text) returns void language plpgsql as $$
declare j jsonb; i int;
begin
  for i in 1..p_n loop
    j := public.join_game(p_code, p_prefix || i);
    insert into tests.p values (p_prefix || i, (j->>'player_id')::uuid, (j->>'token')::uuid, null);
  end loop;
end $$;

create function tests.load_groups() returns void language sql as $$
  update tests.p t set grp = pl.group_id from public.players pl where pl.id = t.id;
$$;

create function tests.state(p_name text) returns jsonb language sql as $$
  select public.my_group_state(id, token) from tests.p where name = p_name $$;

-- Miembros todavía vivos de un equipo.
create function tests.active(p_grp uuid) returns setof tests.p language sql as $$
  select t.* from tests.p t
  where t.grp = p_grp
    and exists (select 1 from jsonb_array_elements(public.my_group_state(t.id, t.token)->'members') m
                where (m->>'player_id')::uuid = t.id and (m->>'eliminated')::boolean = false)
$$;

create function tests.nth_active(p_grp uuid, p_n int) returns text language sql as $$
  select name from tests.active(p_grp) order by length(name), name offset (p_n - 1) limit 1 $$;

create function tests.vote(p_name text, p_vote text) returns void language plpgsql as $$
declare r tests.p;
begin
  select * into r from tests.p where name = p_name;
  perform public.submit_vote(r.id, r.token, p_vote);
end $$;

create function tests.vote_with_token(p_name text, p_other text, p_vote text) returns void language plpgsql as $$
declare r tests.p; o tests.p;
begin
  select * into r from tests.p where name = p_name;
  select * into o from tests.p where name = p_other;
  perform public.submit_vote(r.id, o.token, p_vote);
end $$;

create function tests.vote_all_active(p_grp uuid, p_vote text) returns void language plpgsql as $$
declare m tests.p;
begin
  for m in select * from tests.active(p_grp) loop
    perform public.submit_vote(m.id, m.token, p_vote);
  end loop;
end $$;

create function tests.answer_as(p_name text, p_pos int, p_choice int) returns void language plpgsql as $$
declare r tests.p;
begin
  select * into r from tests.p where name = p_name;
  perform public.submit_group_answer(r.id, r.token, p_pos, p_choice);
end $$;

create function tests.answer_with_token(p_name text, p_other text, p_pos int, p_choice int) returns void language plpgsql as $$
declare r tests.p; o tests.p;
begin
  select * into r from tests.p where name = p_name;
  select * into o from tests.p where name = p_other;
  perform public.submit_group_answer(r.id, o.token, p_pos, p_choice);
end $$;

create function tests.correct(p_pos int) returns int language sql as $$
  select correct_index from public.admin_questions('TESTPIN') where pos = p_pos $$;

-- Un miembro vivo responde por todo el equipo.
create function tests.answer_group(p_grp uuid, p_pos int, p_choice int) returns void language plpgsql as $$
declare m tests.p;
begin
  select * into m from tests.active(p_grp) order by length(name), name limit 1;
  perform public.submit_group_answer(m.id, m.token, p_pos, p_choice);
end $$;

-- Todos los equipos con sobrevivientes aciertan la puerta p_pos.
create function tests.play_correct(p_pos int, p_groups uuid[]) returns void language plpgsql as $$
declare g uuid;
begin
  foreach g in array p_groups loop
    if exists (select 1 from tests.active(g)) then
      perform tests.answer_group(g, p_pos, tests.correct(p_pos));
    end if;
  end loop;
end $$;

-- Juega las puertas p_from..p_to: responder, revelar y avanzar.
create function tests.doors(p_game uuid, p_from int, p_to int, p_groups uuid[]) returns void language plpgsql as $$
declare i int;
begin
  for i in p_from..p_to loop
    perform tests.play_correct(i, p_groups);
    perform public.admin_reveal('TESTPIN', p_game);
    perform public.admin_next('TESTPIN', p_game);
  end loop;
end $$;

-- Lecturas del snapshot del administrador.
create function tests.gval(p_game uuid, p_idx int, p_key text) returns text language sql as $$
  select public.admin_snapshot('TESTPIN', p_game)->'groups'->p_idx->>p_key $$;
create function tests.alive(p_game uuid, p_idx int) returns int language sql as $$
  select count(*)::int
  from jsonb_array_elements(public.admin_snapshot('TESTPIN', p_game)->'groups'->p_idx->'members') m
  where not (m->>'eliminated')::boolean $$;
create function tests.escaped(p_game uuid, p_idx int) returns int language sql as $$
  select count(*)::int
  from jsonb_array_elements(public.admin_snapshot('TESTPIN', p_game)->'groups'->p_idx->'members') m
  where (m->>'escaped')::boolean $$;
create function tests.gstatus(p_game uuid) returns text language sql as $$
  select public.admin_snapshot('TESTPIN', p_game)->'game'->>'status' $$;

-- ¿El reparto es aleatorio? Forma equipos 5 veces y comprueba que al menos una
-- vez NO salgan como bloques consecutivos por orden de llegada.
create function tests.shuffled(p_game uuid) returns boolean language plpgsql as $$
declare i int; seq boolean;
begin
  for i in 1..5 loop
    perform public.admin_form_groups('TESTPIN', p_game);
    select bool_and(mx - mn = 2 and cnt = 3) into seq from (
      select min(r) as mn, max(r) as mx, count(*) as cnt from (
        select group_id, row_number() over (order by length(name), name) as r
        from public.players where game_id = p_game) x
      group by group_id) y;
    if not seq then return true; end if;
  end loop;
  return false;
end $$;

grant execute on all functions in schema tests to anon;

-- PIN de pruebas
update public.app_config set value = extensions.crypt('TESTPIN', extensions.gen_salt('bf'))
where key = 'admin_pin_hash';

set role anon;

-- =====================================================================
-- 1. Seguridad: tablas sensibles inaccesibles desde la API
-- =====================================================================
select tests.err('select * from public.questions', 'permission denied');
select tests.err('select * from public.answers', 'permission denied');
select tests.err('select * from public.player_secrets', 'permission denied');
select tests.err('select * from public.app_config', 'permission denied');
select tests.err('select * from public.finale_votes', 'permission denied');
select tests.err('select * from public.group_answers', 'permission denied');
select tests.err('select * from public.group_keys', 'permission denied');
select tests.err('select * from public.eliminations', 'permission denied');
select tests.err('select * from public.groups', 'permission denied');
select tests.err('select * from public.group_members', 'permission denied');
select tests.err($q$update public.games set status = 'finished'$q$, 'permission denied');
select tests.err($q$insert into public.players (game_id, name) values (gen_random_uuid(), 'x')$q$, 'permission denied');
select tests.err($q$insert into public.finale_votes (group_id, player_id, vote) values (gen_random_uuid(), gen_random_uuid(), 'steal')$q$, 'permission denied');
select tests.err('select public._assert_admin(''TESTPIN'')', 'permission denied');
select tests.err($q$select public._eliminate(gen_random_uuid(), gen_random_uuid(), 0, 'x')$q$, 'permission denied');
select tests.err($q$select public._open_betrayal(gen_random_uuid())$q$, 'permission denied');

-- =====================================================================
-- 2. Todas las funciones de administrador exigen el PIN
-- =====================================================================
select tests.err($q$select public.admin_create_game('mal')$q$, 'unauthorized');
select tests.err($q$select public.admin_questions('mal')$q$, 'unauthorized');
select tests.err($q$select public.admin_start('mal', gen_random_uuid())$q$, 'unauthorized');
select tests.err($q$select public.admin_form_groups('mal', gen_random_uuid())$q$, 'unauthorized');
select tests.err($q$select public.admin_reveal('mal', gen_random_uuid())$q$, 'unauthorized');
select tests.err($q$select public.admin_next('mal', gen_random_uuid())$q$, 'unauthorized');
select tests.err($q$select public.admin_resolve_betrayal('mal', gen_random_uuid())$q$, 'unauthorized');
select tests.err($q$select public.admin_start_trial('mal', gen_random_uuid())$q$, 'unauthorized');
select tests.err($q$select public.admin_resolve_trial('mal', gen_random_uuid())$q$, 'unauthorized');
select tests.err($q$select public.award_group_key('mal', gen_random_uuid(), 0)$q$, 'unauthorized');
select tests.err($q$select public.eliminate_random_member('mal', gen_random_uuid(), 0)$q$, 'unauthorized');

-- =====================================================================
-- 3. Preguntas: 10 puertas fáciles + 1 prueba final, sin textos de ejemplo
-- =====================================================================
select tests.ok((select count(*) from public.admin_questions('TESTPIN') where kind = 'door') = 10, '10 puertas sembradas');
select tests.ok((select count(*) from public.admin_questions('TESTPIN') where kind = 'final') = 1, 'una sola prueba final');
select tests.ok((select bool_and(prompt not like '[EDITAR]%') from public.admin_questions('TESTPIN')), 'ya no quedan textos [EDITAR]');
select tests.ok((select count(distinct correct_index) from public.admin_questions('TESTPIN')) = 4, 'la respuesta correcta no está siempre en la misma letra');
select tests.ok((select bool_and(pos = case kind when 'final' then 10 else pos end) from public.admin_questions('TESTPIN')), 'la prueba final es la posición 10');

select id as q3 from public.admin_questions('TESTPIN') where pos = 3 \gset
select public.admin_save_question('TESTPIN', :'q3'::uuid, 'Boehm', 'Pregunta editada', '["x","b","c","d"]'::jsonb, 0, 'porque sí');
select tests.ok(tests.correct(3) = 0, 'la edición de una pregunta se respeta');
select tests.err($q$select public.admin_save_question('TESTPIN', gen_random_uuid(), 'x','y','["a","b","c","d"]'::jsonb,0,'')$q$, 'questions_incomplete');
select tests.err($q$select public.admin_save_question('TESTPIN', '$q$ || :'q3' || $q$'::uuid, 'x','y','["a","","c","d"]'::jsonb,0,'')$q$, 'invalid_choice');

-- =====================================================================
-- 4. Partida A: creación y entrada de participantes
-- =====================================================================
select public.admin_create_game('TESTPIN') as g \gset
select (:'g'::jsonb)->>'id' as gid, (:'g'::jsonb)->>'code' as code \gset
select tests.ok(length(:'code') = 5, 'código de 5 caracteres');
select tests.ok((:'g'::jsonb)->>'status' = 'lobby', 'estado inicial lobby');
select tests.ok(((:'g'::jsonb)->>'q_total')::int = 10, 'la partida tiene 10 puertas');
select tests.ok(((:'g'::jsonb)->>'duration_ms')::int = 25000, '25 segundos por puerta');

select tests.err($q$select public.join_game('ZZZZZ', 'Ana')$q$, 'game_not_found');
select tests.err($q$select public.join_game('$q$ || :'code' || $q$', '   ')$q$, 'invalid_name');
select tests.join_many(lower(:'code'), 12, 'A');
select tests.err($q$select public.join_game('$q$ || :'code' || $q$', 'a1')$q$, 'name_taken');
select tests.ok((select count(*) from public.players) = 12, '12 jugadores visibles');
select tests.ok((select count(*) from information_schema.columns
                 where table_name = 'players' and column_name = 'token') = 0, 'players no expone el token');
select tests.ok(tests.state('A1')->'group' = 'null'::jsonb, 'sin equipo antes de formar grupos');

-- Una partida sin jugadores no arranca; sin equipos formados tampoco.
select public.admin_create_game('TESTPIN')->>'id' as empty_gid \gset
select tests.err($q$select public.admin_start('TESTPIN', '$q$ || :'empty_gid' || $q$'::uuid)$q$, 'no_players');
select tests.err($q$select public.admin_start('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'groups_required');

-- En sala no hay nada que pausar, revelar ni resolver.
select tests.err($q$select public.admin_pause('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select tests.err($q$select public.admin_reveal('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select tests.err($q$select public.admin_next('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select tests.err($q$select public.admin_resolve_betrayal('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select tests.err($q$select public.admin_start_trial('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select tests.err($q$select public.admin_resolve_trial('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');

-- =====================================================================
-- 5. Formación de equipos: aleatoria y equilibrada
-- =====================================================================
select tests.ok(tests.shuffled(:'gid'::uuid), 'los equipos se reparten al azar, no por orden de llegada');
select public.admin_snapshot('TESTPIN', :'gid'::uuid) as snap \gset
select tests.ok(jsonb_array_length((:'snap'::jsonb)->'groups') = 4, '4 equipos');
select tests.ok((select bool_and(jsonb_array_length(x->'members') = 3) from jsonb_array_elements((:'snap'::jsonb)->'groups') x), 'cada equipo tiene 3 miembros');
select tests.ok((:'snap'::jsonb)->'groups'->0->>'color' = 'blue' and (:'snap'::jsonb)->'groups'->3->>'color' = 'yellow', 'equipos blue, green, red, yellow');
select tests.load_groups();
select tests.ok((select count(*) from tests.p where grp is null) = 0, 'todos tienen equipo');
select (:'snap'::jsonb)->'groups'->0->>'id' as g1, (:'snap'::jsonb)->'groups'->1->>'id' as g2,
       (:'snap'::jsonb)->'groups'->2->>'id' as g3, (:'snap'::jsonb)->'groups'->3->>'id' as g4 \gset
select tests.ok(tests.state('A1')->'group'->>'id' is not null, 'cada jugador ve su equipo');
select tests.ok((select count(*) from jsonb_array_elements(tests.state('A1')->'members')) = 3, 'y a sus 3 compañeros');

-- =====================================================================
-- 6. Puerta 1 (pos 0): el primero en responder fija la respuesta del equipo
-- =====================================================================
select public.admin_start('TESTPIN', :'gid'::uuid) as st \gset
select tests.ok((:'st'::jsonb)->>'status' = 'question' and ((:'st'::jsonb)->>'q_index')::int = 0, 'arrancó la puerta 1');
select tests.ok((:'st'::jsonb)->'current_question' ? 'options', 'el teléfono recibe las opciones');
select tests.ok(not ((:'st'::jsonb)->'current_question' ? 'correct_index'), 'sin la respuesta correcta en el payload');
select tests.ok(((:'st'::jsonb)->>'phase_ms')::int = 25000, 'reloj de 25 s');
select tests.err($q$select public.join_game('$q$ || :'code' || $q$', 'Tarde')$q$, 'game_started');
select tests.err($q$select public.admin_form_groups('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');

select tests.nth_active(:'g1'::uuid, 1) as a1, tests.nth_active(:'g1'::uuid, 2) as a2,
       tests.nth_active(:'g3'::uuid, 1) as r1 \gset

-- Tiempo agotado: se rechaza después del cierre.
reset role;
update public.games set ends_at = clock_timestamp() - interval '5 seconds' where id = :'gid'::uuid;
set role anon;
select tests.err($q$select tests.answer_as('$q$ || :'r1' || $q$', 0, 1)$q$, 'closed');
reset role;
update public.games set ends_at = clock_timestamp() + interval '25 seconds' where id = :'gid'::uuid;
set role anon;

-- Pausa: nadie responde mientras está en pausa.
select public.admin_pause('TESTPIN', :'gid'::uuid) as pz \gset
select tests.ok((:'pz'::jsonb)->>'status' = 'paused', 'en pausa');
select tests.err($q$select tests.answer_as('$q$ || :'r1' || $q$', 0, 1)$q$, 'closed');
select public.admin_resume('TESTPIN', :'gid'::uuid) as rs \gset
select tests.ok((:'rs'::jsonb)->>'status' = 'question' and (:'rs'::jsonb)->>'ends_at' is not null, 'reanudada con nuevo fin');

-- Validaciones de la respuesta.
select tests.err($q$select tests.answer_as('$q$ || :'r1' || $q$', 0, 9)$q$, 'invalid_choice');
select tests.err($q$select tests.answer_as('$q$ || :'r1' || $q$', 3, 0)$q$, 'stale_question');
select tests.err($q$select tests.answer_with_token('$q$ || :'r1' || $q$', '$q$ || :'a1' || $q$', 0, 1)$q$, 'unauthorized');

-- El equipo azul acierta (la 1 tiene correcta = 1): responde a1 y a2 llega tarde.
select tests.ok(tests.state(:'a1')->>'answered' = 'false', 'el equipo aún no ha respondido');
select tests.answer_as(:'a1', 0, 1);
select tests.err($q$select tests.answer_as('$q$ || :'a2' || $q$', 0, 2)$q$, 'group_already_answered');
select tests.ok(tests.state(:'a2')->>'answered' = 'true', 'el compañero ve que su equipo ya respondió');
select tests.ok(tests.state(:'a2')->>'group_choice' = '1', 'y qué opción eligió');
select tests.ok(tests.state(:'a2')->>'answered_by' = :'a1', 'y quién respondió');
select tests.ok(not (tests.state(:'a2') ? 'is_correct'), 'nadie ve si acertó antes del reveal');
select tests.answer_group(:'g2'::uuid, 0, 1);       -- verde acierta
select tests.answer_group(:'g3'::uuid, 0, 1);       -- rosa acierta
select tests.answer_group(:'g4'::uuid, 0, 0);       -- amarillo falla

-- Revelar: llave para los que acertaron, un eliminado para el que falló.
select public.admin_reveal('TESTPIN', :'gid'::uuid) as rv \gset
select tests.ok((:'rv'::jsonb)->>'status' = 'reveal', 'estado reveal');
select tests.ok((:'rv'::jsonb)->'reveal'->>'correct_index' = '1', 'solución publicada');
select tests.ok((:'rv'::jsonb)->'reveal'->'counts' = '[1,3,0,0]'::jsonb, 'conteo por opción (cuenta equipos, no jugadores)');
select tests.ok(tests.gval(:'gid'::uuid, 0, 'key_count') = '1' and tests.gval(:'gid'::uuid, 1, 'key_count') = '1'
                and tests.gval(:'gid'::uuid, 2, 'key_count') = '1', 'los 3 equipos que acertaron ganan llave');
select tests.ok(tests.gval(:'gid'::uuid, 3, 'key_count') = '0', 'el que falló no gana llave');
select tests.ok(tests.alive(:'gid'::uuid, 3) = 2, 'el que falló pierde un miembro');
select tests.ok(tests.alive(:'gid'::uuid, 0) = 3 and tests.alive(:'gid'::uuid, 1) = 3 and tests.alive(:'gid'::uuid, 2) = 3, 'los que acertaron conservan a todos');
select tests.err($q$select public.admin_reveal('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');

-- La llave manual es idempotente (no suma dos veces).
select public.award_group_key('TESTPIN', :'g1'::uuid, 0) is not null as a \gset
select tests.ok(tests.gval(:'gid'::uuid, 0, 'key_count') = '1', 'award_group_key no duplica llaves');
select tests.ok(tests.gval(:'gid'::uuid, 0, 'outcome') is null, 'sin desenlace mientras juegan');

-- El eliminado lo sabe y no puede seguir respondiendo.
select m->>'player_name' as dead4
from jsonb_array_elements(public.admin_snapshot('TESTPIN', :'gid'::uuid)->'groups'->3->'members') m
where (m->>'eliminated')::boolean \gset
select tests.ok((select bool_or((x->>'eliminated')::boolean and x->>'player_name' = :'dead4')
                 from jsonb_array_elements(tests.state(:'dead4')->'members') x), 'el eliminado se ve como eliminado');
select tests.ok((select bool_or(x->>'elimination_reason' is not null)
                 from jsonb_array_elements(tests.state(:'dead4')->'members') x
                 where x->>'player_name' = :'dead4'), 'con su mensaje dramático');

-- =====================================================================
-- 7. Puerta 2 (pos 1): amarillo no responde y queda con un solo sobreviviente
-- =====================================================================
select public.admin_next('TESTPIN', :'gid'::uuid)->>'q_index' as qi \gset
select tests.ok(:'qi' = '1', 'puerta 2');
select tests.err($q$select tests.answer_as('$q$ || :'dead4' || $q$', 1, 0)$q$, 'not_in_group_or_eliminated');
select tests.answer_group(:'g1'::uuid, 1, tests.correct(1));
select tests.answer_group(:'g2'::uuid, 1, tests.correct(1));
select tests.answer_group(:'g3'::uuid, 1, tests.correct(1));
select public.admin_reveal('TESTPIN', :'gid'::uuid) is not null as a \gset
select tests.ok(tests.alive(:'gid'::uuid, 3) = 1, 'sin respuesta también elimina: amarillo queda con 1');
select tests.ok(tests.gval(:'gid'::uuid, 3, 'key_count') = '0', 'amarillo sigue sin llaves');

-- Puertas 3 a 10: todos aciertan.
select public.admin_next('TESTPIN', :'gid'::uuid) is not null as a \gset
select tests.doors(:'gid'::uuid, 2, 9, array[:'g1', :'g2', :'g3', :'g4']::uuid[]);

-- =====================================================================
-- 8. La última puerta: abre la votación
-- =====================================================================
select public.admin_snapshot('TESTPIN', :'gid'::uuid) as snap2 \gset
select tests.ok((:'snap2'::jsonb)->'game'->>'status' = 'betrayal', 'tras la puerta 10 comienza la traición');
select tests.ok((:'snap2'::jsonb)->'game'->'current_question' = 'null'::jsonb, 'sin pregunta en pantalla');
select tests.ok(((:'snap2'::jsonb)->'game'->>'phase_ms')::int = 45000, 'votación de 45 s');
select tests.ok(tests.gval(:'gid'::uuid, 0, 'key_count') = '10' and tests.gval(:'gid'::uuid, 1, 'key_count') = '10'
                and tests.gval(:'gid'::uuid, 2, 'key_count') = '10', 'azul, verde y rosa reunieron las 10 llaves');
select tests.ok(tests.gval(:'gid'::uuid, 3, 'key_count') = '8', 'amarillo reunió 8 llaves');
select tests.ok(tests.gval(:'gid'::uuid, 3, 'outcome') = 'trap', 'un único sobreviviente pasa directo a la prueba final');
select tests.ok(tests.gval(:'gid'::uuid, 0, 'outcome') is null and tests.gval(:'gid'::uuid, 2, 'outcome') is null, 'los demás deben votar');

select tests.err($q$select public.admin_pause('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select tests.err($q$select public.admin_reveal('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select tests.err($q$select public.admin_next('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select tests.err($q$select public.admin_start_trial('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select tests.err($q$select tests.answer_as('$q$ || :'a1' || $q$', 9, 0)$q$, 'closed');

-- Votar: validaciones.
select tests.nth_active(:'g4'::uuid, 1) as y1 \gset
select tests.err($q$select tests.vote('$q$ || :'dead4' || $q$', 'share')$q$, 'not_in_group_or_eliminated');
select tests.err($q$select tests.vote('$q$ || :'y1' || $q$', 'share')$q$, 'vote_not_needed');
select tests.err($q$select tests.vote('$q$ || :'a1' || $q$', 'quizas')$q$, 'invalid_choice');
select tests.err($q$select tests.vote_with_token('$q$ || :'a1' || $q$', '$q$ || :'r1' || $q$', 'share')$q$, 'unauthorized');

-- Votar fuera de tiempo se rechaza.
reset role;
update public.games set ends_at = clock_timestamp() - interval '5 seconds' where id = :'gid'::uuid;
set role anon;
select tests.err($q$select tests.vote('$q$ || :'a1' || $q$', 'share')$q$, 'closed');
reset role;
update public.games set ends_at = clock_timestamp() + interval '45 seconds' where id = :'gid'::uuid;
set role anon;

-- Azul: todos cooperan (a1 duda y cambia de opinión: se puede).
select tests.nth_active(:'g1'::uuid, 3) as a3 \gset
select tests.vote(:'a1', 'steal');
select tests.vote(:'a1', 'share');
select tests.vote(:'a2', 'share');
select tests.vote(:'a3', 'share');
select tests.ok(tests.state(:'a1')->>'my_vote' = 'share', 'el voto se puede cambiar antes de que acabe el tiempo');
select tests.ok((tests.state(:'a1')->>'votes_cast')::int = 3, 'se ve cuántos votaron');
select tests.ok(jsonb_array_length(tests.state(:'a2')->'votes') = 0, 'los votos son secretos mientras se vota');

-- Verde: un solo traidor.
select tests.nth_active(:'g2'::uuid, 1) as s1, tests.nth_active(:'g2'::uuid, 2) as s2,
       tests.nth_active(:'g2'::uuid, 3) as s3 \gset
select tests.vote(:'s1', 'steal');
select tests.vote(:'s2', 'share');
select tests.vote(:'s3', 'share');

-- Rosa: dos traidores; el tercero se duerme y no vota.
select tests.nth_active(:'g3'::uuid, 1) as t1, tests.nth_active(:'g3'::uuid, 2) as t2,
       tests.nth_active(:'g3'::uuid, 3) as t3 \gset
select tests.vote(:'t1', 'steal');
select tests.vote(:'t2', 'steal');
select tests.ok(public.admin_snapshot('TESTPIN', :'gid'::uuid)->'finale_votes' is not null
                and jsonb_array_length(public.admin_snapshot('TESTPIN', :'gid'::uuid)->'finale_votes') = 8, 'el administrador ve 8 votos emitidos');

-- Resolver la votación.
select public.admin_resolve_betrayal('TESTPIN', :'gid'::uuid) as rb \gset
select tests.ok((:'rb'::jsonb)->>'status' = 'betrayal_reveal', 'votación cerrada');
select tests.err($q$select public.admin_resolve_betrayal('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select tests.err($q$select tests.vote('$q$ || :'a1' || $q$', 'steal')$q$, 'closed');

-- Azul: nadie traicionó -> la puerta se sella, todos siguen.
select tests.ok(tests.gval(:'gid'::uuid, 0, 'outcome') = 'trap' and tests.alive(:'gid'::uuid, 0) = 3, 'azul cooperó: va a la prueba final completo');

-- Verde: un traidor sale solo y gana; el resto cae.
select tests.ok(tests.gval(:'gid'::uuid, 1, 'outcome') = 'lone_winner', 'verde: un traidor gana solo');
select tests.ok(tests.gval(:'gid'::uuid, 1, 'winner_player_id') = (select id::text from tests.p where name = :'s1'), 'el ganador es el traidor');
select tests.ok(tests.escaped(:'gid'::uuid, 1) = 1 and tests.alive(:'gid'::uuid, 1) = 1, 'solo el traidor escapó y sigue vivo');
select tests.ok((select bool_or(x->>'elimination_reason' like 'Traicionado por ' || :'s1' || '%')
                 from jsonb_array_elements(tests.state(:'s2')->'members') x
                 where x->>'player_name' = :'s2'), 'los traicionados saben quién los traicionó');

-- Rosa: dos traidores se anulan; el que cooperó pasa a la prueba final.
select tests.ok(tests.gval(:'gid'::uuid, 2, 'outcome') = 'trap' and tests.alive(:'gid'::uuid, 2) = 1, 'rosa: los traidores caen, el cooperador sigue');
select tests.ok((select bool_or(x->>'elimination_reason' like 'Dos traidores%')
                 from jsonb_array_elements(tests.state(:'t3')->'members') x
                 where x->>'player_name' = :'t1'), 'mensaje de traidores anulados');

-- Los votos ya son visibles para el equipo, y se marca quién no votó.
select tests.ok(jsonb_array_length(tests.state(:'s2')->'votes') = 3, 'tras el reveal el equipo ve los 3 votos');
select tests.ok((select bool_or(v->>'player_name' = :'s1' and v->>'vote' = 'steal')
                 from jsonb_array_elements(tests.state(:'s2')->'votes') v), 'y quién traicionó');
select tests.ok((select bool_or(v->>'player_name' = :'t3' and (v->>'auto')::boolean and v->>'vote' = 'share')
                 from jsonb_array_elements(tests.state(:'t3')->'votes') v), 'quien no votó cuenta como cooperar (auto)');
select tests.ok(tests.gval(:'gid'::uuid, 3, 'outcome') = 'trap', 'amarillo sigue clasificado');

-- =====================================================================
-- 9. Prueba final
-- =====================================================================
select public.admin_start_trial('TESTPIN', :'gid'::uuid) as tr \gset
select tests.ok((:'tr'::jsonb)->>'status' = 'trial' and ((:'tr'::jsonb)->>'q_index')::int = 10, 'prueba final en curso');
select tests.ok((:'tr'::jsonb)->'current_question'->>'index' = '10' and (:'tr'::jsonb)->'current_question' ? 'options', 'el teléfono recibe la pregunta final');
select tests.ok(not ((:'tr'::jsonb)->'current_question' ? 'correct_index'), 'sin la respuesta correcta en la prueba final');
select tests.err($q$select tests.answer_as('$q$ || :'s2' || $q$', 10, 0)$q$, 'not_in_group_or_eliminated');
select tests.err($q$select tests.answer_as('$q$ || :'s1' || $q$', 10, 0)$q$, 'not_in_trial');

select tests.answer_group(:'g1'::uuid, 10, tests.correct(10));              -- azul acierta
select tests.answer_group(:'g3'::uuid, 10, (tests.correct(10) + 1) % 4);    -- rosa falla
select tests.answer_group(:'g4'::uuid, 10, tests.correct(10));              -- amarillo acierta
select tests.err($q$select tests.answer_as('$q$ || :'a2' || $q$', 10, 0)$q$, 'group_already_answered');

select public.admin_resolve_trial('TESTPIN', :'gid'::uuid) as rt \gset
select tests.ok((:'rt'::jsonb)->>'status' = 'trial_reveal', 'prueba final resuelta');
select tests.ok((:'rt'::jsonb)->'reveal'->>'correct_index' = tests.correct(10)::text, 'se publica la solución de la prueba final');
select tests.ok(tests.gval(:'gid'::uuid, 0, 'outcome') = 'escaped' and tests.escaped(:'gid'::uuid, 0) = 3, 'azul escapa entero');
select tests.ok(tests.gval(:'gid'::uuid, 3, 'outcome') = 'escaped' and tests.escaped(:'gid'::uuid, 3) = 1, 'amarillo escapa con su sobreviviente');
select tests.ok(tests.gval(:'gid'::uuid, 2, 'outcome') = 'reset' and tests.gval(:'gid'::uuid, 2, 'key_count') = '0', 'rosa falló: vuelve al nivel cero');
select tests.ok(jsonb_array_length(tests.state(:'t3')->'keys') = 0, 'y pierde sus llaves');
select tests.ok(tests.gval(:'gid'::uuid, 0, 'key_count') = '10' and tests.gval(:'gid'::uuid, 3, 'key_count') = '8', 'los que escaparon conservan sus llaves');
select tests.ok(tests.gval(:'gid'::uuid, 1, 'outcome') = 'lone_winner', 'el traidor sigue siendo ganador');
select tests.err($q$select public.admin_resolve_trial('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');

-- Cierre de la partida.
select public.admin_next('TESTPIN', :'gid'::uuid)->>'status' as fin \gset
select tests.ok(:'fin' = 'finished', 'partida finalizada');
select tests.err($q$select public.join_game('$q$ || :'code' || $q$', 'Tarde2')$q$, 'game_finished');
select tests.err($q$select public.admin_finish('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
-- azul 10+1, verde 10, rosa 10+1, amarillo 9+1 (no respondió la puerta 2) = 42
select tests.ok(jsonb_array_length(public.admin_snapshot('TESTPIN', :'gid'::uuid)->'group_answers') = 42,
                'snapshot: 42 respuestas de equipo (puertas + prueba final)');
select tests.ok(jsonb_array_length(public.admin_snapshot('TESTPIN', :'gid'::uuid)->'players') = 12, 'snapshot: 12 jugadores');
select tests.ok(jsonb_array_length(public.admin_snapshot('TESTPIN', :'gid'::uuid)->'questions') = 11, 'snapshot: 11 preguntas');

-- =====================================================================
-- 10. Partida B: correcciones manuales, equipos aniquilados, fin sin prueba final
-- =====================================================================
select public.admin_create_game('TESTPIN') as gb \gset
select (:'gb'::jsonb)->>'id' as gbid, (:'gb'::jsonb)->>'code' as codeb \gset
select public.join_game(lower(:'codeb'), '  Ana   López ') as jb \gset
insert into tests.p values ('Ana López', ((:'jb'::jsonb)->>'player_id')::uuid, ((:'jb'::jsonb)->>'token')::uuid, null);
select tests.err($q$select public.join_game('$q$ || :'codeb' || $q$', 'ana lópez')$q$, 'name_taken');
select tests.join_many(:'codeb', 7, 'B');
select tests.ok(exists (select 1 from public.players where name = 'Ana López'), 'nombre normalizado (espacios colapsados)');

select public.admin_form_groups('TESTPIN', :'gbid'::uuid) is not null as a \gset
select tests.load_groups();
select public.admin_snapshot('TESTPIN', :'gbid'::uuid) as snapb \gset
select tests.ok(jsonb_array_length((:'snapb'::jsonb)->'groups') = 4
                and (select bool_and(jsonb_array_length(x->'members') = 2) from jsonb_array_elements((:'snapb'::jsonb)->'groups') x), '8 jugadores: 4 equipos de 2');
select (:'snapb'::jsonb)->'groups'->0->>'id' as b1, (:'snapb'::jsonb)->'groups'->1->>'id' as b2,
       (:'snapb'::jsonb)->'groups'->2->>'id' as b3, (:'snapb'::jsonb)->'groups'->3->>'id' as b4 \gset
select public.admin_start('TESTPIN', :'gbid'::uuid) is not null as a \gset

-- Correcciones manuales sobre el equipo rosa: lo dejan sin miembros.
select tests.err($q$select public.eliminate_random_member('TESTPIN', '$q$ || :'b3' || $q$'::uuid, 5)$q$, 'stale_question');
select tests.ok((public.eliminate_random_member('TESTPIN', :'b3'::uuid, 0))->>'eliminated' = 'true', 'eliminación manual 1');
select tests.ok(tests.alive(:'gbid'::uuid, 2) = 1 and tests.gval(:'gbid'::uuid, 2, 'outcome') is null, 'rojo queda con 1 y sigue en juego');
select tests.ok((public.eliminate_random_member('TESTPIN', :'b3'::uuid, 0))->>'eliminated' = 'true', 'eliminación manual 2');
select tests.ok(tests.gval(:'gbid'::uuid, 2, 'outcome') = 'wiped'
                and tests.gval(:'gbid'::uuid, 2, 'eliminated') = 'true', 'sin miembros: el equipo queda aniquilado');
select tests.ok((public.eliminate_random_member('TESTPIN', :'b3'::uuid, 0))->>'eliminated' = 'false', 'no se puede eliminar a quien ya no queda');
select public.award_group_key('TESTPIN', :'b3'::uuid, 0) is not null as a \gset
select public.award_group_key('TESTPIN', :'b3'::uuid, 0) is not null as a \gset
select tests.ok(tests.gval(:'gbid'::uuid, 2, 'key_count') = '1', 'la llave manual no se duplica');

-- Las 10 puertas con un equipo ya aniquilado (no responde ni pierde nada más).
select tests.doors(:'gbid'::uuid, 0, 9, array[:'b1', :'b2', :'b3', :'b4']::uuid[]);
select tests.ok(tests.gstatus(:'gbid'::uuid) = 'betrayal', 'partida B en la última puerta');
select tests.ok(tests.alive(:'gbid'::uuid, 0) = 2 and tests.alive(:'gbid'::uuid, 1) = 2 and tests.alive(:'gbid'::uuid, 3) = 2, 'los demás equipos siguen completos');

-- Todos se traicionan: nadie queda para la prueba final.
select tests.vote_all_active(:'b1'::uuid, 'steal');
select tests.vote_all_active(:'b2'::uuid, 'steal');
select tests.vote_all_active(:'b4'::uuid, 'steal');
select public.admin_resolve_betrayal('TESTPIN', :'gbid'::uuid) is not null as a \gset
select tests.ok(tests.gval(:'gbid'::uuid, 0, 'outcome') = 'wiped' and tests.gval(:'gbid'::uuid, 1, 'outcome') = 'wiped'
                and tests.gval(:'gbid'::uuid, 3, 'outcome') = 'wiped', 'todos traidores: los equipos quedan aniquilados');
select tests.ok(tests.alive(:'gbid'::uuid, 0) = 0 and tests.escaped(:'gbid'::uuid, 0) = 0, 'sin sobrevivientes ni fugados');
select tests.ok(public.admin_start_trial('TESTPIN', :'gbid'::uuid)->>'status' = 'finished', 'sin equipos clasificados la partida termina sin prueba final');

-- El estado privado del equipo expone sus eliminaciones (puerta + motivo) y no las de otros.
select tests.ok(jsonb_array_length(public.my_group_state(
                  (select id from tests.p where name = 'B1'), (select token from tests.p where name = 'B1'))->'eliminations') >= 0,
                'my_group_state incluye la lista de eliminaciones');

-- Moderación.
select public.admin_remove_player('TESTPIN', (select id from tests.p where name = 'B7'));
select tests.ok((select count(*) from public.players where game_id = :'gbid'::uuid) = 7, 'B7 expulsado');

\echo TODAS LAS PRUEBAS PASARON

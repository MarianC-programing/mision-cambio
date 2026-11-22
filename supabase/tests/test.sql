-- Prueba de extremo a extremo del esquema, ejecutada con roles reales (anon).
-- Uso: ver supabase/tests/run.sh
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
grant execute on all functions in schema tests to anon;

-- PIN de pruebas
update public.app_config set value = extensions.crypt('TESTPIN', extensions.gen_salt('bf'))
where key = 'admin_pin_hash';

set role anon;

-- 1. Tablas sensibles inaccesibles desde la API
select tests.err('select * from public.questions', 'permission denied');
select tests.err('select * from public.answers', 'permission denied');
select tests.err('select * from public.player_secrets', 'permission denied');
select tests.err('select * from public.app_config', 'permission denied');
select tests.err($q$update public.games set status = 'finished'$q$, 'permission denied');
select tests.err($q$insert into public.players (game_id, name) values (gen_random_uuid(), 'x')$q$, 'permission denied');
select tests.err('select public._assert_admin(''TESTPIN'')', 'permission denied');

-- 2. Admin protegido por PIN
select tests.err($q$select public.admin_create_game('mal')$q$, 'unauthorized');
select tests.err($q$select public.admin_questions('mal')$q$, 'unauthorized');
select tests.err($q$select public.admin_start('mal', gen_random_uuid())$q$, 'unauthorized');

-- 3. Crear partida y editar una pregunta
select public.admin_create_game('TESTPIN') as g \gset
select (:'g'::jsonb)->>'id' as gid, (:'g'::jsonb)->>'code' as code \gset
select tests.ok(length(:'code') = 5, 'código de 5 caracteres');
select tests.ok((:'g'::jsonb)->>'status' = 'lobby', 'estado inicial lobby');
select tests.ok(((:'g'::jsonb)->>'q_total')::int = 5, 'total de 5 preguntas');

select id as q1 from public.admin_questions('TESTPIN') where pos = 1 \gset
select public.admin_save_question('TESTPIN', :'q1'::uuid, 'Boehm', 'Pregunta editada',
  '["a","b","c","d"]'::jsonb, 2, 'porque sí');
select tests.err($q$select public.admin_save_question('TESTPIN', gen_random_uuid(), 'x','y','["a","b","c","d"]'::jsonb,0,'')$q$, 'questions_incomplete');
select tests.err($q$select public.admin_save_question('TESTPIN', '$q$ || :'q1' || $q$'::uuid, 'x','y','["a","","c","d"]'::jsonb,0,'')$q$, 'invalid_choice');

-- 4. Unirse
select tests.err($q$select public.join_game('ZZZZZ', 'Ana')$q$, 'game_not_found');
select tests.err($q$select public.join_game('$q$ || :'code' || $q$', '   ')$q$, 'invalid_name');
select public.join_game(lower(:'code'), '  Ana   López ') as ja \gset
select (:'ja'::jsonb)->>'player_id' as ana, (:'ja'::jsonb)->>'token' as ana_t \gset
select tests.err($q$select public.join_game('$q$ || :'code' || $q$', 'ana lópez')$q$, 'name_taken');
select public.join_game(:'code', 'Beto') as jb \gset
select (:'jb'::jsonb)->>'player_id' as beto, (:'jb'::jsonb)->>'token' as beto_t \gset
select public.join_game(:'code', 'Cami') as jc \gset
select (:'jc'::jsonb)->>'player_id' as cami, (:'jc'::jsonb)->>'token' as cami_t \gset

-- anon puede leer jugadores pero sin tokens
select tests.ok((select count(*) from public.players) = 3, '3 jugadores visibles');
select tests.ok((select count(*) from information_schema.columns
                 where table_name = 'players' and column_name = 'token') = 0, 'players no tiene token');

-- 5. No se puede responder antes de empezar
select tests.err($q$select public.submit_answer('$q$ || :'ana' || $q$'::uuid, '$q$ || :'ana_t' || $q$'::uuid, 0, 0)$q$, 'closed');

-- 6. Iniciar: una partida sin jugadores no arranca
select public.admin_create_game('TESTPIN')->>'id' as empty_gid \gset
select tests.err($q$select public.admin_start('TESTPIN', '$q$ || :'empty_gid' || $q$'::uuid)$q$, 'no_players');
select tests.err($q$select public.admin_pause('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');

select public.admin_start('TESTPIN', :'gid'::uuid) as st \gset
select tests.ok((:'st'::jsonb)->>'status' = 'question', 'arrancó la pregunta 1');
select tests.ok((:'st'::jsonb)->'current_question' ? 'options', 'el teléfono recibe opciones');
select tests.ok(not ((:'st'::jsonb)->'current_question' ? 'correct_index'), 'sin respuesta correcta en el payload');
select tests.ok((:'st'::jsonb)->'reveal' = 'null'::jsonb, 'sin reveal todavía');

-- 7. Responder: Ana acierta (opción 2 en la pregunta 2; en la 1 la correcta es 0), Beto falla, Cami no responde
select tests.ok(((public.submit_answer(:'ana'::uuid, :'ana_t'::uuid, 0, 0))->>'ok')::boolean, 'Ana envió');
select tests.ok(((public.submit_answer(:'beto'::uuid, :'beto_t'::uuid, 0, 1))->>'ok')::boolean, 'Beto envió');
select tests.err($q$select public.submit_answer('$q$ || :'ana' || $q$'::uuid, '$q$ || :'ana_t' || $q$'::uuid, 0, 3)$q$, 'already_answered');
select tests.err($q$select public.submit_answer('$q$ || :'cami' || $q$'::uuid, '$q$ || :'ana_t' || $q$'::uuid, 0, 0)$q$, 'unauthorized');
select tests.err($q$select public.submit_answer('$q$ || :'cami' || $q$'::uuid, '$q$ || :'cami_t' || $q$'::uuid, 3, 0)$q$, 'stale_question');
select tests.err($q$select public.submit_answer('$q$ || :'cami' || $q$'::uuid, '$q$ || :'cami_t' || $q$'::uuid, 0, 9)$q$, 'invalid_choice');

-- mientras corre la pregunta nadie ve si acertó
select public.my_answers(:'ana'::uuid, :'ana_t'::uuid) as mine \gset
select tests.ok((:'mine'::jsonb)->0->>'choice' = '0', 'Ana ve su opción');
select tests.ok((:'mine'::jsonb)->0->'is_correct' = 'null'::jsonb, 'Ana NO ve si acertó antes del reveal');
select tests.ok((select count(*) from public.players where score > 0) = 0, 'puntajes ocultos hasta el reveal');
select tests.err($q$select public.my_answers('$q$ || :'ana' || $q$'::uuid, '$q$ || :'beto_t' || $q$'::uuid)$q$, 'unauthorized');

-- 8. Pausa / reanudar: no se acepta respuesta en pausa
select public.admin_pause('TESTPIN', :'gid'::uuid) as pz \gset
select tests.ok((:'pz'::jsonb)->>'status' = 'paused', 'en pausa');
select tests.ok(((:'pz'::jsonb)->>'paused_remaining_ms')::int between 1 and 30000, 'tiempo restante guardado');
select tests.err($q$select public.submit_answer('$q$ || :'cami' || $q$'::uuid, '$q$ || :'cami_t' || $q$'::uuid, 0, 0)$q$, 'closed');
select public.admin_resume('TESTPIN', :'gid'::uuid) as rs \gset
select tests.ok((:'rs'::jsonb)->>'status' = 'question' and (:'rs'::jsonb)->>'ends_at' is not null, 'reanudada con nuevo fin');

-- 9. Tiempo agotado: se rechaza después del cierre
reset role;
update public.games set ends_at = clock_timestamp() - interval '5 seconds' where id = :'gid'::uuid;
set role anon;
select tests.err($q$select public.submit_answer('$q$ || :'cami' || $q$'::uuid, '$q$ || :'cami_t' || $q$'::uuid, 0, 0)$q$, 'closed');

-- 10. Revelar: se publican la solución y los puntajes
select public.admin_reveal('TESTPIN', :'gid'::uuid) as rv \gset
select tests.ok((:'rv'::jsonb)->>'status' = 'reveal', 'estado reveal');
select tests.ok((:'rv'::jsonb)->'reveal'->>'correct_index' = '0', 'solución publicada');
select tests.ok((:'rv'::jsonb)->'reveal'->'counts' = '[1,1,0,0]'::jsonb, 'conteo por opción');
select tests.ok((select score from public.players where id = :'ana'::uuid) between 100 and 150, 'Ana: 100 a 150 puntos');
select tests.ok((select score from public.players where id = :'beto'::uuid) = 0, 'Beto: 0 puntos');
select public.my_answers(:'ana'::uuid, :'ana_t'::uuid) as mine2 \gset
select tests.ok((:'mine2'::jsonb)->0->>'is_correct' = 'true', 'Ana ya ve su resultado');
select tests.err($q$select public.submit_answer('$q$ || :'cami' || $q$'::uuid, '$q$ || :'cami_t' || $q$'::uuid, 0, 0)$q$, 'closed');

-- 11. Pregunta 2 (correcta = 2): Cami acierta; el reveal ya no vale antes de tiempo
select tests.err($q$select public.admin_reveal('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');
select public.admin_next('TESTPIN', :'gid'::uuid)->>'q_index' as qi \gset
select tests.ok(:'qi' = '1', 'pregunta 2');
select tests.ok(((public.submit_answer(:'cami'::uuid, :'cami_t'::uuid, 1, 2))->>'ok')::boolean, 'Cami responde la 2');
select public.admin_reveal('TESTPIN', :'gid'::uuid) as rv2 \gset
select tests.ok((:'rv2'::jsonb)->'reveal'->>'correct_index' = '2', 'la solución editada se respeta');
select tests.ok((select correct_count from public.players where id = :'cami'::uuid) = 1, 'Cami: 1 acierto');

-- 12. Avanzar hasta el final
select public.admin_next('TESTPIN', :'gid'::uuid) is not null as a \gset
select public.admin_reveal('TESTPIN', :'gid'::uuid) is not null as a \gset
select public.admin_next('TESTPIN', :'gid'::uuid) is not null as a \gset
select public.admin_reveal('TESTPIN', :'gid'::uuid) is not null as a \gset
select public.admin_next('TESTPIN', :'gid'::uuid) is not null as a \gset
select public.admin_reveal('TESTPIN', :'gid'::uuid) is not null as a \gset
select public.admin_next('TESTPIN', :'gid'::uuid)->>'status' as fin \gset
select tests.ok(:'fin' = 'finished', 'partida finalizada tras la 5');
select tests.err($q$select public.join_game('$q$ || :'code' || $q$', 'Tarde')$q$, 'game_finished');
select tests.err($q$select public.admin_finish('TESTPIN', '$q$ || :'gid' || $q$'::uuid)$q$, 'invalid_state');

-- 13. Instantánea del administrador
select public.admin_snapshot('TESTPIN', :'gid'::uuid) as snap \gset
select tests.ok(jsonb_array_length((:'snap'::jsonb)->'answers') = 3, 'snapshot: 3 respuestas');
select tests.ok(jsonb_array_length((:'snap'::jsonb)->'players') = 3, 'snapshot: 3 jugadores');
select tests.ok(jsonb_array_length((:'snap'::jsonb)->'questions') = 5, 'snapshot: 5 preguntas');
select tests.ok((:'snap'::jsonb)->'players'->2->>'name' = 'Beto', 'Beto (0 puntos) queda ultimo en el ranking');
select tests.ok(exists (select 1 from jsonb_array_elements((:'snap'::jsonb)->'players') p where p->>'name' = 'Ana López'), 'nombre normalizado (espacios colapsados)');

-- 14. Moderación y partida nueva
select public.admin_remove_player('TESTPIN', :'beto'::uuid);
select tests.ok((select count(*) from public.players) = 2, 'Beto eliminado');
\echo TODAS LAS PRUEBAS PASARON

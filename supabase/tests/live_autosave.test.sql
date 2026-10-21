begin;
select plan(11);

-- Versions saved in a row by the same writer within five minutes collapse into the last one, so
-- autosave keeps a useful history instead of filling the 50 slots in minutes.
create temp table t (name text primary key, value text);
insert into t values
  ('token', encode(decode(repeat('ab', 32), 'hex'), 'base64')),
  ('hash', encode(extensions.digest(decode(repeat('ab', 32), 'hex'), 'sha256'), 'base64'));
create temp table ids (id text);
insert into ids select sealdown.create_live(encode('v1', 'base64'), '', (select value from t where name = 'hash'));
create function pg_temp.save(base int, writer text) returns int language sql as $$
  select sealdown.save_version((select id from ids), (select value from t where name = 'token'), base, encode('x', 'base64'), '', writer)
$$;
create function pg_temp.versions() returns int[] language sql as $$
  select array_agg(version order by version) from sealdown.live_versions where doc_id = (select id from ids)
$$;

select is(pg_temp.save(1, 'ana'), 2, 'the first save of a run is version 2');
select is(pg_temp.save(2, 'ana'), 3, 'version numbers keep counting');
select is(pg_temp.versions(), array[1, 3], 'the same writer within five minutes replaces their previous version');
select is(pg_temp.save(3, 'bob'), 4, 'another writer saves');
select is(pg_temp.versions(), array[1, 3, 4], 'another writer never replaces a version');
update sealdown.live_versions set created_at = now() - interval '6 minutes', run_start = now() - interval '6 minutes' where doc_id = (select id from ids) and version = 4;
select is(pg_temp.save(4, 'bob'), 5, 'a later save by the same writer');
select is(pg_temp.versions(), array[1, 3, 4, 5], 'after five minutes the previous version stays');
select is(pg_temp.save(5, null), 6, 'saves without a writer still work');

-- A run is anchored on its first save: steady typing keeps one version per five minutes, not one in all.
select pg_temp.save(6, 'cy');
update sealdown.live_versions set created_at = now() - interval '4 minutes', run_start = now() - interval '6 minutes'
  where doc_id = (select id from ids) and version = 7;
select is(pg_temp.save(7, 'cy'), 8, 'a save in a run older than five minutes');
select ok(7 = any(pg_temp.versions()), 'starts a new version even though the previous save is recent');
select ok((select run_start > now() - interval '1 minute' from sealdown.live_versions where doc_id = (select id from ids) and version = 8), 'and a new run');

select * from finish();
rollback;

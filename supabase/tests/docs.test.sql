begin;
select plan(22);

-- Permissions: anon can call the three RPCs and nothing else; the app lives in its own schema.
select has_schema('sealdown', 'sealdown has its own schema');
select hasnt_table('public', 'docs', 'nothing is left in public');
-- Each project in the shared database keeps its migration history in its own schema (dbmate).
select has_table('sealdown', 'schema_migrations', 'migration history lives in the sealdown schema');
select results_eq('select version::text from sealdown.schema_migrations order by version', $$values ('20261014000000'), ('20261021000000'), ('20261022000000')$$, 'applied migrations are recorded');
set local role anon;
select throws_ok('select * from sealdown.docs', '42501', null, 'anon cannot read the table directly');
select throws_ok($$insert into sealdown.docs (id, content) values ('x', '\x00')$$, '42501', null, 'anon cannot write the table directly');
select throws_ok('select sealdown.prune_docs()', '42501', null, 'anon cannot run prune_docs');
select is(sealdown.ping(), 1, 'anon can ping');
select matches(sealdown.create_doc(encode('hello', 'base64')), '^[A-Za-z0-9]{10}$', 'anon can create a doc and gets a 10-char base62 id');
select is(sealdown.get_doc('missingid0'), null, 'unknown id returns null');
reset role;

select ok(has_function_privilege('anon', 'sealdown.get_doc(text)', 'execute'), 'anon can execute get_doc');

-- Content round trip, without the newlines Postgres base64 inserts every 76 chars.
create temp table t_ids (name text primary key, id text);
insert into t_ids values ('long', sealdown.create_doc(encode(convert_to(repeat('abcdefghij', 20), 'UTF8'), 'base64')));
select is(
  sealdown.get_doc((select id from t_ids where name = 'long')),
  replace(encode(convert_to(repeat('abcdefghij', 20), 'UTF8'), 'base64'), E'\n', ''),
  'get_doc returns the stored content as single-line base64'
);
select doesnt_match(sealdown.get_doc((select id from t_ids where name = 'long')), E'\n', 'no newlines in returned base64');

-- get_doc refreshes last_accessed_at.
update sealdown.docs set last_accessed_at = now() - interval '1 day' where id = (select id from t_ids where name = 'long');
select sealdown.get_doc((select id from t_ids where name = 'long'));
select ok(
  (select last_accessed_at > now() - interval '1 minute' from sealdown.docs where id = (select id from t_ids where name = 'long')),
  'get_doc updates last_accessed_at'
);

-- Size cap.
select throws_ok(
  $$select sealdown.create_doc(encode(convert_to(repeat('a', 1048577), 'UTF8'), 'base64'))$$,
  '23514', null, 'content over 1 MB is rejected'
);

-- Prune: three 10-byte docs, cap 25 bytes keeps the two most recently accessed. Live documents
-- share the budget, so none may be around.
delete from sealdown.docs;
delete from sealdown.live_docs;
insert into sealdown.docs (id, content, last_accessed_at) values
  ('old0000000', '\x00000000000000000000', now() - interval '3 days'),
  ('mid0000000', '\x00000000000000000000', now() - interval '2 days'),
  ('new0000000', '\x00000000000000000000', now() - interval '1 day');
select is(sealdown.prune_docs(cap_bytes => 25), 1, 'prune deletes one doc');
select results_eq('select id from sealdown.docs order by id', $$values ('mid0000000'), ('new0000000')$$, 'prune keeps the most recently accessed');
select is(sealdown.prune_docs(), 0, 'default cap deletes nothing when small');
select is((select pg_get_function_arguments('sealdown.prune_docs'::regproc)), 'cap_bytes bigint DEFAULT 104857600', 'default budget is 100 MB');

-- Size guard: refuse inserts once the whole database (shared with other projects) nears the
-- free-tier limit, since prune runs only hourly.
set local sealdown.max_database_bytes = '1';
select throws_ok($$select sealdown.create_doc(encode('x', 'base64'))$$, '53100', null, 'create_doc refuses when the database is over the guard');
reset sealdown.max_database_bytes;
select matches(sealdown.create_doc(encode('x', 'base64')), '^[A-Za-z0-9]{10}$', 'create_doc works under the default guard');

-- Hourly schedule.
select is((select schedule from cron.job where jobname = 'sealdown-prune-docs'), '0 * * * *', 'sealdown-prune-docs runs hourly');

select * from finish();
rollback;

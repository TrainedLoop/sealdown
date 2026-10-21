begin;
select plan(28);

-- A fixed 32-byte write token; the server only ever stores its SHA-256.
create temp table t (name text primary key, value text);
insert into t values
  ('token', encode(decode(repeat('ab', 32), 'hex'), 'base64')),
  ('hash', encode(extensions.digest(decode(repeat('ab', 32), 'hex'), 'sha256'), 'base64')),
  ('wrong', encode(decode(repeat('cd', 32), 'hex'), 'base64'));
create temp table ids (name text primary key, id text);
grant select, insert on t, ids to anon;

set local role anon;
select throws_ok('select * from sealdown.live_docs', '42501', null, 'anon cannot read live_docs directly');
select throws_ok('select * from sealdown.live_versions', '42501', null, 'anon cannot read live_versions directly');
insert into ids values ('a', sealdown.create_live(encode('v1', 'base64'), encode('ana', 'base64'), (select value from t where name = 'hash')));
select matches((select id from ids where name = 'a'), '^[A-Za-z0-9]{10}$', 'create_live returns a 10-char base62 id');
select is(sealdown.live_head((select id from ids where name = 'a')), 1, 'a new live doc is at version 1');
select results_eq(
  $$select version, content, author from sealdown.get_live((select id from ids where name = 'a'))$$,
  $$values (1, encode('v1', 'base64'), encode('ana', 'base64'))$$,
  'get_live returns the latest version'
);
select throws_ok(
  $$select sealdown.save_version((select id from ids where name = 'a'), (select value from t where name = 'wrong'), 1, encode('x', 'base64'), '')$$,
  '42501', null, 'a wrong token cannot save'
);
select throws_ok(
  $$select sealdown.save_version('missing000', (select value from t where name = 'token'), 1, encode('x', 'base64'), '')$$,
  'P0002', null, 'saving to a missing doc fails'
);
select throws_ok(
  $$select sealdown.save_version((select id from ids where name = 'a'), (select value from t where name = 'token'), 0, encode('x', 'base64'), '')$$,
  'PT409', null, 'a stale base is refused (PT409: HTTP 409, never retried by the API layer)'
);
select is(
  sealdown.save_version((select id from ids where name = 'a'), (select value from t where name = 'token'), 1, encode('v2', 'base64'), encode('bob', 'base64')),
  2, 'saving on the latest base creates the next version'
);
select results_eq(
  $$select version, size_bytes from sealdown.list_versions((select id from ids where name = 'a'))$$,
  $$values (2, 2), (1, 2)$$,
  'list_versions is newest first with sizes'
);
select results_eq(
  $$select content from sealdown.get_live_version((select id from ids where name = 'a'), 1)$$,
  $$values (encode('v1', 'base64'))$$,
  'an older version can be read'
);
select is(sealdown.live_head('missing000'), null, 'live_head of a missing doc is null');
select is((select count(*)::int from sealdown.get_live('missing000')), 0, 'get_live of a missing doc is empty');
select throws_ok(
  $$select sealdown.save_version((select id from ids where name = 'a'), (select value from t where name = 'token'), 2, encode(convert_to(repeat('a', 1048577), 'UTF8'), 'base64'), '')$$,
  '23514', null, 'a version over 1 MB is refused'
);
reset role;

select ok(not exists (select 1 from sealdown.live_docs where write_hash = decode((select value from t where name = 'token'), 'base64')), 'the raw token is never stored');

-- The stale error names the latest version.
create function pg_temp.stale_detail() returns text language plpgsql as $$
declare d text;
begin
  perform sealdown.save_version((select id from ids where name = 'a'), (select value from t where name = 'token'), 1, encode('x', 'base64'), '');
  return null;
exception when sqlstate 'PT409' then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;
select is(pg_temp.stale_detail(), '2', 'the stale error detail is the latest version number');

-- get_live refreshes last_accessed_at; live_head does not.
update sealdown.live_docs set last_accessed_at = now() - interval '1 day' where id = (select id from ids where name = 'a');
select sealdown.live_head((select id from ids where name = 'a'));
select ok((select last_accessed_at < now() - interval '1 hour' from sealdown.live_docs where id = (select id from ids where name = 'a')), 'live_head does not count as an access');
select sealdown.get_live((select id from ids where name = 'a'));
select ok((select last_accessed_at > now() - interval '1 minute' from sealdown.live_docs where id = (select id from ids where name = 'a')), 'get_live counts as an access');

-- History keeps the newest 50 versions.
do $$
begin
  for i in 3..55 loop
    perform sealdown.save_version((select id from ids where name = 'a'), (select value from t where name = 'token'), i - 1, encode('v', 'base64'), '');
  end loop;
end $$;
select is((select count(*)::int from sealdown.live_versions where doc_id = (select id from ids where name = 'a')), 50, 'history is capped at 50 versions');
select is((select min(version) from sealdown.live_versions where doc_id = (select id from ids where name = 'a')), 6, 'the oldest versions go first');

-- One budget over fixed and live documents, least recently opened first; live documents go whole.
delete from sealdown.docs;
delete from sealdown.live_docs;
insert into sealdown.docs (id, content, last_accessed_at) values ('fixed00000', '\x00000000000000000000', now() - interval '3 days');
insert into sealdown.live_docs (id, write_hash, last_accessed_at) values ('live000000', '\x00', now() - interval '1 day');
insert into sealdown.live_versions (doc_id, version, content, author) values
  ('live000000', 1, '\x00000000000000000000', ''), ('live000000', 2, '\x00000000000000000000', '');
select is(sealdown.prune_docs(cap_bytes => 25), 1, 'prune deletes the older fixed doc first');
select ok(not exists (select 1 from sealdown.docs), 'the fixed doc is gone');
select is(sealdown.prune_docs(cap_bytes => 15), 1, 'a live doc over the budget is deleted');
select ok(not exists (select 1 from sealdown.live_versions where doc_id = 'live000000'), 'its versions go with it');

-- Saving prunes inline when Sealdown is over its budget.
insert into sealdown.docs (id, content, last_accessed_at) values ('fixed00001', '\x00000000000000000000', now() - interval '3 days');
insert into ids values ('b', sealdown.create_live(encode('b', 'base64'), '', (select value from t where name = 'hash')));
set local sealdown.budget_bytes = '5';
select is(sealdown.save_version((select id from ids where name = 'b'), (select value from t where name = 'token'), 1, encode('b2', 'base64'), ''), 2, 'saving over the budget still saves');
select ok(not exists (select 1 from sealdown.docs where id = 'fixed00001'), 'and prunes the least recently opened first');
reset sealdown.budget_bytes;

-- The whole-database guard refuses new content.
set local sealdown.max_database_bytes = '1';
select throws_ok($$select sealdown.create_live(encode('x', 'base64'), '', 'AA==')$$, '53100', null, 'create_live refuses over the guard');
select throws_ok(
  $$select sealdown.save_version((select id from ids where name = 'b'), (select value from t where name = 'token'), 2, encode('x', 'base64'), '')$$,
  '53100', null, 'save_version refuses over the guard'
);
reset sealdown.max_database_bytes;

select * from finish();
rollback;

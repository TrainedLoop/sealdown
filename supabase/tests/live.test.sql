begin;
select plan(29);

-- A fixed 32-byte write token; the server only ever stores its SHA-256.
create temp table t (name text primary key, value text);
insert into t values
  ('token', encode(decode(repeat('ab', 32), 'hex'), 'base64')),
  ('hash', encode(extensions.digest(decode(repeat('ab', 32), 'hex'), 'sha256'), 'base64')),
  ('wrong', encode(decode(repeat('cd', 32), 'hex'), 'base64'));
create temp table ids (name text primary key, id text);
grant select, insert on t, ids to anon;

-- Permissions: tables unreachable, old RPCs gone.
set local role anon;
select throws_ok('select * from sealdown.live_docs', '42501', null, 'anon cannot read live_docs directly');
select throws_ok('select * from sealdown.live_versions', '42501', null, 'anon cannot read live_versions directly');
reset role;
select hasnt_function('sealdown', 'get_live', array['text'], 'get_live is gone');
select hasnt_function('sealdown', 'save_version', array['text', 'text', 'integer', 'text', 'text', 'text'], 'save_version is gone');
select hasnt_column('sealdown', 'live_versions', 'writer', 'the autosave collapse columns are gone');

-- The current state: one row per document, saved on an optimistic revision.
set local role anon;
insert into ids values ('a', sealdown.create_live(encode('v1', 'base64'), encode('ana', 'base64'), (select value from t where name = 'hash'), null, encode('y1', 'base64')));
select matches((select id from ids where name = 'a'), '^[A-Za-z0-9]{10}$', 'create_live returns a 10-char base62 id');
select results_eq(
  $$select revision, content, state from sealdown.get_state((select id from ids where name = 'a'))$$,
  $$values (1, encode('v1', 'base64'), encode('y1', 'base64'))$$,
  'get_state returns the current state'
);
select is(sealdown.live_head((select id from ids where name = 'a')), 1, 'live_head is the revision');
select throws_ok(
  $$select sealdown.save_state((select id from ids where name = 'a'), (select value from t where name = 'wrong'), 1, encode('x', 'base64'), null)$$,
  '42501', null, 'a wrong token cannot save'
);
select throws_ok(
  $$select sealdown.save_state('missing000', (select value from t where name = 'token'), 1, encode('x', 'base64'), null)$$,
  'P0002', null, 'saving a missing document fails'
);
select throws_ok(
  $$select sealdown.save_state((select id from ids where name = 'a'), (select value from t where name = 'token'), 0, encode('x', 'base64'), null)$$,
  'PT409', null, 'a stale revision is refused (PT409: HTTP 409, never retried by the API layer)'
);
select is(
  sealdown.save_state((select id from ids where name = 'a'), (select value from t where name = 'token'), 1, encode('v2', 'base64'), encode('y2', 'base64')),
  2, 'saving on the current revision moves it on'
);
select results_eq(
  $$select revision, content, state from sealdown.get_state((select id from ids where name = 'a'))$$,
  $$values (2, encode('v2', 'base64'), encode('y2', 'base64'))$$,
  'the new state is stored'
);
select throws_ok(
  $$select sealdown.save_state((select id from ids where name = 'a'), (select value from t where name = 'token'), 2, encode('x', 'base64'), encode(convert_to(repeat('a', 4194305), 'UTF8'), 'base64'))$$,
  '23514', null, 'a state over 4 MB is refused'
);
select is((select count(*)::int from sealdown.get_state('missing000')), 0, 'get_state of a missing document is empty');
select is(sealdown.live_head('missing000'), null, 'live_head of a missing document is null');
reset role;

-- The stale error names the current revision.
create function pg_temp.stale_detail() returns text language plpgsql as $$
declare d text;
begin
  perform sealdown.save_state((select id from ids where name = 'a'), (select value from t where name = 'token'), 1, encode('x', 'base64'), null);
  return null;
exception when sqlstate 'PT409' then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;
select is(pg_temp.stale_detail(), '2', 'the stale error detail is the current revision');

-- Checkpoints: the history.
set local role anon;
select is(
  (select count(*)::int from sealdown.list_versions((select id from ids where name = 'a'))),
  1, 'a new document has its first checkpoint'
);
select is(
  sealdown.add_checkpoint((select id from ids where name = 'a'), (select value from t where name = 'token'), encode('c', 'base64'), encode('names', 'base64')),
  1, 'an automatic checkpoint within 60 s of the last returns that one'
);
select throws_ok(
  $$select sealdown.add_checkpoint((select id from ids where name = 'a'), (select value from t where name = 'wrong'), encode('c', 'base64'), '')$$,
  '42501', null, 'a wrong token cannot add checkpoints'
);
select is(
  sealdown.add_checkpoint((select id from ids where name = 'a'), (select value from t where name = 'token'), encode('named', 'base64'), '', encode('Approved', 'base64')),
  2, 'a named version is always added'
);
select results_eq(
  $$select version, label from sealdown.list_versions((select id from ids where name = 'a'))$$,
  $$values (2, encode('Approved', 'base64')), (1, null::text)$$,
  'list_versions shows labels, newest first'
);
select results_eq(
  $$select content, label from sealdown.get_live_version((select id from ids where name = 'a'), 2)$$,
  $$values (encode('named', 'base64'), encode('Approved', 'base64'))$$,
  'a checkpoint can be read with its label'
);
reset role;

-- 55 automatic checkpoints keep the newest 50; the named one survives.
do $$
begin
  for i in 1..55 loop
    update sealdown.live_versions set created_at = created_at - interval '2 minutes' where doc_id = (select id from ids where name = 'a');
    perform sealdown.add_checkpoint((select id from ids where name = 'a'), (select value from t where name = 'token'), encode('auto', 'base64'), '');
  end loop;
end $$;
select is((select count(*)::int from sealdown.live_versions where doc_id = (select id from ids where name = 'a') and label is null), 50, 'automatic checkpoints are capped at 50');
select ok(exists (select 1 from sealdown.live_versions where doc_id = (select id from ids where name = 'a') and version = 2), 'named versions never rotate out');

-- One budget over fixed and live documents (current state and checkpoints counted), live ones go whole.
delete from sealdown.docs;
delete from sealdown.live_docs;
insert into sealdown.docs (id, content, last_accessed_at) values ('fixed00000', '\x00000000000000000000', now() - interval '3 days');
insert into sealdown.live_docs (id, write_hash, content, last_accessed_at) values ('live000000', '\x00', '\x0000000000', now() - interval '1 day');
insert into sealdown.live_versions (doc_id, version, content, author) values ('live000000', 1, '\x0000000000', '');
select is(sealdown.prune_docs(cap_bytes => 15), 1, 'prune deletes the older fixed document first');
select is(sealdown.prune_docs(cap_bytes => 5), 1, 'a live document over the budget goes');
select ok(not exists (select 1 from sealdown.live_versions where doc_id = 'live000000'), 'with its checkpoints');

-- The whole-database guard refuses new content.
insert into ids values ('b', sealdown.create_live(encode('b', 'base64'), '', (select value from t where name = 'hash')));
set local sealdown.max_database_bytes = '1';
select throws_ok(
  $$select sealdown.save_state((select id from ids where name = 'b'), (select value from t where name = 'token'), 1, encode('x', 'base64'), null)$$,
  '53100', null, 'save_state refuses over the guard'
);
reset sealdown.max_database_bytes;

select * from finish();
rollback;

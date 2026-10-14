begin;
select plan(15);

-- Permissions: anon can call the three public RPCs and nothing else.
set local role anon;
select throws_ok('select * from public.docs', '42501', null, 'anon cannot read the table directly');
select throws_ok($$insert into public.docs (id, content) values ('x', '\x00')$$, '42501', null, 'anon cannot write the table directly');
select throws_ok('select public.prune_docs()', '42501', null, 'anon cannot run prune_docs');
select is(public.ping(), 1, 'anon can ping');
select matches(public.create_doc(encode('hello', 'base64')), '^[A-Za-z0-9]{10}$', 'anon can create a doc and gets a 10-char base62 id');
select is(public.get_doc('missingid0'), null, 'unknown id returns null');
reset role;

select ok(has_function_privilege('anon', 'public.get_doc(text)', 'execute'), 'anon can execute get_doc');

-- Content round trip, without the newlines Postgres base64 inserts every 76 chars.
create temp table t_ids (name text primary key, id text);
insert into t_ids values ('long', public.create_doc(encode(convert_to(repeat('abcdefghij', 20), 'UTF8'), 'base64')));
select is(
  public.get_doc((select id from t_ids where name = 'long')),
  replace(encode(convert_to(repeat('abcdefghij', 20), 'UTF8'), 'base64'), E'\n', ''),
  'get_doc returns the stored content as single-line base64'
);
select doesnt_match(public.get_doc((select id from t_ids where name = 'long')), E'\n', 'no newlines in returned base64');

-- get_doc refreshes last_accessed_at.
update public.docs set last_accessed_at = now() - interval '1 day' where id = (select id from t_ids where name = 'long');
select public.get_doc((select id from t_ids where name = 'long'));
select ok(
  (select last_accessed_at > now() - interval '1 minute' from public.docs where id = (select id from t_ids where name = 'long')),
  'get_doc updates last_accessed_at'
);

-- Size cap.
select throws_ok(
  $$select public.create_doc(encode(convert_to(repeat('a', 1048577), 'UTF8'), 'base64'))$$,
  '23514', null, 'content over 1 MB is rejected'
);

-- Prune: three 10-byte docs, cap 25 bytes keeps the two most recently accessed.
delete from public.docs;
insert into public.docs (id, content, last_accessed_at) values
  ('old0000000', '\x00000000000000000000', now() - interval '3 days'),
  ('mid0000000', '\x00000000000000000000', now() - interval '2 days'),
  ('new0000000', '\x00000000000000000000', now() - interval '1 day');
select is(public.prune_docs(cap_bytes => 25), 1, 'prune deletes one doc');
select results_eq('select id from public.docs order by id', $$values ('mid0000000'), ('new0000000')$$, 'prune keeps the most recently accessed');
select is(public.prune_docs(), 0, 'default cap deletes nothing when small');

-- Hourly schedule.
select is((select schedule from cron.job where jobname = 'prune-docs'), '0 * * * *', 'prune-docs runs hourly');

select * from finish();
rollback;

begin;
select plan(5);

-- Password-protected live documents keep a public salt so every browser derives the same key.
set local role anon;
create temp table ids (name text primary key, id text);
insert into ids values
  ('plain', sealdown.create_live(encode('a', 'base64'), '', 'AA==')),
  ('locked', sealdown.create_live(encode('b', 'base64'), '', 'AA==', encode(decode(repeat('5a', 16), 'hex'), 'base64')));
select is(sealdown.live_salt((select id from ids where name = 'plain')), null, 'a document without a password has no salt');
select is(sealdown.live_salt((select id from ids where name = 'locked')), encode(decode(repeat('5a', 16), 'hex'), 'base64'), 'the salt comes back as base64');
select is(sealdown.live_salt('missing000'), null, 'a missing document has no salt');
select throws_ok(
  $$select sealdown.create_live(encode('c', 'base64'), '', 'AA==', encode(decode(repeat('5a', 64), 'hex'), 'base64'))$$,
  '23514', null, 'salts are at most 32 bytes'
);
reset role;
select ok(has_function_privilege('anon', 'sealdown.live_salt(text)', 'execute'), 'anon can read salts');

select * from finish();
rollback;

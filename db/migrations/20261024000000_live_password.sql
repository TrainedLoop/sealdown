-- migrate:up
-- Password-protected live documents: the content key is derived from a password (PBKDF2, as for
-- sealed links) with a per-document salt kept here, so every browser derives the same key. The
-- salt is public; neither the password nor the key ever reaches the server.
alter table sealdown.live_docs add column salt bytea,
  add constraint salt_max_32 check (octet_length(salt) <= 32);

drop function sealdown.create_live(text, text, text);

create function sealdown.create_live(content text, author text, write_hash text, salt text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  bytes bytea;
  new_id text;
begin
  perform sealdown.make_room();
  loop
    bytes := extensions.gen_random_bytes(10);
    new_id := '';
    for i in 0..9 loop
      new_id := new_id || substr(alphabet, get_byte(bytes, i) % 62 + 1, 1);
    end loop;
    begin
      insert into sealdown.live_docs (id, write_hash, salt)
      values (new_id, decode(create_live.write_hash, 'base64'), decode(create_live.salt, 'base64'));
      exit;
    exception when unique_violation then
      -- Astronomically unlikely; draw another id.
    end;
  end loop;
  insert into sealdown.live_versions (doc_id, version, content, author)
  values (new_id, 1, decode(create_live.content, 'base64'), decode(create_live.author, 'base64'));
  return new_id;
end $$;

-- The salt of a password-protected document (null without a password, or when missing).
create function sealdown.live_salt(doc_id text) returns text
language sql security definer set search_path = '' as $$
  select replace(encode(d.salt, 'base64'), E'\n', '') from sealdown.live_docs d where d.id = live_salt.doc_id;
$$;

revoke execute on function sealdown.create_live(text, text, text, text), sealdown.live_salt(text) from public, authenticated;
grant execute on function sealdown.create_live(text, text, text, text), sealdown.live_salt(text) to anon;

-- migrate:down
drop function sealdown.live_salt(text), sealdown.create_live(text, text, text, text);
alter table sealdown.live_docs drop column salt;

create function sealdown.create_live(content text, author text, write_hash text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  bytes bytea;
  new_id text;
begin
  perform sealdown.make_room();
  loop
    bytes := extensions.gen_random_bytes(10);
    new_id := '';
    for i in 0..9 loop
      new_id := new_id || substr(alphabet, get_byte(bytes, i) % 62 + 1, 1);
    end loop;
    begin
      insert into sealdown.live_docs (id, write_hash) values (new_id, decode(create_live.write_hash, 'base64'));
      exit;
    exception when unique_violation then
      -- Astronomically unlikely; draw another id.
    end;
  end loop;
  insert into sealdown.live_versions (doc_id, version, content, author)
  values (new_id, 1, decode(create_live.content, 'base64'), decode(create_live.author, 'base64'));
  return new_id;
end $$;

revoke execute on function sealdown.create_live(text, text, text) from public, authenticated;
grant execute on function sealdown.create_live(text, text, text) to anon;

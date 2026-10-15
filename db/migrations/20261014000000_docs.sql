-- migrate:up
-- sealdown lives in its own schema: the Supabase project (and its 500 MB free-tier database) is
-- shared with other small projects, each in a schema of its own.
--
-- Encrypted documents shared by link. The server only ever sees ciphertext:
-- the decryption key lives in the URL fragment, which browsers never send.
create schema if not exists sealdown;  -- dbmate may have created it for its history table
grant usage on schema sealdown to anon;

create table sealdown.docs (
  id               text primary key,         -- 10 random base62 characters
  content          bytea not null,            -- IV + compressed, encrypted content
  created_at       timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  constraint content_max_1mb check (octet_length(content) <= 1048576)
);

create index docs_last_accessed_at_idx on sealdown.docs (last_accessed_at desc);

-- No policies: the table is unreachable through the API. Access goes only through the functions below.
alter table sealdown.docs enable row level security;
revoke all on table sealdown.docs from anon, authenticated;

-- Takes the encrypted bytes as standard base64 and returns the new id.
-- Pruning runs hourly, so a burst of uploads could push the shared database past the free-tier
-- limit, which makes it read-only for every project in it. Above the guard, new documents are
-- refused and clients fall back to links that carry the whole document.
-- sealdown.max_database_bytes exists so tests can lower the guard.
create function sealdown.create_doc(content text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  max_bytes bigint := coalesce(nullif(current_setting('sealdown.max_database_bytes', true), '')::bigint, 471859200);
  bytes bytea;
  new_id text;
begin
  if pg_catalog.pg_database_size(pg_catalog.current_database()) > max_bytes then
    raise exception 'database is near its size limit' using errcode = '53100';
  end if;
  loop
    bytes := extensions.gen_random_bytes(10);
    new_id := '';
    for i in 0..9 loop
      new_id := new_id || substr(alphabet, get_byte(bytes, i) % 62 + 1, 1);
    end loop;
    begin
      insert into sealdown.docs (id, content) values (new_id, decode(create_doc.content, 'base64'));
      return new_id;
    exception when unique_violation then
      -- Astronomically unlikely; draw another id.
    end;
  end loop;
end $$;

-- Returns the content as single-line standard base64 (null when missing) and marks it as accessed,
-- which protects frequently opened documents from pruning.
create function sealdown.get_doc(doc_id text) returns text
language sql security definer set search_path = '' as $$
  update sealdown.docs set last_accessed_at = now() where id = doc_id
  returning replace(encode(content, 'base64'), E'\n', '');
$$;

-- Trivial query used by the keepalive workflow so the free-tier project doesn't pause.
create function sealdown.ping() returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from sealdown.docs limit 1;
  return 1;
end $$;

-- Deletes the least recently accessed documents until sealdown's content fits its budget
-- (100 MB by default, leaving room for the other projects in the database).
create function sealdown.prune_docs(cap_bytes bigint default 104857600) returns int
language plpgsql security definer set search_path = '' as $$
declare
  deleted int;
begin
  delete from sealdown.docs where id in (
    select id from (
      select id, sum(octet_length(content)) over (order by last_accessed_at desc, id) as running
      from sealdown.docs
    ) t where running > cap_bytes
  );
  get diagnostics deleted = row_count;
  return deleted;
end $$;

revoke execute on all functions in schema sealdown from public, anon, authenticated;
grant execute on function sealdown.create_doc(text), sealdown.get_doc(text), sealdown.ping() to anon;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('sealdown-prune-docs', '0 * * * *', 'select sealdown.prune_docs()');

-- migrate:down
select cron.unschedule('sealdown-prune-docs');
drop table sealdown.docs;
drop function sealdown.create_doc(text), sealdown.get_doc(text), sealdown.ping(), sealdown.prune_docs(bigint);

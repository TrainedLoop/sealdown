-- migrate:up
-- Live documents: several people keep one encrypted document up to date, each version a whole
-- encrypted snapshot. The edit link carries a write token; only its SHA-256 is stored here, so the
-- read link (and a leaked database) can't save. The content key never reaches the server.

create table sealdown.live_docs (
  id               text primary key,         -- 10 random base62 characters
  write_hash       bytea not null,            -- SHA-256 of the write token
  created_at       timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

create table sealdown.live_versions (
  doc_id     text not null references sealdown.live_docs on delete cascade,
  version    int not null,
  content    bytea not null,                  -- IV + compressed, encrypted document
  author     bytea not null,                  -- IV + encrypted author card (may be empty)
  created_at timestamptz not null default now(),
  primary key (doc_id, version),
  constraint content_max_1mb check (octet_length(content) <= 1048576),
  constraint author_max_1kb check (octet_length(author) <= 1024)
);

create index live_docs_last_accessed_at_idx on sealdown.live_docs (last_accessed_at desc);

alter table sealdown.live_docs enable row level security;
alter table sealdown.live_versions enable row level security;
revoke all on table sealdown.live_docs, sealdown.live_versions from anon, authenticated;

-- One budget over fixed and live documents: the least recently opened go first, live documents
-- whole (their versions summed). Replaces the fixed-only version.
create or replace function sealdown.prune_docs(cap_bytes bigint default 104857600) returns int
language sql security definer set search_path = '' as $$
  with everything as (
    select 'fixed' as kind, d.id, octet_length(d.content)::bigint as bytes, d.last_accessed_at from sealdown.docs d
    union all
    select 'live', l.id, coalesce(sum(octet_length(v.content) + octet_length(v.author)), 0)::bigint, l.last_accessed_at
    from sealdown.live_docs l left join sealdown.live_versions v on v.doc_id = l.id
    group by l.id, l.last_accessed_at
  ),
  victims as (
    select kind, id from (
      select kind, id, sum(bytes) over (order by last_accessed_at desc, kind, id) as running from everything
    ) ranked where running > cap_bytes
  ),
  fixed as (delete from sealdown.docs where id in (select id from victims where kind = 'fixed') returning 1),
  live as (delete from sealdown.live_docs where id in (select id from victims where kind = 'live') returning 1)
  select ((select count(*) from fixed) + (select count(*) from live))::int;
$$;

-- Refuses new content near the shared database's limit (as create_doc), and prunes Sealdown right
-- away when it is over its own budget instead of waiting for the hourly job.
-- sealdown.budget_bytes exists so tests can lower the budget.
create function sealdown.make_room() returns void
language plpgsql security definer set search_path = '' as $$
declare
  max_bytes bigint := coalesce(nullif(current_setting('sealdown.max_database_bytes', true), '')::bigint, 471859200);
  budget bigint := coalesce(nullif(current_setting('sealdown.budget_bytes', true), '')::bigint, 104857600);
  used bigint;
begin
  if pg_catalog.pg_database_size(pg_catalog.current_database()) > max_bytes then
    raise exception 'database is near its size limit' using errcode = '53100';
  end if;
  select coalesce((select sum(octet_length(content)) from sealdown.docs), 0)
       + coalesce((select sum(octet_length(content) + octet_length(author)) from sealdown.live_versions), 0)
    into used;
  if used > budget then
    perform sealdown.prune_docs(budget);
  end if;
end $$;

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

-- The latest version (empty when the document is gone); counts as an access, which protects the
-- document from pruning.
create function sealdown.get_live(doc_id text)
returns table (version int, content text, author text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  update sealdown.live_docs set last_accessed_at = now() where id = get_live.doc_id;
  return query
    select v.version, replace(encode(v.content, 'base64'), E'\n', ''), replace(encode(v.author, 'base64'), E'\n', ''), v.created_at
    from sealdown.live_versions v where v.doc_id = get_live.doc_id
    order by v.version desc limit 1;
end $$;

-- The latest version number only, for polling. Not an access.
create function sealdown.live_head(doc_id text) returns int
language sql security definer set search_path = '' as $$
  select max(v.version) from sealdown.live_versions v where v.doc_id = live_head.doc_id;
$$;

create function sealdown.get_live_version(doc_id text, version int)
returns table (content text, author text, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select replace(encode(v.content, 'base64'), E'\n', ''), replace(encode(v.author, 'base64'), E'\n', ''), v.created_at
  from sealdown.live_versions v where v.doc_id = get_live_version.doc_id and v.version = get_live_version.version;
$$;

create function sealdown.list_versions(doc_id text)
returns table (version int, author text, size_bytes int, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select v.version, replace(encode(v.author, 'base64'), E'\n', ''), octet_length(v.content), v.created_at
  from sealdown.live_versions v where v.doc_id = list_versions.doc_id
  order by v.version desc;
$$;

-- Saves on top of base_version. Errors: 42501 wrong token, P0002 no such document, 40001 base is
-- not the latest (detail = latest version), 53100 database near its limit, 23514 over 1 MB.
create function sealdown.save_version(doc_id text, write_token text, base_version int, content text, author text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  stored_hash bytea;
  latest int;
begin
  -- Locks the document so concurrent saves on the same base can't both win.
  select d.write_hash into stored_hash from sealdown.live_docs d where d.id = save_version.doc_id for update;
  if not found then
    raise exception 'no such document' using errcode = 'P0002';
  end if;
  if extensions.digest(decode(save_version.write_token, 'base64'), 'sha256') <> stored_hash then
    raise exception 'wrong write token' using errcode = '42501';
  end if;
  select max(v.version) into latest from sealdown.live_versions v where v.doc_id = save_version.doc_id;
  if latest <> save_version.base_version then
    raise exception 'stale base version' using errcode = '40001', detail = latest::text;
  end if;
  -- An access first, so making room never removes the document being saved.
  update sealdown.live_docs set last_accessed_at = now() where id = save_version.doc_id;
  perform sealdown.make_room();
  insert into sealdown.live_versions (doc_id, version, content, author)
  values (save_version.doc_id, latest + 1, decode(save_version.content, 'base64'), decode(save_version.author, 'base64'));
  delete from sealdown.live_versions v where v.doc_id = save_version.doc_id and v.version <= latest + 1 - 50;
  return latest + 1;
end $$;

revoke execute on all functions in schema sealdown from public, anon, authenticated;
grant execute on function
  sealdown.create_doc(text), sealdown.get_doc(text), sealdown.ping(),
  sealdown.create_live(text, text, text), sealdown.get_live(text), sealdown.live_head(text),
  sealdown.get_live_version(text, int), sealdown.list_versions(text), sealdown.save_version(text, text, int, text, text)
to anon;

-- migrate:down
drop function sealdown.create_live(text, text, text), sealdown.get_live(text), sealdown.live_head(text),
  sealdown.get_live_version(text, int), sealdown.list_versions(text), sealdown.save_version(text, text, int, text, text),
  sealdown.make_room();
drop table sealdown.live_versions, sealdown.live_docs;

create or replace function sealdown.prune_docs(cap_bytes bigint default 104857600) returns int
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

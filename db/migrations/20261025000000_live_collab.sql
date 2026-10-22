-- migrate:up
-- Real-time collaboration (docs/superpowers/specs/2026-10-22-sealdown-live-collab-design.md).
-- A live document now has one *current state* (encrypted text, plus the encrypted Yjs state for
-- Markdown) saved on an optimistic revision, and a *history* of checkpoints: automatic ones every
-- few minutes of activity and named ones that never rotate out. The per-save versions and their
-- writer-collapse columns go; nothing used them yet.

alter table sealdown.live_docs
  add column content bytea,
  add column state bytea,
  add column revision int not null default 1,
  add column state_at timestamptz not null default now(),
  -- The editors' Ed25519 public key (derived from the write token): lets readers check signatures.
  add column sign_key bytea,
  add constraint sign_key_max_64 check (octet_length(sign_key) <= 64),
  add constraint content_max_1mb check (octet_length(content) <= 1048576),
  add constraint state_max_4mb check (octet_length(state) <= 4194304);

-- Existing documents start from their newest version.
update sealdown.live_docs d set content = v.content, state_at = v.created_at
from (
  select distinct on (doc_id) doc_id, content, created_at from sealdown.live_versions order by doc_id, version desc
) v
where v.doc_id = d.id;
alter table sealdown.live_docs alter column content set not null;

alter table sealdown.live_versions
  drop column writer,
  drop column run_start,
  add column label bytea,
  add constraint label_max_1kb check (octet_length(label) <= 1024);

drop function sealdown.get_live(text), sealdown.save_version(text, text, int, text, text, text),
  sealdown.create_live(text, text, text, text), sealdown.live_head(text),
  sealdown.list_versions(text), sealdown.get_live_version(text, int);

-- One budget over fixed and live documents (current state and checkpoints), least recently opened
-- first; live documents go whole.
create or replace function sealdown.prune_docs(cap_bytes bigint default 104857600) returns int
language sql security definer set search_path = '' as $$
  with everything as (
    select 'fixed' as kind, d.id, octet_length(d.content)::bigint as bytes, d.last_accessed_at from sealdown.docs d
    union all
    select 'live', l.id,
      (coalesce(octet_length(l.content), 0) + coalesce(octet_length(l.state), 0)
        + coalesce((select sum(octet_length(v.content) + octet_length(v.author) + coalesce(octet_length(v.label), 0))
                    from sealdown.live_versions v where v.doc_id = l.id), 0))::bigint,
      l.last_accessed_at
    from sealdown.live_docs l
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

create or replace function sealdown.make_room() returns void
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
       + coalesce((select sum(octet_length(content) + coalesce(octet_length(state), 0)) from sealdown.live_docs), 0)
       + coalesce((select sum(octet_length(content) + octet_length(author)) from sealdown.live_versions), 0)
    into used;
  if used > budget then
    perform sealdown.prune_docs(budget);
  end if;
end $$;

create function sealdown.create_live(content text, author text, write_hash text, salt text default null, state text default null, sign_key text default null) returns text
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
      insert into sealdown.live_docs (id, write_hash, salt, content, state, sign_key)
      values (new_id, decode(create_live.write_hash, 'base64'), decode(create_live.salt, 'base64'),
              decode(create_live.content, 'base64'), decode(create_live.state, 'base64'), decode(create_live.sign_key, 'base64'));
      exit;
    exception when unique_violation then
      -- Astronomically unlikely; draw another id.
    end;
  end loop;
  insert into sealdown.live_versions (doc_id, version, content, author)
  values (new_id, 1, decode(create_live.content, 'base64'), decode(create_live.author, 'base64'));
  return new_id;
end $$;

-- The current state (empty when the document is gone); counts as an access.
create function sealdown.get_state(doc_id text)
returns table (revision int, content text, state text, state_at timestamptz, sign_key text)
language plpgsql security definer set search_path = '' as $$
begin
  update sealdown.live_docs set last_accessed_at = now() where id = get_state.doc_id;
  return query
    select d.revision, replace(encode(d.content, 'base64'), E'\n', ''), replace(encode(d.state, 'base64'), E'\n', ''), d.state_at,
           replace(encode(d.sign_key, 'base64'), E'\n', '')
    from sealdown.live_docs d where d.id = get_state.doc_id;
end $$;

-- The current revision only, for the backup poll. Not an access.
create function sealdown.live_head(doc_id text) returns int
language sql security definer set search_path = '' as $$
  select d.revision from sealdown.live_docs d where d.id = live_head.doc_id;
$$;

-- Saves the current state on top of base_revision. Errors: 42501 wrong token, P0002 no such
-- document, PT409 base is not current (detail = current revision), 53100 database near its limit,
-- 23514 too large.
-- `sign_key` is stored only when the document has none yet (documents from before signatures).
create function sealdown.save_state(doc_id text, write_token text, base_revision int, content text, state text, sign_key text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  stored_hash bytea;
  current_revision int;
begin
  select d.write_hash, d.revision into stored_hash, current_revision from sealdown.live_docs d where d.id = save_state.doc_id for update;
  if not found then
    raise exception 'no such document' using errcode = 'P0002';
  end if;
  if extensions.digest(decode(save_state.write_token, 'base64'), 'sha256') <> stored_hash then
    raise exception 'wrong write token' using errcode = '42501';
  end if;
  if current_revision <> save_state.base_revision then
    raise exception 'stale base revision' using errcode = 'PT409', detail = current_revision::text;
  end if;
  -- An access first, so making room never removes the document being saved.
  update sealdown.live_docs set last_accessed_at = now() where id = save_state.doc_id;
  perform sealdown.make_room();
  update sealdown.live_docs
    set content = decode(save_state.content, 'base64'), state = decode(save_state.state, 'base64'),
        revision = current_revision + 1, state_at = now(),
        sign_key = coalesce(sealdown.live_docs.sign_key, decode(save_state.sign_key, 'base64'))
    where id = save_state.doc_id;
  return current_revision + 1;
end $$;

-- Adds a checkpoint to the history. An automatic one (no label) within 60 s of the last automatic
-- one is skipped (several editors may ask at once): that one's number is returned. The newest 50
-- automatic checkpoints are kept; named ones never rotate out.
create function sealdown.add_checkpoint(doc_id text, write_token text, content text, authors text, label text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  stored_hash bytea;
  recent int;
  next_version int;
begin
  select d.write_hash into stored_hash from sealdown.live_docs d where d.id = add_checkpoint.doc_id for update;
  if not found then
    raise exception 'no such document' using errcode = 'P0002';
  end if;
  if extensions.digest(decode(add_checkpoint.write_token, 'base64'), 'sha256') <> stored_hash then
    raise exception 'wrong write token' using errcode = '42501';
  end if;
  if add_checkpoint.label is null then
    select max(v.version) into recent from sealdown.live_versions v
    where v.doc_id = add_checkpoint.doc_id and v.label is null and v.created_at > now() - interval '60 seconds';
    if recent is not null then
      return recent;
    end if;
  end if;
  perform sealdown.make_room();
  select coalesce(max(v.version), 0) + 1 into next_version from sealdown.live_versions v where v.doc_id = add_checkpoint.doc_id;
  insert into sealdown.live_versions (doc_id, version, content, author, label)
  values (add_checkpoint.doc_id, next_version, decode(add_checkpoint.content, 'base64'), decode(add_checkpoint.authors, 'base64'),
          decode(add_checkpoint.label, 'base64'));
  delete from sealdown.live_versions v
  where v.doc_id = add_checkpoint.doc_id and v.label is null and v.version not in (
    select k.version from sealdown.live_versions k
    where k.doc_id = add_checkpoint.doc_id and k.label is null order by k.version desc limit 50
  );
  return next_version;
end $$;

create function sealdown.get_live_version(doc_id text, version int)
returns table (content text, author text, label text, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select replace(encode(v.content, 'base64'), E'\n', ''), replace(encode(v.author, 'base64'), E'\n', ''),
         replace(encode(v.label, 'base64'), E'\n', ''), v.created_at
  from sealdown.live_versions v where v.doc_id = get_live_version.doc_id and v.version = get_live_version.version;
$$;

create function sealdown.list_versions(doc_id text)
returns table (version int, author text, label text, size_bytes int, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select v.version, replace(encode(v.author, 'base64'), E'\n', ''), replace(encode(v.label, 'base64'), E'\n', ''),
         octet_length(v.content), v.created_at
  from sealdown.live_versions v where v.doc_id = list_versions.doc_id
  order by v.version desc;
$$;

revoke execute on all functions in schema sealdown from public, anon, authenticated;
grant execute on function
  sealdown.create_doc(text), sealdown.get_doc(text), sealdown.ping(),
  sealdown.create_live(text, text, text, text, text, text), sealdown.get_state(text), sealdown.live_head(text),
  sealdown.save_state(text, text, int, text, text, text), sealdown.add_checkpoint(text, text, text, text, text),
  sealdown.get_live_version(text, int), sealdown.list_versions(text), sealdown.live_salt(text)
to anon;

-- migrate:down
drop function sealdown.create_live(text, text, text, text, text, text), sealdown.get_state(text), sealdown.live_head(text),
  sealdown.save_state(text, text, int, text, text, text), sealdown.add_checkpoint(text, text, text, text, text),
  sealdown.get_live_version(text, int), sealdown.list_versions(text);

alter table sealdown.live_versions drop column label,
  add column writer text, add column run_start timestamptz not null default now(),
  add constraint writer_max_64 check (octet_length(writer) <= 64);
alter table sealdown.live_docs drop column content, drop column state, drop column revision, drop column state_at, drop column sign_key;

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
create or replace function sealdown.make_room() returns void
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

create or replace function sealdown.create_live(content text, author text, write_hash text, salt text default null) returns text
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

-- The latest version (empty when the document is gone); counts as an access, which protects the
-- document from pruning.
create or replace function sealdown.get_live(doc_id text)
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
create or replace function sealdown.live_head(doc_id text) returns int
language sql security definer set search_path = '' as $$
  select max(v.version) from sealdown.live_versions v where v.doc_id = live_head.doc_id;
$$;

create or replace function sealdown.get_live_version(doc_id text, version int)
returns table (content text, author text, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select replace(encode(v.content, 'base64'), E'\n', ''), replace(encode(v.author, 'base64'), E'\n', ''), v.created_at
  from sealdown.live_versions v where v.doc_id = get_live_version.doc_id and v.version = get_live_version.version;
$$;

create or replace function sealdown.list_versions(doc_id text)
returns table (version int, author text, size_bytes int, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select v.version, replace(encode(v.author, 'base64'), E'\n', ''), octet_length(v.content), v.created_at
  from sealdown.live_versions v where v.doc_id = list_versions.doc_id
  order by v.version desc;
$$;

-- Saves on top of base_version. `writer` is a random id per browser (not a name), used only to
-- collapse a run of autosaves. Errors: 42501 wrong token, P0002 no such document, PT409 base is
-- not the latest (detail = latest version), 53100 database near its limit, 23514 over 1 MB.
create or replace function sealdown.save_version(doc_id text, write_token text, base_version int, content text, author text, writer text default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  stored_hash bytea;
  latest int;
  previous record;
  collapse boolean;
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
    raise exception 'stale base version' using errcode = 'PT409', detail = latest::text;
  end if;
  -- An access first, so making room never removes the document being saved.
  update sealdown.live_docs set last_accessed_at = now() where id = save_version.doc_id;
  perform sealdown.make_room();
  -- Autosave: a save by the same writer in a run that started under five minutes ago replaces their
  -- previous version, so steady typing keeps one version per five minutes. Clients merge against
  -- the base text they keep, never a fetched old version, so removing it is safe.
  select v.writer, v.run_start into previous from sealdown.live_versions v
  where v.doc_id = save_version.doc_id and v.version = latest;
  collapse := save_version.writer is not null and previous.writer = save_version.writer
    and previous.run_start > now() - interval '5 minutes';
  insert into sealdown.live_versions (doc_id, version, content, author, writer, run_start)
  values (save_version.doc_id, latest + 1, decode(save_version.content, 'base64'), decode(save_version.author, 'base64'),
          save_version.writer, case when collapse then previous.run_start else now() end);
  if collapse then
    delete from sealdown.live_versions v where v.doc_id = save_version.doc_id and v.version = latest;
  end if;
  delete from sealdown.live_versions v where v.doc_id = save_version.doc_id and v.version <= latest + 1 - 50;
  return latest + 1;
end $$;

revoke execute on all functions in schema sealdown from public, anon, authenticated;
grant execute on function
  sealdown.create_doc(text), sealdown.get_doc(text), sealdown.ping(),
  sealdown.create_live(text, text, text, text), sealdown.get_live(text), sealdown.live_head(text),
  sealdown.get_live_version(text, int), sealdown.list_versions(text), sealdown.save_version(text, text, int, text, text, text),
  sealdown.live_salt(text)
to anon;

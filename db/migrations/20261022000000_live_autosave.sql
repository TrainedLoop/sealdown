-- migrate:up
-- Live documents save on their own (autosave). A run of saves by the same browser within five
-- minutes keeps only its last version, so the 50-version history stays useful.
alter table sealdown.live_versions add column writer text,
  -- When the run of saves this version belongs to started: a run lasts at most five minutes.
  add column run_start timestamptz not null default now(),
  add constraint writer_max_64 check (octet_length(writer) <= 64);

drop function sealdown.save_version(text, text, int, text, text);

-- Saves on top of base_version. `writer` is a random id per browser (not a name), used only to
-- collapse a run of autosaves. Errors: 42501 wrong token, P0002 no such document, 40001 base is
-- not the latest (detail = latest version), 53100 database near its limit, 23514 over 1 MB.
create function sealdown.save_version(doc_id text, write_token text, base_version int, content text, author text, writer text default null) returns int
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
    raise exception 'stale base version' using errcode = '40001', detail = latest::text;
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

revoke execute on function sealdown.save_version(text, text, int, text, text, text) from public, authenticated;
grant execute on function sealdown.save_version(text, text, int, text, text, text) to anon;

-- migrate:down
drop function sealdown.save_version(text, text, int, text, text, text);
alter table sealdown.live_versions drop column writer, drop column run_start;

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

revoke execute on function sealdown.save_version(text, text, int, text, text) from public, authenticated;
grant execute on function sealdown.save_version(text, text, int, text, text) to anon;

-- One-off (2026-10-15): the product was renamed from rendermd to Sealdown. Moves everything
-- in schema rendermd to schema sealdown, keeping stored documents and dbmate's history.
-- Run once against production with the session pooler DATABASE_URL, then switch the API's
-- exposed schemas from rendermd to sealdown, then deploy the renamed site.
begin;

alter schema rendermd rename to sealdown;

-- Function bodies name their schema, so they are recreated against the new one. Grants survive
-- because create or replace keeps the same functions.
create or replace function sealdown.create_doc(content text) returns text
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

create or replace function sealdown.get_doc(doc_id text) returns text
language sql security definer set search_path = '' as $$
  update sealdown.docs set last_accessed_at = now() where id = doc_id
  returning replace(encode(content, 'base64'), E'\n', '');
$$;

create or replace function sealdown.ping() returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from sealdown.docs limit 1;
  return 1;
end $$;

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

select cron.unschedule('rendermd-prune-docs');
select cron.schedule('sealdown-prune-docs', '0 * * * *', 'select sealdown.prune_docs()');

commit;

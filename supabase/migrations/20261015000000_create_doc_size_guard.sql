-- Pruning runs hourly, so a burst of uploads could push the database past the free-tier limit,
-- which makes it read-only and breaks every stored link. Refuse new documents above a guard
-- instead; clients then fall back to links that carry the whole document.
-- rendermd.max_table_bytes exists so tests can lower the guard.
create or replace function public.create_doc(content text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  max_bytes bigint := coalesce(nullif(current_setting('rendermd.max_table_bytes', true), '')::bigint, 471859200);
  bytes bytea;
  new_id text;
begin
  if pg_catalog.pg_total_relation_size('public.docs') > max_bytes then
    raise exception 'document storage is full' using errcode = '53100';
  end if;
  loop
    bytes := extensions.gen_random_bytes(10);
    new_id := '';
    for i in 0..9 loop
      new_id := new_id || substr(alphabet, get_byte(bytes, i) % 62 + 1, 1);
    end loop;
    begin
      insert into public.docs (id, content) values (new_id, decode(create_doc.content, 'base64'));
      return new_id;
    exception when unique_violation then
      -- Astronomically unlikely; draw another id.
    end;
  end loop;
end $$;

-- Encrypted documents shared by link. The server only ever sees ciphertext:
-- the decryption key lives in the URL fragment, which browsers never send.
create table public.docs (
  id               text primary key,         -- 10 random base62 characters
  content          bytea not null,            -- IV + compressed, encrypted content
  created_at       timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  constraint content_max_1mb check (octet_length(content) <= 1048576)
);

create index docs_last_accessed_at_idx on public.docs (last_accessed_at desc);

-- No policies: the table is unreachable through the API. Access goes only through the functions below.
alter table public.docs enable row level security;
revoke all on table public.docs from anon, authenticated;

-- Takes the encrypted bytes as standard base64 and returns the new id.
create function public.create_doc(content text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  bytes bytea;
  new_id text;
begin
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

-- Returns the content as single-line standard base64 (null when missing) and marks it as accessed,
-- which protects frequently opened documents from pruning.
create function public.get_doc(doc_id text) returns text
language sql security definer set search_path = '' as $$
  update public.docs set last_accessed_at = now() where id = doc_id
  returning replace(encode(content, 'base64'), E'\n', '');
$$;

-- Trivial query used by the keepalive workflow so the free-tier project doesn't pause.
create function public.ping() returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.docs limit 1;
  return 1;
end $$;

-- Deletes the least recently accessed documents until the total content size fits under cap_bytes.
create function public.prune_docs(cap_bytes bigint default 419430400) returns int
language plpgsql security definer set search_path = '' as $$
declare
  deleted int;
begin
  delete from public.docs where id in (
    select id from (
      select id, sum(octet_length(content)) over (order by last_accessed_at desc, id) as running
      from public.docs
    ) t where running > cap_bytes
  );
  get diagnostics deleted = row_count;
  return deleted;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.create_doc(text), public.get_doc(text), public.ping() to anon;

create extension if not exists pg_cron;
select cron.schedule('prune-docs', '0 * * * *', 'select public.prune_docs()');

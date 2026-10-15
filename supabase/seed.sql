-- Local only. The API exposes the sealdown schema and won't start healthy until it exists, but
-- migrations (dbmate, db/migrations) run after `supabase start`. Create the empty schema first.
create schema if not exists sealdown;

-- Answer Pad schema fingerprint. Read-only.
--
-- One md5 over every pad_* function (body, SECURITY DEFINER, settings), column,
-- constraint, index, trigger and row level security flag. The PGlite suite runs
-- this file against the migration (test-harness.ts, fingerprint()). Run the same
-- file against staging or production: the hash must equal the tested one, which
-- proves the deployed schema is exactly the schema the tests exercised.
--
-- Ordering uses the C collation so the hash does not depend on the server locale.
with parts as (
  select 'function' as kind,
         p.oid::regprocedure::text as name,
         md5(p.prosrc || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')) as hash
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'pad\_%'
  union all
  select 'column',
         c.table_name || '.' || c.column_name,
         md5(c.data_type || '|' || c.is_nullable || '|' || coalesce(c.column_default, '') || '|' || c.is_identity)
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name like 'pad\_%'
  union all
  select 'constraint', t.relname || '.' || con.conname, md5(pg_get_constraintdef(con.oid))
  from pg_constraint con
  join pg_class t on t.oid = con.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname like 'pad\_%'
  union all
  select 'index', i.indexname, md5(i.indexdef)
  from pg_indexes i
  where i.schemaname = 'public' and i.tablename like 'pad\_%'
  union all
  select 'trigger', t.relname || '.' || tg.tgname, md5(pg_get_triggerdef(tg.oid))
  from pg_trigger tg
  join pg_class t on t.oid = tg.tgrelid
  join pg_namespace n on n.oid = t.relnamespace
  where not tg.tgisinternal and n.nspname = 'public' and t.relname like 'pad\_%'
  union all
  select 'rls', t.relname, md5(t.relrowsecurity::text)
  from pg_class t
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relkind = 'r' and t.relname like 'pad\_%'
)
select count(*)::int as objects,
       md5(string_agg(kind || ':' || name || ':' || hash, E'\n' order by kind collate "C", name collate "C")) as hash
from parts;

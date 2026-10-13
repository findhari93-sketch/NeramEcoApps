# Fix recipes by advisor rule

Every recipe runs inside one migration, `supabase/migrations/<YYYYMMDDHHMMSS>_security_advisor_fixes.sql`. Write each one with `IF EXISTS` or a catalog loop, so the same file applies cleanly to prod and to staging even when they have drifted. Before revoking anything, Grep the repo for the object name and confirm the caller.

| Client | Key | RLS |
|---|---|---|
| `createAdminClient`, `getSupabaseAdminClient`, `createAdminClientISR` | service role | Bypasses RLS and grants. Safe. |
| `getSupabaseBrowserClient`, the default `supabase` export, `createServerClient` | anon | Breaks when you revoke. Move the caller to the admin client first, or accept the finding. |

Query helpers in `packages/database/src/queries/*` often take an optional client and fall back to the browser client. Check what each caller passes.

## R1 `rls_disabled_in_public`
```sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['table_a','table_b'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
```
No policy is needed when only the service role touches the table. That raises the INFO `rls_enabled_no_policy`, which `accepted.json` keeps. If a browser or anon caller really needs rows, write a narrow policy instead, and ask the user first.

## R2 `security_definer_view`
```sql
ALTER VIEW IF EXISTS public.my_view SET (security_invoker = true);
REVOKE ALL ON public.my_view FROM anon, authenticated;  -- only when the readers are service role
```
An invoker view applies the caller's RLS on its base tables. The service role bypasses that RLS, so admin readers see no change.

## R3 `anon_/authenticated_security_definer_function_executable`
```sql
DO $$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('fn_a','fn_b')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
```
- On Supabase, `REVOKE ... FROM PUBLIC` alone is not enough. Revoke from each role as well.
- Trigger functions (those that `RETURNS trigger`) are always safe to revoke. Postgres checks EXECUTE when the trigger is created, not when it fires.
- Functions with no definition in `supabase/migrations/` are staging drift. Revoke them in the same loop, since the name filter matches nothing on prod.

## R4 `function_search_path_mutable`
```sql
DO $$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', fn);
  END LOOP;
END $$;
```
- Keep `extensions` in the path, because pgcrypto and uuid-ossp live there.
- Skip extension-owned functions such as pg_trgm's (the `deptype = 'e'` check does that).
- Before applying, check that no function body calls another schema without a prefix: grep the function definitions (`pg_get_functiondef`) for names outside `public`, `extensions`, `pg_catalog`, `auth` and `storage`.

## R5 `materialized_view_in_api`
```sql
REVOKE ALL ON public.my_matview FROM anon, authenticated;
```

## R6 `rls_enabled_no_policy` (INFO)
Accepted for all objects. Look at it only when a NEW table is meant to be read by the browser client. That table needs a policy, otherwise its reads return nothing.

## R7 `auth_users_exposed`, `rls_references_user_metadata`
Stop and show the user. These need a design change: a view that exposes `auth.users`, or a policy that trusts `user_metadata`, which users can edit.

## R8 `extension_in_public`
pg_net and pg_trgm are accepted. For any other extension, use `ALTER EXTENSION x SET SCHEMA extensions` when the extension supports it, and only after you have grepped for objects that use it without a schema prefix.

## D1 Dashboard-only findings
Tell the user exactly where to click. Nothing in the repo can fix these.
- `vulnerable_postgres_version`: Project Settings > Infrastructure > Upgrade project. It takes a short downtime, so do staging first.
- `auth_leaked_password_protection`: accepted, because nobody signs in with Supabase Auth passwords.
- `auth_otp_long_expiry`, `auth_insufficient_mfa_options`: Authentication > Providers / MFA.

/**
 * A loosely typed handle for the six drawing evaluation tables.
 *
 * `getSupabaseAdminClient()` is typed against `database.generated.ts`, which is
 * generated from the schema as APPLIED. These tables arrive with this feature's
 * own migration, so until that migration has run against an environment and
 * `pnpm supabase:gen:types` has been re-run, they are not in that union and
 * every `.from('drawing_brief_type')` is a compile error.
 *
 * The repo's existing answer to this is `// @ts-nocheck` at the top of
 * `packages/database/src/queries/nexus/drawings.ts` ("drawing tables not yet in
 * generated Supabase types"), which switches off type checking for a whole
 * file. This is the narrower version: the loss of typing is scoped to the six
 * tables that genuinely are not in the schema yet, and every other line in the
 * calling file keeps full checking.
 *
 * TO REMOVE: once the migration is applied and types are regenerated, delete
 * this file and let the routes use the client directly. `grep -r evalTables`
 * finds every call site.
 */

/** The tables this shim exists for. Listed so the scope is explicit. */
export const EVAL_TABLES = [
  'drawing_brief_type',
  'drawing_criterion',
  'drawing_anchor_sheet',
  'drawing_evaluation',
  'drawing_evaluation_criterion',
  'drawing_annotation',
] as const;

export type EvalTable = (typeof EVAL_TABLES)[number];

/**
 * Minimal PostgREST surface, enough for the queries this feature makes and no
 * more. Deliberately not `any`: a typo in a method name is still a compile
 * error, only the table names and row shapes go unchecked.
 */
export interface EvalQuery {
  select: (columns?: string, options?: { count?: 'exact'; head?: boolean }) => EvalQuery;
  insert: (rows: unknown) => EvalQuery;
  update: (values: Record<string, unknown>) => EvalQuery;
  delete: () => EvalQuery;
  eq: (column: string, value: unknown) => EvalQuery;
  in: (column: string, values: unknown[]) => EvalQuery;
  not: (column: string, operator: string, value: unknown) => EvalQuery;
  order: (column: string, options?: { ascending?: boolean }) => EvalQuery;
  limit: (n: number) => EvalQuery;
  maybeSingle: () => Promise<{ data: any; error: { message: string } | null }>;
  single: () => Promise<{ data: any; error: { message: string } | null }>;
  then: <T>(
    onfulfilled: (value: { data: any; error: { message: string } | null; count?: number | null }) => T,
  ) => Promise<T>;
}

export interface EvalDb {
  from: (table: EvalTable) => EvalQuery;
}

/** Narrow a Supabase client to the evaluation tables. */
export function evalTables(supabase: unknown): EvalDb {
  return supabase as EvalDb;
}

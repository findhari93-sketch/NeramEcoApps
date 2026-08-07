/**
 * Is this server process part of an end to end test run?
 *
 * The nightly suite (`.github/workflows/e2e-full.yml`) points every app at the
 * PRODUCTION Supabase, so anything a spec writes is indistinguishable from real
 * traffic once it lands. The Aintra specs ask scripted questions ("Whats the
 * best restaurant in Chennai?", "Compare Papni with MEASI briefly") and those
 * were being inserted into `chatbot_conversations`, where the admin Chat History
 * page offers them up to be rated, corrected and promoted into the knowledge
 * base as though a student had asked them. Roughly 17 fake rows per night.
 *
 * Two variable names are accepted, deliberately:
 *
 *  - `NEXT_PUBLIC_E2E_TEST_MODE` is what the workflow and `.env.test` already
 *    set, and it is enough under `next dev` (the default local and CI path),
 *    because dev compiles the route after the flag is in the environment.
 *
 *  - `E2E_TEST_MODE` is the server only twin. Next inlines every
 *    `NEXT_PUBLIC_*` read at build time, so under `next start`
 *    (`E2E_PROD_SERVERS=marketing`) the public flag is frozen to whatever it was
 *    during `next build` and setting it at boot does nothing. A name without the
 *    prefix stays a real runtime lookup, which is the only form that survives a
 *    prebuilt server.
 *
 * Neither name is ever set on Vercel, so production logging is untouched.
 */
export function isE2ETestRun(): boolean {
  return (
    process.env.E2E_TEST_MODE === 'true' ||
    process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true'
  );
}

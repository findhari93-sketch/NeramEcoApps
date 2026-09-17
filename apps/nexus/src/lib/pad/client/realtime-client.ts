/**
 * The Supabase browser client, loaded when a pad screen first subscribes to hints.
 *
 * It is the heaviest library on the pad (about 640 kB before compression), and a
 * screen needs it only after its first snapshot is already showing, because
 * hints just say "fetch again". Importing it here, instead of at the top of the
 * page, lets a phone show the answer buttons without waiting for it. On phones
 * Teams keeps no copy of the pad between opens, so every open pays for what the
 * page loads first.
 */
export async function loadRealtimeClient() {
  const { getSupabaseBrowserClient } = await import('@neram/database');
  return getSupabaseBrowserClient();
}

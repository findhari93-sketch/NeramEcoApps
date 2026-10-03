// Cloudflare Worker: Nexus media proxy
//
// Serves class-recording bytes at media.neramclasses.com/recording?vt=vid_...
// so they no longer pass through a Vercel function (Fast Origin Transfer).
// Protection is unchanged: every request carries the same short-lived HMAC
// grant Nexus mints today, verified here with the same secret.
//
// Logic lives in handler.ts / grant.ts / range.ts so it can be unit tested from
// Vitest (apps/nexus/src/lib/media-proxy-*.test.ts); this file only binds the
// Worker runtime to it. Setup and secrets are listed in wrangler.toml.

import { handleRequest, type MediaEnv } from './handler';

export default {
  async fetch(request: Request, env: MediaEnv, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, {
      fetch: (input, init) => fetch(input, init),
      cache: caches.default,
      waitUntil: (p) => ctx.waitUntil(p),
    });
  },
};

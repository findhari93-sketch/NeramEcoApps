// Cloudflare Worker: Supabase Reverse Proxy
// Proxies requests from db.neramclasses.com → *.supabase.co
// Bypasses ISP-level DNS blocks on supabase.co in India

interface Env {
  SUPABASE_HOST: string; // e.g., "zdnypksjqnhtiblwdaic.supabase.co"
}

const ALLOWED_ORIGINS = [
  "https://neramclasses.com",
  "https://www.neramclasses.com",
  "https://app.neramclasses.com",
  "https://nexus.neramclasses.com",
  "https://admin.neramclasses.com",
  "https://staging.neramclasses.com",
  "https://staging-app.neramclasses.com",
  "https://staging-nexus.neramclasses.com",
  "https://staging-admin.neramclasses.com",
  "http://localhost:3010",
  "http://localhost:3011",
  "http://localhost:3012",
  "http://localhost:3013",
];

function isAllowedOrigin(origin: string): boolean {
  return (
    ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".vercel.app")
  );
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    "Access-Control-Allow-Headers":
      "Authorization, apikey, Content-Type, x-client-info, X-Supabase-Api-Version, Accept, Range, X-Upsert, Prefer, Content-Profile, Accept-Profile",
    "Access-Control-Expose-Headers":
      "Content-Range, X-Supabase-Api-Version, Content-Length, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") || "";
    const allowed = isAllowedOrigin(origin);
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: allowed ? corsHeaders(origin) : {},
      });
    }

    try {
      // Build upstream Supabase URL
      const targetUrl = new URL(`https://${env.SUPABASE_HOST}${url.pathname}${url.search}`);

      // Cloudflare strips the "apikey" header on both inbound and outbound requests.
      // Supabase's Kong gateway requires it. Pass as URL query parameter instead.
      // Extract from Authorization header (Supabase JS client always sends both).
      if (!targetUrl.searchParams.has("apikey")) {
        const auth = request.headers.get("Authorization");
        if (auth && auth.startsWith("Bearer ")) {
          targetUrl.searchParams.set("apikey", auth.substring(7));
        }
      }

      // Build the proxy request
      const proxyRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        redirect: "follow",
      });

      // Override the host header to the Supabase host
      proxyRequest.headers.set("Host", env.SUPABASE_HOST);

      const response = await fetch(proxyRequest);

      // Build response with CORS headers
      const responseHeaders = new Headers(response.headers);
      if (allowed) {
        for (const [key, value] of Object.entries(corsHeaders(origin))) {
          responseHeaders.set(key, value);
        }
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: "Proxy error", message }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

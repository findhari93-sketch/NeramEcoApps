import baseConfig from './playwright.config';

// Override for running tests against an already-running dev server.
// Skips the webServer block so Playwright does not try to start marketing/app/nexus/admin.
// Use this when you have run `pnpm dev:marketing` yourself first.

export default {
  ...baseConfig,
  webServer: undefined,
};

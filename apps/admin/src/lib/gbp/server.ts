/**
 * Server-side entry to the Google Business Profile client: one place that reads
 * the credentials, so every route answers "not connected" the same way.
 */
import { GbpClient } from './client';
import { readGbpConfig, type GbpEnvVar } from './core';

export function getGbpClient(): { client: GbpClient } | { missing: GbpEnvVar[] } {
  const read = readGbpConfig(process.env);
  if ('missing' in read) return { missing: read.missing };
  return { client: new GbpClient(read.config) };
}

export const NOT_CONNECTED_MESSAGE =
  'Google Business Profile is not connected yet. Set the GBP_* environment variables once Google approves API access.';

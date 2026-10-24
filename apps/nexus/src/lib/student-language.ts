/**
 * Which language a student follows: the labels, the avatar mark and the filter
 * rules.
 *
 * The table and every rule now live in @neram/ui (packages/ui/src/language), so
 * Admin's PersonAvatar draws the same mark from the same source. This file keeps
 * the Nexus import path stable for every screen and route that already uses it.
 *
 * Pure TypeScript (the subpath carries no JSX), so API routes can import it.
 */
export * from '@neram/ui/language';

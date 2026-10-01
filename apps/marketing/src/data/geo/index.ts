/**
 * The place registry now lives in @neram/geo so the Tools app uses the same
 * slugs. This shim keeps every `@/data/geo` import working. Coaching copy
 * (content/) stays here because only marketing renders it.
 */
export * from '@neram/geo';

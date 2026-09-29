/**
 * How many PRs may have their diff stats backfilled in one list request. Each
 * backfill is a GitHub detail fetch, so the cap bounds the request; the periodic
 * refetch works through any remainder.
 */
export const BACKFILL_LIMIT = 10;

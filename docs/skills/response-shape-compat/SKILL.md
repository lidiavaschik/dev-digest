---
name: response-shape-compat
description: Use when a PR changes an API response schema, DTO, serializer or shared contract type; flag response changes that break existing clients (removed/renamed fields, type changes, nullability, enum changes).
type: rubric
---
# Response Shape Compatibility

Clients parse responses written by the OLD version of the server. For every
response schema, DTO, serializer or shared contract the diff touches, compare the
old and new shape field by field.

## Breaking — flag these
- **Removed field**: a field clients may read is no longer returned.
- **Renamed field**: `created_at` → `createdAt` is a removal plus an addition.
- **Type change**: string → number, object → array, a number now serialized as a
  string, a date format change.
- **Nullability widened**: a field that was always present can now be `null` or
  missing — clients that dereference it crash.
- **Enum changed**: a value removed, or a NEW value added to an enum clients
  switch over exhaustively.
- **Nesting changed**: a field moved into / out of a nested object; a list
  wrapped in `{ items, total }`.
- **Semantics changed** under the same name (cents → dollars, UTC → local time).

## Not breaking
- A new optional field; a field made non-nullable; a relaxed input.

## Severity
- **CRITICAL** — a breaking response change on an existing endpoint with no
  version bump and no evidence that all consumers are updated in the same PR.
- **WARNING** — breaking but mitigated (old field kept alongside the new one,
  versioned endpoint) or an internal-only endpoint.
- **SUGGESTION** — additive change that deserves a changelog / contract note.

## Example
```diff
- return { id, total_cents: order.total }
+ return { id, total: order.total / 100 }
```
→ CRITICAL: "`total_cents` removed and replaced by `total` in a different unit;
existing clients read `undefined`. Keep `total_cents` or version the endpoint."

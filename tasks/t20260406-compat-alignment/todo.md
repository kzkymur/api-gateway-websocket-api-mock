# Task: Compatibility Alignment After Clarification

## Plan
- [x] Record user clarification and create alignment task
- [x] Update top-level spec to lock stack and strict compatibility policy
- [x] Update mock API specs to remove ambiguous custom terms and align with API Gateway semantics
- [x] Validate consistency across all updated specs

## Check-in
- Alignment plan prepared. Next step is spec rewrites.

## Review
- Removed ambiguous `INTEGRATION_BASE_URL` usage from mock specs.
- Standardized route integration model as `routeKey -> Integration URI` via `ROUTE_INTEGRATIONS_JSON`.
- Management API paths now use stage-aware shape: `/{stage}/@connections/{connectionId}`.
- Locked example stack in `SPEC.md`: React+TypeScript+Vite (FE), AWS SAM CLI + Hono TypeScript Lambda layer (BE), PostgreSQL (DB).
- Compatibility policy updated to default strict mode and extension endpoint disabled by default.

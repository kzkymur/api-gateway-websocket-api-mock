---
name: mock-gateway-usage
description: Image-first workflow for running mock-gateway via GHCR, validating WebSocket and Management API behavior, and integrating route callbacks into local development. Always use this when users ask how to consume mock-gateway from another project, pin versions, or debug delivery/routing failures.
---

# Mock Gateway Usage

This skill explains how to consume `mock-gateway` as a published container image and integrate it into application development without cloning/building source by default.

## Goals

- Start `mock-gateway` from GHCR and verify `healthz`
- Pin image version for reproducible environments
- Confirm WebSocket connection and route resolution
- Enable backend integration via `ROUTE_INTEGRATIONS_JSON`
- Send data through the Management API (`/{stage}/@connections/{connectionId}`)

## Workflow

1. Use GHCR image first (`ghcr.io/kzkymur/api-gateway-websocket-api-mock`), not local build.
2. Pin explicit image tag (for example `v0.1.0`) instead of `latest`.
3. Set `stage`, strict mode, and integration URLs.
4. Validate in order: `healthz` -> WS connect/send -> integration callback -> Management API send.
5. If anything fails, triage by log `kind` and HTTP status.

## Prerequisites

- Docker and Docker Compose
- Access to pull GHCR images (`docker login ghcr.io` when needed)

## Recommended Startup (Image-Based)

Create or update `docker-compose.yml` in the consumer project:

```yaml
services:
  mock-gateway:
    image: ghcr.io/kzkymur/api-gateway-websocket-api-mock:v0.1.0
    pull_policy: always
    environment:
      PORT: 8787
      STAGE: dev
      STRICT_COMPATIBILITY_MODE: "true"
      ROUTE_INTEGRATIONS_JSON: '{}'
    ports:
      - "8787:8787"
```

Start:

```bash
docker compose pull mock-gateway
docker compose up -d mock-gateway
```

Verify:

```bash
curl -sS http://localhost:8787/healthz
```

Expected output:

- JSON similar to `{"ok":true,"stage":"dev","connections":0}`

## Versioning Guidance

- Prefer fixed tags in application environments:
  - `ghcr.io/kzkymur/api-gateway-websocket-api-mock:v0.1.0`
- Avoid depending on mutable `latest` in CI/staging/production-like test environments.
- Upgrade flow:
  1. Change image tag in compose
  2. `docker compose pull mock-gateway`
  3. `docker compose up -d mock-gateway`

## Environment Variables

- `PORT`:
  - Listen port (default `8787`)
- `HOST`:
  - Listen host (default `0.0.0.0`)
- `STAGE`:
  - Used in WebSocket path and Management API path (default `dev`)
- `STRICT_COMPATIBILITY_MODE`:
  - `true` allows only `/{stage}` as WS path
  - `true` disables `/_mock/broadcast`
- `ROUTE_SELECTION_EXPRESSION`:
  - Default: `$request.body.action`
- `ROUTE_INTEGRATIONS_JSON`:
  - Route-key to integration-URL map

## Integration Setup

Minimal template:

```json
{
  "$connect": "http://localhost:3000/integrations/connect",
  "$disconnect": "http://localhost:3000/integrations/disconnect",
  "$default": "http://localhost:3000/integrations/default",
  "sendMessage": "http://localhost:3000/integrations/send-message"
}
```

Shell assignment:

```bash
ROUTE_INTEGRATIONS_JSON='{"$connect":"http://localhost:3000/integrations/connect","$disconnect":"http://localhost:3000/integrations/disconnect","$default":"http://localhost:3000/integrations/default","sendMessage":"http://localhost:3000/integrations/send-message"}'
```

If gateway runs inside Docker and the integration target runs on the host machine, `localhost` may not resolve to the host process. Use `host.docker.internal` when needed.

## Connectivity Check

1. Connect a WS client to `ws://localhost:8787/dev`.
2. Send `{"action":"sendMessage","text":"hello"}`.
3. Confirm `route_resolved` and `integration_call` in gateway logs.
4. Integration is considered successful on 2xx response.

With `STRICT_COMPATIBILITY_MODE=true`, connecting without stage (for example `ws://localhost:8787/`) is rejected.

## Management API Usage

Get connection state:

```bash
curl -i http://localhost:8787/dev/@connections/<connectionId>
```

Send payload to client:

```bash
curl -i -X POST \
  -H 'content-type: application/json' \
  --data '{"type":"chat.message","text":"hi"}' \
  http://localhost:8787/dev/@connections/<connectionId>
```

Close connection:

```bash
curl -i -X DELETE http://localhost:8787/dev/@connections/<connectionId>
```

Treat `410 Gone` as stale (already closed) connection.

## Route Resolution Rules

- Use `ROUTE_SELECTION_EXPRESSION` when valid and resolves to a string.
- Otherwise fall back to `action`.
- If still unresolved, use `$default`.
- Non-JSON payloads also route to `$default`.

## Log-Based Triage

Main log `kind` values:

- `connect`
- `disconnect`
- `route_resolved`
- `integration_call`
- `integration_error`
- `send_to_connection`
- `route_unresolved`

Failure diagnosis:

- `integration_error`:
  - Check target URL, response code, and network reachability
- `route_unresolved`:
  - Ensure the route key exists in `ROUTE_INTEGRATIONS_JSON`
- `410 Gone`:
  - Verify connection is active with `GET /@connections/{id}` first

## Authentication to GHCR (When Pull Fails)

If image pull returns auth errors:

```bash
export GITHUB_TOKEN='<token-with-read:packages>'
printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u kzkymur --password-stdin
docker compose pull mock-gateway
```

## Development Integration Pattern

- Keep backend focused on integration handlers, not direct WS accept logic.
- Standardize client payloads around `action` and map by route key.
- Use `POST /@connections/{id}` as the single server-push channel.
- Keep strict mode `true` for compatibility-focused verification; disable only for explicit local-only extensions.

## Fallback: Local Source Build (Only When Needed)

Use this only if image pull is unavailable or source changes are being developed:

```bash
docker build -t local/mock-gateway:dev ./mock-gateway
docker run --rm -p 8787:8787 \
  -e PORT=8787 \
  -e STAGE=dev \
  -e STRICT_COMPATIBILITY_MODE=true \
  -e ROUTE_INTEGRATIONS_JSON='{}' \
  local/mock-gateway:dev
```

## Response Template

When answering a user, structure the response in this order:

1. Image reference and fixed version tag
2. Compose snippet using `image:` (not `build:`)
3. Startup and `healthz` check
4. Integration mapping setup
5. WS + Management API verification
6. Debug checklist (log kind / status code / GHCR auth)

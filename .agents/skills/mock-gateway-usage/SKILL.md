---
name: mock-gateway-usage
description: Step-by-step workflow to run mock-gateway locally, verify WebSocket connectivity, configure route integrations, and validate Management API delivery. Always use this when the user asks how to start mock-gateway, reproduce API Gateway WebSocket behavior locally, or debug delivery/routing failures.
---

# Mock Gateway Usage

This skill explains how to start `mock-gateway/` in a local environment and integrate it into day-to-day backend/frontend development.

## Goals

- Start `mock-gateway` and verify `healthz`
- Confirm WebSocket connection and route resolution
- Enable backend integration via `ROUTE_INTEGRATIONS_JSON`
- Send data through the Management API (`/{stage}/@connections/{connectionId}`)

## Workflow

1. Confirm runtime mode first: `Docker Compose` or direct `Node.js`.
2. Decide `stage`, strict mode, and integration endpoint URLs.
3. Validate in order: `healthz` -> WebSocket connect/send -> integration callback -> Management API send.
4. If anything fails, triage with log `kind` values and HTTP status codes.

## Prerequisites

- Docker mode:
  - Docker and Docker Compose available
- Node.js mode:
  - Node.js 22.x
  - Dependencies installable from `mock-gateway/package.json`

## Startup

### A. Start with Docker Compose

Run in repository root:

```bash
docker compose up --build
```

Verify:

```bash
curl -sS http://localhost:8787/healthz
```

Expected output:

- JSON similar to `{"ok":true,"stage":"dev","connections":0}`

### B. Start directly with Node.js

Run in `mock-gateway/`:

```bash
npm install
PORT=8787 STAGE=dev STRICT_COMPATIBILITY_MODE=true ROUTE_INTEGRATIONS_JSON='{}' npm run dev
```

Production-like run (no watch):

```bash
npm run build
PORT=8787 STAGE=dev STRICT_COMPATIBILITY_MODE=true ROUTE_INTEGRATIONS_JSON='{}' npm start
```

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

## Development Integration Pattern

- Keep backend focused on integration handlers, not direct WS accept logic.
- Standardize client payloads around `action` and map by route key.
- Use `POST /@connections/{id}` as the single server-push channel.
- Keep strict mode `true` for compatibility-focused verification; disable only for explicit local-only extensions.

## Response Template

When answering a user, structure the response in this order:

1. Startup mode (Docker or Node.js)
2. Exact commands
3. `healthz` and WS connectivity checks
4. Integration mapping setup
5. Management API delivery check
6. Debug checklist (log kind and HTTP status)

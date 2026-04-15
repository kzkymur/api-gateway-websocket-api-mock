# api-gateway-websocket-api-mock

TypeScript implementation of a local mock for AWS API Gateway WebSocket API behavior.

## What This Provides

- WebSocket endpoint with stage-based path (`ws://localhost:8787/{stage}`)
- Route resolution based on `ROUTE_SELECTION_EXPRESSION` (default: `$request.body.action`)
- Route-key to HTTP integration callback mapping via `ROUTE_INTEGRATIONS_JSON`
- Management API compatible endpoints:
  - `GET /{stage}/@connections/{connectionId}`
  - `POST /{stage}/@connections/{connectionId}`
  - `DELETE /{stage}/@connections/{connectionId}`

## Quick Start (Docker)

Run from repository root:

```bash
docker compose up --build
```

Health check:

```bash
curl -sS http://localhost:8787/healthz
```

Expected response:

```json
{"ok":true,"stage":"dev","connections":0}
```

## Quick Start (Node.js)

Run directly in `mock-gateway/`:

```bash
cd mock-gateway
npm install
PORT=8787 STAGE=dev STRICT_COMPATIBILITY_MODE=true ROUTE_INTEGRATIONS_JSON='{}' npm run dev
```

Production-like startup:

```bash
npm run build
PORT=8787 STAGE=dev STRICT_COMPATIBILITY_MODE=true ROUTE_INTEGRATIONS_JSON='{}' npm start
```

## Environment Variables

- `PORT` (default: `8787`): listen port
- `HOST` (default: `0.0.0.0`): listen host
- `STAGE` (default: `dev`): WS stage path and management API prefix
- `STRICT_COMPATIBILITY_MODE` (default: `true`):
  - `true`: only `/{stage}` is accepted on WS upgrade
  - `true`: `/_mock/broadcast` is disabled
- `ROUTE_SELECTION_EXPRESSION` (default: `$request.body.action`)
- `ROUTE_INTEGRATIONS_JSON` (default: `{}`): route integration map

## Integration Mapping

Set integration URLs per route key:

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

If the gateway runs in Docker and integrations run on the host machine, use `host.docker.internal` instead of `localhost` when required.

## Route Resolution Behavior

Incoming WS message routing behavior:

1. Parse JSON body
2. Evaluate `ROUTE_SELECTION_EXPRESSION`
3. If unresolved, fall back to `action`
4. If still unresolved or invalid JSON, route to `$default`

## Management API Usage

Get connection state:

```bash
curl -i http://localhost:8787/dev/@connections/<connectionId>
```

Send message to one connection:

```bash
curl -i -X POST \
  -H 'content-type: application/json' \
  --data '{"type":"chat.message","text":"hi"}' \
  http://localhost:8787/dev/@connections/<connectionId>
```

Disconnect one connection:

```bash
curl -i -X DELETE http://localhost:8787/dev/@connections/<connectionId>
```

`410 Gone` indicates a stale or already closed connection.

## Development Validation Checklist

1. `GET /healthz` returns `ok: true`
2. WS connection to `ws://localhost:8787/dev` succeeds
3. Sending `{"action":"sendMessage","text":"hello"}` emits `route_resolved` log
4. Integration callback receives event payload and returns 2xx
5. Management API `POST /@connections/{id}` reaches the client

## Unit Tests

Run route selection tests:

```bash
npm --prefix mock-gateway test
```

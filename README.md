# api-gateway-websocket-api-mock

TypeScript implementation of a local mock for AWS API Gateway WebSocket API behavior.

This repository helps you develop and test WebSocket-based applications locally with an API Gateway-compatible contract:

- Frontend connects via WebSocket (`ws://.../{stage}`)
- Backend receives route integration callbacks over HTTP
- Backend pushes messages back through Management API-compatible endpoints

## Why Use This

- Reproduce API Gateway WebSocket request/response shapes locally
- Validate route selection and route integration behavior before AWS deployment
- Keep your local development flow simple with Docker
- Pin a versioned container image for stable team environments

## Architecture at a Glance

```text
Client (WebSocket) <-> mock-gateway <-> Backend integrations (HTTP)
                              |
                              +-> Management API-compatible endpoints
                                  /{stage}/@connections/{connectionId}
```

## What This Provides

- WebSocket endpoint with stage path (`ws://localhost:8787/{stage}`)
- Route selection expression (`ROUTE_SELECTION_EXPRESSION`, default `$request.body.action`)
- Route-key -> integration URL mapping (`ROUTE_INTEGRATIONS_JSON`)
- Management API-compatible endpoints:
  - `GET /{stage}/@connections/{connectionId}`
  - `POST /{stage}/@connections/{connectionId}`
  - `DELETE /{stage}/@connections/{connectionId}`
- Health endpoint:
  - `GET /healthz`

## 1-Minute Quick Start (Docker)

Run from repository root:

```bash
docker compose up --build
```

Verify:

```bash
curl -sS http://localhost:8787/healthz
```

Expected response:

```json
{"ok":true,"stage":"dev","connections":0,"droppedMessages":{"total":0,"reasons":{}}}
```

Connect your client to:

```text
ws://localhost:8787/dev
```

## Publish Image to GHCR

Use this flow to publish `mock-gateway` as a reusable container image.

Prerequisites:

- GitHub Personal Access Token (classic) with `write:packages` and `read:packages`
- Docker logged out/in access to `ghcr.io`

Set image coordinates:

```bash
export IMAGE=ghcr.io/kzkymur/api-gateway-websocket-api-mock
export VERSION=v0.1.0
```

Set token and verify it is not empty:

```bash
export GITHUB_TOKEN='<your-token>'
echo ${#GITHUB_TOKEN}
```

`echo ${#GITHUB_TOKEN}` must be greater than `0`.

Login to GHCR (non-interactive safe form):

```bash
printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u kzkymur --password-stdin
```

Build and tag:

```bash
docker build -t $IMAGE:$VERSION -t $IMAGE:latest ./mock-gateway
```

Push:

```bash
docker push $IMAGE:$VERSION
docker push $IMAGE:latest
```

If login fails, reset auth and retry:

```bash
docker logout ghcr.io
printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u kzkymur --password-stdin
```

## Usage Example (Consumer Project)

Use this in the consumer project's `docker-compose.yml`:

```yaml
services:
  mock-gateway:
    image: ghcr.io/kzkymur/api-gateway-websocket-api-mock:v0.1.0
    environment:
      PORT: 8787
      STAGE: dev
      STRICT_COMPATIBILITY_MODE: "true"
      ROUTE_INTEGRATIONS_JSON: '{}'
    ports:
      - "8787:8787"
```

Start and verify:

```bash
docker compose pull mock-gateway
docker compose up -d mock-gateway
curl -sS http://localhost:8787/healthz
```

## Environment Variables

- `PORT` (default: `8787`)
- `HOST` (default: `0.0.0.0`)
- `STAGE` (default: `dev`)
- `STRICT_COMPATIBILITY_MODE` (default: `true`)
  - `true`: accepts only `/{stage}` on WebSocket upgrade
  - `true`: disables `/_mock/broadcast`
- `ROUTE_SELECTION_EXPRESSION` (default: `$request.body.action`)
- `ROUTE_INTEGRATIONS_JSON` (default: `{}`)
- `CONNECT_MESSAGE_BUFFER_LIMIT` (default: `64`)
  - max buffered message count per connection while waiting for `$connect` integration completion

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

Example shell assignment:

```bash
ROUTE_INTEGRATIONS_JSON='{"$connect":"http://localhost:3000/integrations/connect","$disconnect":"http://localhost:3000/integrations/disconnect","$default":"http://localhost:3000/integrations/default","sendMessage":"http://localhost:3000/integrations/send-message"}'
```

If gateway runs in Docker and integration targets run on the host machine, use `host.docker.internal` instead of `localhost` when needed.

## Route Resolution Behavior

For each incoming WebSocket message:

1. Parse JSON body
2. Resolve route via `ROUTE_SELECTION_EXPRESSION`
3. If unresolved, fall back to `action`
4. If still unresolved (or invalid JSON), use `$default`

## Management API Usage

Get connection:

```bash
curl -i http://localhost:8787/dev/@connections/<connectionId>
```

Send to connection:

```bash
curl -i -X POST \
  -H 'content-type: application/json' \
  --data '{"type":"chat.message","text":"hi"}' \
  http://localhost:8787/dev/@connections/<connectionId>
```

Disconnect connection:

```bash
curl -i -X DELETE http://localhost:8787/dev/@connections/<connectionId>
```

`410 Gone` indicates a stale (already closed) connection.

## Local Development (Source)

If you want to modify the gateway itself:

```bash
cd mock-gateway
npm install
npm run dev
```

Or run production-like:

```bash
npm run build
npm start
```

## Unit Tests

```bash
npm --prefix mock-gateway test
```

## Troubleshooting

- WebSocket rejects connection immediately:
  - Check `STAGE` and connect to `ws://host:port/{stage}` when strict mode is enabled.
- Route not invoked:
  - Check payload shape, `ROUTE_SELECTION_EXPRESSION`, and `ROUTE_INTEGRATIONS_JSON`.
  - Check `message_dropped` logs and `/healthz` -> `droppedMessages` for drop counts/reasons.
- Integration call fails:
  - Check gateway logs (`integration_error`) and backend reachability.
- Pull from GHCR fails:
  - Re-login to GHCR and verify token scopes (`read:packages`, `write:packages` for publish).

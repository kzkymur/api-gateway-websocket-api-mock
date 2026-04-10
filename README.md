# api-gateway-websocket-api-mock

ローカルで API Gateway WebSocket API 互換の開発体験を再現する TypeScript ベース実装です。

## Quick Start

```bash
docker compose up --build
```

起動後:
- Frontend: http://localhost:5173
- Backend health: http://localhost:3000/healthz
- Mock Gateway health: http://localhost:8787/healthz
- PostgreSQL (host): localhost:55432

## Example 構成

- `example/mock-gateway`: Hono + ws (単独動作可能)
- `example/backend`: Hono + PostgreSQL chat backend
- `example/frontend`: Vite + TypeScript frontend
- `db`: PostgreSQL

## 疎通確認

1. Frontend で `Create User/Room & Join` を押す
2. `Send Message` を押す
3. 画面ログに `chat.message.created` が出れば成功

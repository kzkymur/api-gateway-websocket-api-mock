# api-gateway-websocket-api-mock

ローカルで API Gateway WebSocket API 互換の開発体験を再現する TypeScript ベース実装です。

## 起動コマンドを分離

### 1) MockGateway だけ起動（本丸）

```bash
docker compose up --build
```

起動後:
- Mock Gateway health: http://localhost:8787/healthz

### 2) Example 一式を起動（backend/frontend/db 付き）

```bash
docker compose -f docker-compose.example.yml up --build
```

起動後:
- Frontend: http://localhost:5173
- Backend health: http://localhost:3000/healthz
- Mock Gateway health: http://localhost:8787/healthz
- PostgreSQL (host): localhost:55432

## 構成

- `mock-gateway`: Hono + ws の API Gateway WebSocket API mock（本丸）
- `example/backend`: Hono + PostgreSQL chat backend（サンプル）
- `example/frontend`: Vite + TypeScript frontend（サンプル）
- `example/tests`: frontend なしで実行できる e2e テスト

## 疎通確認（example 構成）

1. Frontend で `Create User/Room & Join` を押す
2. `Send Message` を押す
3. 画面ログに `chat.message.created` が出れば成功

## E2E Test (Playwright)

frontend リポジトリや frontend プロセスなしで実行できます。

```bash
cd example/tests
npm install
npx playwright install chromium
npx playwright install-deps chromium
npm run test:e2e
```

What this test does:
- Starts backend (`:3000`) and mock gateway (`:8787`) automatically via Playwright `webServer` config.
- Opens two browser contexts and connects two WebSocket clients to `ws://127.0.0.1:8787/dev`.
- Sends messages from both clients and verifies both connections remain open.

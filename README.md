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
- `example/tests`: frontend + mock backend API + mock gateway をまとめて検証する e2e テスト

## 疎通確認（example 構成）

1. Frontend で `Create User` を押す
2. `Send Message` を押す
3. 画面ログに `chat.message.created` が出れば成功（グローバル掲示板）

## E2E Test (Playwright)

Playwright から frontend 画面 (`http://127.0.0.1:5173`) にアクセスし、ボタン操作で WebSocket の配信を検証します。

```bash
cd example/tests
npm install
npx playwright install chromium
npx playwright install-deps chromium
npm run test:e2e
```

What this test does:
- Starts a mock backend API/integration server (`:3100`), mock gateway (`:8787`), and frontend (`:5173`) automatically via Playwright `webServer` config.
- Opens two browser contexts, each browsing the frontend page.
- Clicks `Create User` and `Send Message` on each client, then verifies the opposite client log includes `chat.message.created` in real time.

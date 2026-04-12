# Example Stack Implementation Notes

## 1. 構成
- `mock-gateway`: Hono + ws による API Gateway WebSocket API モック（本体）。
- `example/backend`: Hono + PostgreSQL のチャット API / integration handler。
- `example/frontend`: Vite + TypeScript の疎通確認 UI。
- `db`: PostgreSQL 16。

## 2. 起動
### MockGateway 単体
```bash
docker compose up --build
```

### Example 一式
```bash
docker compose -f docker-compose.example.yml up --build
```

## 3. 疎通確認項目
1. `GET http://localhost:3000/healthz` が `{"ok":true}` を返す（example 起動時）。
2. FE で Create User -> Send Message を実行し、`chat.message.created` を受信する。
3. `GET http://localhost:8787/dev/@connections/{id}` は有効接続で200、切断後410。

## 4. 互換性差分
- Management API 認証(SigV4) は未実装。
- route selection expression は v1 で `$request.body.action` 固定。

# HTTP Interface Spec (BE <-> Mock Gateway)

## 1. Purpose
BE が API Gateway Management API 相当の操作を行うための HTTP エンドポイントを提供する。

## 2. Base URL
- `http://{host}:{port}/{stage}`
- 例: `http://localhost:8787/dev`

## 3. Endpoints
### 3.1 Get Connection
- `GET /{stage}/@connections/{connectionId}`
- 200: 接続情報
- 410: 接続なし

成功レスポンス例:
```json
{
  "connectionId": "01HR...",
  "connectedAt": "2026-04-06T00:00:00.000Z",
  "lastActiveAt": "2026-04-06T00:00:10.000Z",
  "stage": "dev"
}
```

### 3.2 Post To Connection
- `POST /{stage}/@connections/{connectionId}`
- Body: 任意バイト列（text/json/binary）
- 200: 配信成功
- 410: 接続なし

### 3.3 Delete Connection
- `DELETE /{stage}/@connections/{connectionId}`
- 200: 切断実行
- 410: 接続なし

### 3.4 Broadcast (Mock Extension)
- `POST /_mock/broadcast`
- Body:
```json
{
  "connectionIds": ["01HR...", "01HS..."],
  "data": {"type": "chat.message", "text": "hi"}
}
```
- 200: 成功/失敗件数
- strict compatibility mode ではこのエンドポイントは無効（デフォルト）

## 4. Integration Callback Contract
Gateway から BE への呼び出し先は routeKey ごとの Integration URI で指定する。
- `$connect` -> `ROUTE_INTEGRATIONS_JSON["$connect"]`
- `$disconnect` -> `ROUTE_INTEGRATIONS_JSON["$disconnect"]`
- `$default` -> `ROUTE_INTEGRATIONS_JSON["$default"]`
- `{customRouteKey}` -> `ROUTE_INTEGRATIONS_JSON["{customRouteKey}"]`

BE は 2xx を返すことで処理成功とみなされる。

## 5. Error Contract
- 400: リクエスト形式不正
- 404: エンドポイント不正
- 410: stale connection
- 413: payload too large
- 429: throttled（将来拡張）
- 500: モック内部エラー

## 6. Idempotency
- `DELETE /{stage}/@connections/{id}` は冪等ではない（2 回目以降は 410）
- `POST /{stage}/@connections/{id}` は at-least-once 配信（v1）

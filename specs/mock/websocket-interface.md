# WebSocket Interface Spec (FE -> Mock Gateway)

## 1. Endpoint
- URL: `ws://{host}:{port}/{stage}`
- 例: `ws://localhost:8787/dev`
- サブプロトコル: 任意（未指定時は受理）
- strict compatibility mode では stage を必須扱いにする

## 2. Connection Lifecycle
### 2.1 Connect
- 接続成功時に `connectionId` を採番（推奨: ULID）
- 接続コンテキストをメモリに保存
  - `connectionId`, `connectedAt`, `lastActiveAt`, `stage`, `sourceIp`, `userAgent`, `metadata`
- routeKey が `$connect` の Integration URI を呼び出す（設定済みの場合）

### 2.2 Disconnect
- close frame または transport 切断時に接続情報を削除
- routeKey が `$disconnect` の Integration URI を呼び出す（設定済みの場合）

## 3. Message Routing
- デフォルト route selection expression: `$request.body.action`
- メッセージ受信時のルート決定
  1. JSON parse 成功かつ `action` が文字列: `routeKey = action`
  2. それ以外: `routeKey = $default`
- `routeKey -> Integration URI` のマップに従って統合先を決定
- 該当 route の Integration URI が未設定で `$default` も無い場合はルート未解決として記録

## 4. Payload Contract
### 4.1 FE -> Gateway
- テキストフレームを受理（バイナリは v1 では未対応）
- 推奨形式:
```json
{
  "action": "sendMessage",
  "roomId": "room-1",
  "message": "hello"
}
```

### 4.2 Gateway -> Integration (BE)
```json
{
  "version": "2.0",
  "type": "REQUEST",
  "routeKey": "sendMessage",
  "requestContext": {
    "apiId": "local-mock",
    "domainName": "localhost",
    "routeKey": "sendMessage",
    "eventType": "MESSAGE",
    "connectionId": "01HR...",
    "stage": "dev",
    "requestTimeEpoch": 1712345678901
  },
  "body": "{\"action\":\"sendMessage\",\"roomId\":\"room-1\",\"message\":\"hello\"}",
  "isBase64Encoded": false
}
```
- strict compatibility mode では API Gateway WebSocket proxy event に合わせて互換フィールドを増やす

## 5. Error Behavior
- 不正 JSON は `$default` ルートに流す
- 接続済みでない `connectionId` への送信は HTTP 410 相当
- Gateway 内部例外は FE には close code `1011` を返し、ログへ記録

## 6. Observability (v1)
- ログ種別: `connect`, `disconnect`, `message_in`, `route_resolved`, `integration_call`, `send_to_connection`
- ログ形式: JSON lines

## 7. Integration URI Configuration
- 設定キー: `ROUTE_INTEGRATIONS_JSON`
- 形式（JSON 文字列）:
```json
{
  "$connect": "http://sam-local:3001/2015-03-31/functions/ConnectFn/invocations",
  "$disconnect": "http://sam-local:3001/2015-03-31/functions/DisconnectFn/invocations",
  "$default": "http://sam-local:3001/2015-03-31/functions/DefaultFn/invocations",
  "sendMessage": "http://sam-local:3001/2015-03-31/functions/SendMessageFn/invocations"
}
```
- SAM CLI 連携では `sam local start-lambda` の invoke endpoint を Integration URI として使う

## 8. Example App Requirements
- FE は再接続時に新しい `connectionId` を前提に同期
- 同一ルーム内の複数ユーザへ順序を保って配信

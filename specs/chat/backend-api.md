# Chat Backend API and Route Handling Spec

## 1. Purpose
BE (SAM + Hono TypeScript) が提供するグローバル掲示板向け API と、Mock Gateway の route integration で呼ばれる処理を定義する。

## 2. HTTP APIs (BE)
### 2.1 Health
- `GET /healthz`
- 200: `{"ok": true}`

### 2.2 Create User
- `POST /api/users`
- Request:
```json
{"displayName":"alice"}
```
- Response 201:
```json
{"id":"uuid","displayName":"alice"}
```

### 2.3 List Messages
- `GET /api/messages?limit=50&before=<ISO8601>`
- Response 200:
```json
{"items":[{"id":"uuid","senderUserId":"uuid","content":"hello","createdAt":"2026-04-06T00:00:00.000Z"}]}
```

## 3. WebSocket Route Integrations
Mock Gateway から BE へ route integration invoke される。

### 3.1 `$connect`
- 接続をグローバル掲示板 subscriber に追加

### 3.2 `$disconnect`
- 接続をグローバル掲示板 subscriber から削除

### 3.3 `sendMessage`
- Input body:
```json
{"action":"sendMessage","userId":"uuid","content":"hello"}
```
- 処理:
  - DB にメッセージ保存
  - 全接続へ `chat.message.created` を配信

## 4. Outbound Event Envelope
```json
{
  "type": "chat.message.created",
  "message": {
    "id": "uuid",
    "senderUserId": "uuid",
    "content": "hello",
    "createdAt": "2026-04-06T00:00:00.000Z"
  }
}
```

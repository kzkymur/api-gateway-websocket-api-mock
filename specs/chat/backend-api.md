# Chat Backend API and Route Handling Spec

## 1. Purpose
BE (SAM + Hono TypeScript) が提供する通常チャット向け API と、Mock Gateway の route integration で呼ばれる処理を定義する。

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

### 2.3 Create Room
- `POST /api/rooms`
- Request:
```json
{"name":"general"}
```

### 2.4 Join Room
- `POST /api/rooms/{roomId}/join`
- Request:
```json
{"userId":"uuid"}
```

### 2.5 List Messages
- `GET /api/rooms/{roomId}/messages?limit=50&before=<ISO8601>`
- Response 200:
```json
{"items":[{"id":"uuid","roomId":"uuid","senderUserId":"uuid","content":"hello","createdAt":"2026-04-06T00:00:00.000Z"}]}
```

## 3. WebSocket Route Integrations
Mock Gateway から BE へ route integration invoke される。

### 3.1 `$connect`
- 接続メタ情報を記録（connectionId -> userId は未確定）

### 3.2 `$disconnect`
- 接続情報と room subscription を削除

### 3.3 `joinRoom`
- Input body:
```json
{"action":"joinRoom","roomId":"uuid","userId":"uuid"}
```
- 処理:
  - 接続を room subscription に追加
  - 参加通知イベントを同 room 接続へ配信

### 3.4 `sendMessage`
- Input body:
```json
{"action":"sendMessage","roomId":"uuid","userId":"uuid","content":"hello"}
```
- 処理:
  - DB にメッセージ保存
  - room subscription の全接続へ `chat.message.created` を配信

## 4. Outbound Event Envelope
```json
{
  "type": "chat.message.created",
  "roomId": "uuid",
  "message": {
    "id": "uuid",
    "senderUserId": "uuid",
    "content": "hello",
    "createdAt": "2026-04-06T00:00:00.000Z"
  }
}
```

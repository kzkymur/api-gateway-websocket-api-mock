# Go JSON-RPC Backend API Draft Spec

## 1. Purpose
将来の高負荷処理向けに、会話 DAG 操作を JSON-RPC 経由で実行する BE 契約を定義する。

## 2. Endpoint
- `POST /rpc`
- Content-Type: `application/json`

## 3. Methods
### 3.1 `conversation.appendNode`
Request:
```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "conversation.appendNode",
  "params": {
    "conversationId": "uuid",
    "nodeType": "message",
    "payload": {"text": "hello"},
    "parentNodeIds": ["uuid"]
  }
}
```
Response:
```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "result": {
    "nodeId": "uuid",
    "headVersion": 42
  }
}
```

### 3.2 `conversation.getHeads`
- 指定会話の head ノード一覧を返す

### 3.3 `conversation.listNodes`
- ページング付きでノードを返す

## 4. Error Model
- JSON-RPC standard error を使用
- `-32010` optimistic lock conflict
- `-32020` invalid conversation state

## 5. Integration with Mock Gateway
- `sendMessage` route の BE 処理で `conversation.appendNode` を呼ぶ
- 成功時に `postToConnection` で購読者へ配信

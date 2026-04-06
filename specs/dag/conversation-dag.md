# Conversation DAG Model and Operation Contracts

## 1. Node Types
- `join`: ユーザ参加
- `leave`: ユーザ離脱
- `message`: 通常メッセージ
- `edit`: 既存メッセージ更新
- `system`: システム通知

## 2. Edge Semantics
- `next`: 時系列順の主系列
- `reply_to`: 返信関係
- `caused_by`: 操作起因（例: edit -> original message）

## 3. Operation Contracts
### 3.1 Append Message
Input:
- `conversationId`
- `authorUserId`
- `content`
- `parentNodeIds`

Guarantees:
- 新規 `message` ノードを生成
- `next` または `reply_to` エッジを追加
- 更新後 head を返す

### 3.2 Edit Message
Input:
- `targetNodeId`
- `newContent`

Guarantees:
- `edit` ノードを作成
- `caused_by` で対象ノードと接続
- 既存ノードは不変（append-only）

### 3.3 Rebuild Projection
- DAG 全ノードを順に適用して room state を再構築可能

## 4. Invariants
- ノードは immutable
- エッジは有向
- conversation ごとに少なくとも 1 つの head が存在

## 5. Use in Example Chat
- FE 表示用 state は projection テーブルまたはメモリキャッシュから生成
- 競合更新時は DAG へ両方保存し、表示側で解決ポリシー適用

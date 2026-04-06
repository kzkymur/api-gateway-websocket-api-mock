# PostgreSQL DAG Schema and Constraints (Draft)

## 1. Purpose
チャットの会話状態を append-only DAG として保持し、再投影可能な履歴基盤を提供する。

## 2. Core Tables
### 2.1 `dag_nodes`
- `id` UUID PK
- `conversation_id` UUID NOT NULL
- `node_type` TEXT NOT NULL (`message`, `join`, `leave`, `system`)
- `payload` JSONB NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `author_user_id` TEXT NULL

### 2.2 `dag_edges`
- `from_node_id` UUID NOT NULL
- `to_node_id` UUID NOT NULL
- `edge_type` TEXT NOT NULL (`next`, `reply_to`, `caused_by`)
- PK: (`from_node_id`, `to_node_id`, `edge_type`)
- FK: `from_node_id`, `to_node_id` -> `dag_nodes(id)`

### 2.3 `conversation_heads`
- `conversation_id` UUID PK
- `head_node_id` UUID NOT NULL
- `version` BIGINT NOT NULL

## 3. Constraints
- 自己ループ禁止: `from_node_id <> to_node_id`
- 重複エッジ禁止: PK で担保
- ノード作成時、最低 0 または 1 の `next` inbound を許容（枝分かれは `reply_to` で表現）

## 4. Indexes
- `dag_nodes (conversation_id, created_at)`
- `dag_edges (to_node_id)`

## 5. Transaction Rules
- ノード追加 + エッジ追加 + `conversation_heads` 更新を単一 transaction にする
- 楽観ロックとして `conversation_heads.version` を比較更新

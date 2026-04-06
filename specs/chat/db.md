# PostgreSQL Chat Schema and Constraints

## 1. Purpose
通常のリアルタイムチャットアプリに必要な最小データ構造を定義する。

## 2. Tables
### 2.1 `users`
- `id` UUID PRIMARY KEY
- `display_name` TEXT NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### 2.2 `rooms`
- `id` UUID PRIMARY KEY
- `name` TEXT NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### 2.3 `room_members`
- `room_id` UUID NOT NULL REFERENCES `rooms(id)` ON DELETE CASCADE
- `user_id` UUID NOT NULL REFERENCES `users(id)` ON DELETE CASCADE
- `joined_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- PRIMARY KEY (`room_id`, `user_id`)

### 2.4 `messages`
- `id` UUID PRIMARY KEY
- `room_id` UUID NOT NULL REFERENCES `rooms(id)` ON DELETE CASCADE
- `sender_user_id` UUID NOT NULL REFERENCES `users(id)`
- `content` TEXT NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

## 3. Indexes
- `messages (room_id, created_at)`
- `room_members (user_id, joined_at)`

## 4. Constraints
- 空メッセージ禁止: `char_length(trim(content)) > 0`
- 最大メッセージ長: `char_length(content) <= 4000`
- 同一 room への重複参加は PK で禁止

## 5. Transaction Rules
- メッセージ送信は DB insert 成功後に配信する
- 送信失敗時は DB rollback して配信しない

# Chat DB Schema Spec (PostgreSQL)

## 1. Purpose
グローバル掲示板サンプルで利用する永続化スキーマを定義する。

## 2. Tables
### 2.1 `users`
- `id` UUID PK
- `display_name` TEXT NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### 2.2 `messages`
- `id` UUID PK
- `sender_user_id` UUID NOT NULL REFERENCES `users(id)`
- `content` TEXT NOT NULL (`1..4000` chars, trim 後空不可)
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

## 3. Indexes
- `messages (created_at)`

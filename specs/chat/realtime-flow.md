# Realtime Chat Flow Spec

## 1. Goal
複数ユーザが同一 room のメッセージを同期的に閲覧・送信できること。

## 2. Connection Model
- FE は `ws://mock-gateway:8787/dev` に接続
- BE は Mock Gateway Management API `POST /dev/@connections/{connectionId}` で配信
- 接続管理ストアは v1 で in-memory（後続でRedis拡張可）

## 3. Sequence: Join and Receive
1. FE 接続
2. FE `joinRoom` を送信
3. BE が接続を room subscriber 集合に登録
4. FE が `sendMessage` を送信
5. BE が PostgreSQL に永続化
6. BE が room subscriber の各 `connectionId` に配信
7. FE が即時描画

## 4. Delivery Semantics
- ルーム内配信は at-least-once
- 同一接続内は送信順を維持
- 重複受信は FE 側で `message.id` により排除可能

## 5. Failure Handling
- `410 Gone`: 接続切れとして subscriber から除去
- DB insert 失敗: 送信エラーイベントを送信元へ返却
- Integration 呼び出し失敗: BE ログ記録、必要に応じて再送（v2）

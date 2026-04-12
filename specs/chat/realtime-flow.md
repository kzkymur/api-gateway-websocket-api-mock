# Realtime Flow (Global Board)

## 1. 接続
1. FE は `ws://mock-gateway:8787/dev` に接続
2. Mock Gateway は `$connect` integration を BE に POST
3. BE は `connectionId` をグローバル subscriber に登録

## 2. 投稿
1. FE は `{"action":"sendMessage","userId":"...","content":"..."}` を送信
2. Mock Gateway は routeKey=`sendMessage` で BE integration を呼び出し
3. BE は DB 保存後、全 subscriber に `chat.message.created` を送信

## 3. 切断
1. FE 切断時に Mock Gateway が `$disconnect` integration を呼ぶ
2. BE は subscriber から `connectionId` を削除

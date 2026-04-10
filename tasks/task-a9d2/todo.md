# Task Plan

- [x] 全 spec を読み、要件を抽出する
- [x] `example/mock-gateway` に Hono + WebSocket モックを実装する
- [x] `example/backend` に Hono + PostgreSQL + route integration 処理を実装する
- [x] `example/frontend` に TypeScript FE を実装する
- [x] `docker-compose.yml` と Dockerfile 群で一発起動構成を作る
- [x] 疎通確認（health, DB API, WebSocket 送受信）を実施する（環境制約で実行不能を確認）
- [x] specs / README / 作業レビューを更新する

## Review
- 仕様に沿って FE/BE/DB + mock-gateway を `example/` 配下に TypeScript で実装。
- mock-gateway は Hono ベースで単独コンテナ動作可能な構成。
- Docker および npm レジストリアクセス制約により、実コンテナ起動と実通信はこの環境で未実施。

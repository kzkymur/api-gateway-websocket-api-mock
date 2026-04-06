# API Gateway WebSocket API Mock: Product Spec (v0.1)

## 1. 目的
ローカル環境で **AWS API Gateway WebSocket API のインタフェースと挙動を高精度で模倣** する Docker コンテナを提供する。

- FE は WebSocket で接続
- BE は HTTP エンドポイントで接続
- FE/BE 間の相互通信を、API Gateway WebSocket API 互換の契約で実現
- ネットワーク周辺機能（AWS エッジ/インフラ固有）は除外し、それ以外の機能を模倣

## 2. 技術方針
- Mock Gateway: TypeScript + Hono
- FE (example): React + TypeScript + Vite (SPA)
- BE (example): AWS SAM CLI + Hono (TypeScript Lambda 相当レイヤ)
- DB (example): PostgreSQL
- 配布形態: Docker / Docker Compose（開発向け）

## 3. スコープ
### 3.1 In Scope (v1)
- WebSocket 接続受け付け（`$connect`, `$disconnect`, `$default`）
- ルート選択式（例: `$request.body.action`）に基づくルーティング
- ルートごとの Integration URI 呼び出し（API Gateway WebSocket route integration 相当）
- BE 向け HTTP 管理 API（`/{stage}/@connections/{connectionId}`）
- 接続状態管理（connectionId, 接続時刻, 最終活動時刻, 任意メタデータ）
- 複数クライアント同時接続時のメッセージ配送
- API Gateway 互換エラーの再現（主要パターン）
- API 形状と挙動の厳密互換を最優先（strict compatibility mode）
- `example/` に FE/BE/DB を統合した同期型チャットアプリ

### 3.2 Out of Scope (v1)
- 実 AWS ネットワーク機能（CloudFront, WAF, VPC Link, mTLS, グローバル分散）
- IAM/SigV4 の完全再現
- AWS マネージド監視基盤（CloudWatch Logs/Metrics/X-Ray）

## 4. 成果物
- `SPEC.md`: 全体設計・進行計画
- `specs/mock/*.md`: モックサービス仕様（WS/HTTP/互換性）
- `specs/dag/*.md`: 将来の会話DAG/DB/サービス契約（初版）
- `example/`: FE/BE/DB の統合サンプル

## 5. システム概要
```text
[FE Clients: React/Vite SPA] -- WebSocket --> [Mock Gateway Container (Hono/TS)]
                                                  | \
                                                  |  +--> [Management API: /{stage}/@connections/{id}] <-- HTTP -- [BE]
                                                  |
                                                  +--> [Route Integrations: routeKey -> Integration URI]
                                                             (ex: SAM local Lambda invoke endpoint)
                                                  |
                                                  +--> [State Store: in-memory (v1), optional external store (v2)]
                                                  +--> [PostgreSQL (example): chat persistence / projection]
```

## 6. 互換性ポリシー
- 優先度1: API 形状（URL・HTTPメソッド・JSON構造・ステータス）
- 優先度2: イベント順序と副作用（接続/切断/送信）
- 優先度3: エラーコード/メッセージの再現
- 優先度4: 運用機能（監視・認証・スロットリング）

## 7. 主要ユースケース
- FE が WebSocket で接続し、`{"action":"sendMessage", ...}` を送信
- Mock Gateway が route selection に従って対応 Integration URI を呼び出し
- BE が HTTP API 経由で特定接続または複数接続へ配信
- FE 複数ユーザが同期的にチャット更新を受信

## 8. フェーズ計画
1. Phase 1: コアモック（WS受信・HTTP送信・接続管理）
2. Phase 2: API Gateway 互換性拡張（エラー/ルート/管理API精度）
3. Phase 3: `example/` チャット統合（FE/BE/DB）
4. Phase 4: 負荷・再接続・障害注入テスト

## 9. 受け入れ基準 (DoD)
- 単一 Docker Compose でモック+サンプルが起動
- 3 以上の FE クライアントで同時通信が成立
- BE からの `/{stage}/@connections/{connectionId}` で配送成功/失敗が観測可能
- 主要 API について正常系/異常系テストが存在
- 仕様と実装の差分が `specs/mock/compatibility.md` に記録される

## 10. Spec Index

| spec file | description |
| --- | --- |
| specs/mock/websocket-interface.md | FE 向け WS インタフェース仕様 |
| specs/mock/http-interface.md | BE 向け HTTP 管理 API 仕様 |
| specs/mock/compatibility.md | API Gateway WebSocket API 互換ポリシー |
| specs/dag/db.md | PostgreSQL DAG schema and constraints |
| specs/dag/jsonrpc-service.md | Go JSON-RPC backend API draft spec |
| specs/dag/conversation-dag.md | Conversation DAG node model and operation contracts |

## 11. 次の作業
- 上記 specs を起点に API 契約テストを先行作成
- `example/` の FE/BE/DB 接続を最短で通す
- 互換性差分を埋める優先順位を定義

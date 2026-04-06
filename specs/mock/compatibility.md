# API Gateway WebSocket Compatibility Spec

## 1. Compatibility Target
対象: AWS API Gateway WebSocket API の主要開発体験をローカルで再現する。

## 2. Feature Matrix
| Feature | v1 Status | Notes |
| --- | --- | --- |
| `$connect/$disconnect/$default` | Supported | route key 解決あり |
| route selection (`$request.body.action`) | Supported | configurable |
| Management API (`/{stage}/@connections/{id}`) | Supported | stage 付き path を採用 |
| Route integration URI mapping | Supported | routeKey ごとに URI 設定 |
| Stale connection handling (410) | Supported | 主要動作再現 |
| Binary frame handling | Not supported | v2 で検討 |
| IAM/SigV4 auth | Not supported | out of scope |
| Custom domain / edge networking | Not supported | out of scope |
| CloudWatch integration | Not supported | ローカルログで代替 |

## 3. Behavior Parity Rules
- 可能な限り API Gateway に近い HTTP status を返す
- route key 解決の優先順序を固定化する
- 切断済み connection への送信は必ず 410
- strict compatibility mode をデフォルトにし、拡張APIは無効化する
- 互換性差異が残る場合、理由と回避策を本ファイルに追記

## 4. Parity Tests
- 正常系
  - connect -> message -> route integration invoke -> postToConnection -> FE receive
- 異常系
  - unknown connection 送信 -> 410
  - invalid JSON -> `$default`
  - integration timeout -> error log + retry policy (v2)

## 5. Known Gaps (initial)
- 本番同等の接続スケーリングは非対象
- AWS 固有 requestContext フィールドは一部省略
- SigV4 認証なしで Management API を直接呼べる（ローカル開発都合）

# Lessons

## 2026-04-06
- Pattern: 独自用語（例: `INTEGRATION_BASE_URL`）が先に出ると、AWS互換を重視する要求と衝突しやすい。
- Rule: 初期仕様段階から AWS 公式概念名（Integration URI, route integration, ApiGatewayManagementApi 相当）を優先し、独自拡張は `Mock Extension` と明示する。

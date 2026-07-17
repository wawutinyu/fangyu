# 方隅·知（向量层）

本地自有向量存储，供知识库 / 记忆 / Agent 共用。**不是**外部分布式向量库替代品，而是方隅控制面内的第一方能力。

## 位置

| 路径 | 说明 |
|------|------|
| `engine/vectorstore/` | 核心 API |
| `data/vector/*.sqlite` | 每个 collection 一个文件 |
| `GET /api/v1/knowledge/vector-status` | 探活 |

## API（Python）

```python
from fangyu.engine.vectorstore import get_default_store, VectorRecord

col = get_default_store().collection("knowledge")
col.upsert([
    VectorRecord(id="chunk:1", vector=[...], payload={"content": "...", "doc_id": 1}),
])
hits = col.search(query_vec, query_text="巡检", top_k=5)
col.delete_where(doc_id=1)
```

## 检索

混合分：向量余弦 × 0.6 + payload 文本 n-gram × 0.4（无查询向量则纯文本）。

## 演进

1. ✅ SQLite 持久化 + 暴力/混合检索
2. ✅ 知识库 collection `knowledge`
3. ✅ 记忆 collection `memory`（JSON 双写 + 语义检索）
4. ✅ Agent 运行时：`scope=agent:{name}`，memory search / LLM 注入 / knowledge knowledge / 回合写入
5. 可选 HNSW 后端（同 Collection API）

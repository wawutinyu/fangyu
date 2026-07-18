---
id: implement-and-verify
description: 改代码必须走实现→验证→再改闭环
when: 任何会修改仓库文件的编码任务
---

# implement-and-verify

改代码必须走「实现 → 验证 → 再改」闭环，禁止只改不测。

## 步骤

1. **定位**：用 glob / grep / read 找到相关文件，禁止臆造路径。
2. **最小改动**：用 write 或 apply_patch 做小步修改。
3. **验证**：优先用 shell 跑项目测试或最小检查（如 `python -m pytest`、`python -c ...`）。
   - 写文件的 shell（重定向、rm、pip install 等）在 ask 策略下须 `confirm=true`。
4. **读失败**：若验证失败，根据 stdout/stderr 再改，不要重复同一无效调用。
5. **收口**：验证通过后再 `done`，结论里写清改了什么、怎么验的。

## 反例

- 改完直接 done、从未跑验证
- 验证失败却声称成功
- 空转重复同一 shell/patch

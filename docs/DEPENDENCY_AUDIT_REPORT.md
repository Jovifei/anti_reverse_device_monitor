# 依赖漏洞审计报告

审计时间：2026-07-22。执行命令：`npm audit`。

| 依赖 | 级别 | 直接依赖 | 影响与处理 |
|---|---|---:|---|
| `next` | high | 是 | 传递引入 vulnerable `postcss` 与 `sharp`；当前自动建议会降级到不兼容的 Next 9，未执行。 |
| `postcss` | moderate | 否 | Next 的传递依赖；存在 CSS stringify XSS 公告，需随兼容 Next 升级处理。 |
| `sharp` | high | 否 | Next 的传递依赖；公告涉及 libvips 漏洞，需随兼容 Next 升级处理。 |
| `xlsx` | high | 是 | 公告涉及原型污染和 ReDoS；当前 `npm audit` 无可用修复，需评估替代或强化上传隔离。 |

合计：4 项（3 high，1 moderate，0 critical）。本轮未执行 `npm audit fix --force`，以避免破坏 Next 15 的已验证构建。生产部署前应在隔离分支完成兼容升级或替代依赖评估。

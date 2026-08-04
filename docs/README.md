# 防逆流设备监控 — 文档索引

本仓库文档以扁平编号文件为主（`docs/NN_*.md`），另有专题报告与学习笔记。优先更新现有文档，不另起无关脚手架。

## 快速入口

| 文档 | 用途 |
|------|------|
| [项目总览](01_PROJECT_OVERVIEW.md) | 背景、业务问题、产品形态 |
| [操作手册](11_OPS_RUNBOOK.md) | 本地启动、同步、Docker、卡死恢复 |
| [当前完成情况](05_CURRENT_STATUS_AND_DELIVERABLES.md) | 已交付能力与已知限制 |
| [Mongo 只读源](MONGODB_READONLY_SOURCE.md) | Mongo 联调与 Docker 部署命令 |
| [系统架构](03_SYSTEM_ARCHITECTURE.md) | 模块与数据流 |
| [安全与部署](08_SECURITY_AND_DEPLOYMENT.md) | 安全边界与部署原则 |
| [文档关系图](10_DOCUMENT_RELATIONSHIP_MAP.md) | 文档之间的依赖 |
| [技术路线学习](10-STUD-学习/01-STUD-技术路线总览.md) | 术语速查 + 每节功能介绍（面向嵌入式） |

## 信任标记

| 标记 | 含义 |
|------|------|
| ✅ 已验证 | 有代码路径 / 单测 / 本地运行或 API 证据 |
| ⚠️ 待环境验证 | 本机未跑通（例如未安装 Docker） |
| 🎯 目标能力 | 设计目标，尚未实现 |

## 根目录入口

日常操作也见仓库根 [`README.md`](../README.md)。

# 2026-11-02 功能补齐与验收状态

本轮完成软件功能和技术验证，未制作 Word/PDF 汇报或 PPT，未发布 Issue、提交或推送代码；宠物素材保持原样。PRD 与 Issue 已整理为 `../issue-drafts/` 下的本地草稿，等用户人工验收。

## 已补齐

- 活动入口：预算、时间硬筛选，诉求匹配和已确认喜欢/想尝试加权，显示理由、费用与模拟来源；空结果可调整条件。
- 接受、拒绝、调整条件、体验反馈；默认只记当次，明确确认才更新长期画像及来源。单次拒绝不自动形成反感。
- 既有画像内容与类型可编辑、删除，展示来源和更新时间。
- 聊天可选择原话连同 Agent 回应保存；日记分开展示回应。默认仍不保存，已确认情绪支持再次修改。
- 创建及回看日记可逐篇撤回记忆许可；全局开关继续有效。
- 四种来源明确的 WHO 自助练习，可真正切换替代建议。这是来源链接和改编，不是对本产品效果的科学认证，新文案仍待用户验收。
- 七天情绪时间图：按日期显示已确认标签与条数，可定位具体记录；未记录不推断情绪，不给情绪打分。
- 公开中文八类混合语料清洗与 LR/SVM 分类评估，独立于在线 LLM；见 `../public-classification/README.md`。
- 审查发现并修正原有跨日记状态错误：A 的删除确认及未提交补充不再带到 B。

## 验证结果

| 验证 | 最新结果 | 证据 |
|---|---|---|
| Docker 完整后端 | 52 passed；1 条 Starlette/AnyIO 弃用警告 | `backend/tests`，干净镜像再测通过 |
| 全部浏览器套件 | 5 套顺序执行通过 | `frontend/tests/full-regression.mjs` |
| 原有四页流程 | 10 组场景通过 | `../design/product-validation/results.json` |
| 新增功能闭环 | 4 组闭环 + 390/1440 布局、按钮命中通过 | `results.json` |
| 七天时间图 | 日期、空白日、别名、日记定位、手机布局通过 | `timeline-results.json` |
| 跨日记状态 | 先复现失败，再修复通过 | `diary-selection-results.json` |
| 聊天保存 | 5 组场景通过，含原话单独保存、失败重试、禁用保存、再次修改情绪 | `../design/chat-memory-validation/results.json` |
| 真实 DeepSeek | 本轮新调用 8/8 与审核标签一致，15/15 项检查通过，零页面异常 | `llm/results.json` |
| 公开分类 | LR 宏 F1 0.8574、SVM 宏 F1 0.8719；各20个错例 | `../public-classification/metrics.json` |
| Docker 无依赖缓存重建 | 从零 npm ci / pip install 成功，空卷启动并跑完整回归 | 项目 `heartnest-clean-1102` |
| 默认演示部署 | 8080 已更新，部署前后14篇日记、2条画像ID完全一致 | `default-before.json`、`default-smoke.json` |
| 备用真实操作录屏 | 模拟内容、离线规则、无声 WebM | `../demo/heartnest-demo.webm`、`../demo/recording.json` |

真实模型测试仅使用经审核的虚构日记。8/8 是小样本一致性，不是通用准确率或陪伴效果证明；旧 `../diary-acceptance-llm/` 的原始结果和人工复核记录均保留。公开分类数据中存在 AI 文本，也不能代表线上 DeepSeek。

## 截图与修复历史

已打开查看桌面/手机活动反馈、偏好设置、时间图，以及真实模型的开心分享、日历截图。`390-activity-viewport.png` 验证活动按钮已离开底部导航遮挡区域。

`failure.png` 保留了手机反馈按钮的原始失败截图；当时自动审批服务因额度故障返回403，中断了一次部署。服务恢复后已重新部署并复测通过，最新 `results.json` 为 true。新增清洗测试曾把 NFKC 后的半角叹号误写为全角；修正预期后全套通过。

## 人工待办

本地源码包可使用 `scripts/package-source.ps1` 生成到 `delivery/HeartNest-source-review.zip`；不含个人运行数据库、API Key 或依赖缓存。录屏的播放方式与边界见 `../demo/README.md`。两者仅供本地验收，不自动发布。

- 用户验收新建议文案、PRD 与 Issue 草稿后再发布。代码尚未提交/推送，正式课程提交仍需人工审核。
- 按用户要求，Word/PDF 汇报与 PPT 本轮不撰写。
- 课程截止为2026-11-03 08:59（Asia/Shanghai）；若只提供私有仓库链接，需确认老师可访问，或附代码包。
- 在线 Demo 为可选项；当前为单用户本地原型，未增加公网多用户认证或隔离。

运行和复跑命令见 `../DOCKER.md`。端口18080用于隔离验证，不将测试脚本指向默认用户库8080。

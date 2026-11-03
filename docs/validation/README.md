# 场景验证与改进索引

核对：2026-11-03；Issue #13。该索引记录技术证据与未验收边界，不是疗效研究或零缺陷保证。历史报告保留当时测试数量；本轮复跑另列，不把不同版本相加。私有默认实例只读，不将变更测试指向8080。

## 本轮复跑

| 项目 | 方式 | 结果/证据 |
|---|---|---|
| 后端全部用例 | 现有Python3.11镜像、只读挂载当前backend、无网络、临时SQLite；`python -m pytest tests -q -p no:cacheprovider --basetemp /tmp/issue-closeout-tests` | 173 passed，1条Starlette/AnyIO弃用警告；含规则、模型接口模拟、权限与日期边界，不是真实云端质量测试 |
| 核心浏览器与放松衔接 | 18080最新前端；五套核心顺序回归、quiet-scene、relaxation-flow、conversation-continuity | 均通过；湖边5组、放松6组、连续会话5组；替代建议旧文案断言失效后改为保留原卡/新增不同建议的真实行为断言并重新通过 |
| 公网访客边界 | `node tests/public-demo.mjs`，18081 | 两访客隔离、称呼确认、日记保存删除、切页与刷新均通过，零页面脚本错误；本轮为本地演示端口，非新一轮真实HTTPS |
| 文档、公开数据与指标 | `python scripts/audit-documentation.py`；源码AST读字段，不导入运行app，临时目录重跑分类 | 当前字段覆盖、文档链接与公开结果比对；机器结果见[本轮记录](issue-closeout.json) |
| 隐私说明UI | Vite/Docker构建；`node tests/privacy-disclosure.mjs`，独立18081访客 | 1363/568/390三宽通过，默认折叠、展开/收起与无横向溢出；[结果](../design/privacy-disclosure/results.json)，截图实际打开检查 |

完整复跑清单、命令与剩余状态记录在 [issue-closeout.json](issue-closeout.json)。分类首次尝试写历史图表被文件权限拒绝，改为临时目录输出并比对，不把失败当通过，也不修改权限或运行库。

## 核心场景映射

下表区分“已有通过记录”与本轮复跑，历史截图/结果可以审查但不等于本轮重新调用了云端模型。

| 场景与应有行为 | 可复跑脚本（frontend目录）/后端用例 | 已有证据 |
|---|---|---|
| 记录保存；原话/原话加回应；不保存仍回应 | `tests/chat-memory.mjs`；`backend/tests/test_completion.py` | [聊天保存5组](../design/chat-memory-validation/README.md) |
| 情绪确认、纠正、跳过，用户判断优先 | `tests/nature-product.mjs`、`tests/chat-memory.mjs`；`test_scenario_matrix.py` | [主流程](../design/product-validation/results.json)、[虚构日记](../diary-acceptance/README.md) |
| 历史检索必须返回真实原文/日期，无命中不编造 | `tests/nature-product.mjs`；`test_api.py`、`test_extended.py` | [主流程](../design/product-validation/results.json)、[保存与检索](../design/chat-memory-validation/results.json) |
| 关闭全局或单篇记忆后不再引用；删日记后不再命中 | `tests/chat-memory.mjs`；`test_completion.py`、`test_scenario_matrix.py` | [保存权限](../design/chat-memory-validation/README.md)、[技术补齐](../completion-validation/README.md) |
| 预算/时间硬筛选；单次拒绝不推导长期反感 | `tests/completion.mjs`；`test_completion.py`、`test_advice_policy.py` | [活动与画像](../completion-validation/results.json)、[建议规则](../design/advice-evidence/README.md) |
| 每条练习有文献或明确偏好，拒绝后更换、不适停止 | `tests/advice-evidence.mjs`；`test_advice_policy.py` | [来源与限制](../design/advice-evidence/README.md)，不保证自由聊天每句话均被科学审核 |
| 提议改称呼/记录习惯，先确认再保存；取消不改 | `tests/profile-proposals.mjs`；`test_profile_proposals.py` | [资料确认](../design/profile-proposals/README.md)，真实云端提取部分仍待独立验证 |
| 日历切月、确认情绪、打开独立详情、编辑补充删除 | `tests/full-regression.mjs`、`tests/diary-reader.mjs`；`test_scenario_matrix.py` | [阅读页](../design/diary-reader/README.md)、[日期边界](../design/diary-dates/README.md)、[时间线](../completion-validation/timeline-results.json) |
| 长消息跨轮、失败直接重试、不重复保存、来源说明 | `tests/conversation-reliability.mjs`；`test_conversation_limits.py`、`test_reply_provenance.py`、`test_communication_policy.py` | [#18–#21修复记录](../design/conversation-reliability/README.md)，含模型模拟与历史真实6例分开说明 |
| 正常聊天→一次放松邀请→接受/拒绝→湖边/练习→返回 | `tests/relaxation-flow.mjs`、`tests/quiet-scene.mjs` | [衔接6组](../design/relaxation-validation/results.json)、[安静空间5组](../design/quiet-scene-validation/results.json)；历史叙述、倾诉限定和安全信号不应被标签强制邀请 |
| 湖边默认静音、减少动态、单宠物、离开/后台停音 | `tests/quiet-scene.mjs` | [安静空间记录](../design/quiet-scene-validation/results.json)；AudioContext检查不能代替真实听感 |
| 切页/湖边往返保留消息、草稿及失败状态 | `tests/conversation-continuity.mjs` | [连续会话](../design/conversation-continuity/README.md)；刷新/关闭后无恢复，未擅自永久保存拒绝 |
| 最近已确认状态主动开场，关闭记忆使用通用问候 | `tests/companion-opening.mjs`；`test_companion_opening.py` | [开场验证](../design/companion-opening/README.md)；只使用授权标签，不发送日记原文 |
| 宽屏留白、窄屏按钮间距、折叠文字、固定页脚 | `tests/responsive-layout-review.mjs`、`tests/compact-composer.mjs` | [10种窗口](../design/responsive-layout-review/results.json)、[紧凑输入区](../design/compact-composer/README.md)；浏览器模拟不等于实体手机 |
| 公网双访客隔离、Cookie、删除、刷新已授权数据 | `tests/public-demo.mjs`；`test_public_demo.py` | [本地/真实HTTPS记录](../design/public-demo/README.md)；Cookie访客隔离不是账号认证 |
| 公开分类宏F1、混淆矩阵、至少3错例 | `python backend/public_classification.py`（根目录）；`test_public_classification.py` | [公开实验](../public-classification/README.md)，每模型20错例；不等于线上LLM准确率 |

## 运行与证据分层

1. 后端离线单测在临时数据库中执行，模型结果用受控替身，验证程序分支及授权，不验证真实模型理解能力。
2. 浏览器普通主流程使用隔离18080；公网演示与本轮隐私UI使用18081独立访客。发送、保存、编辑和删除都只用虚构内容。每项修改后需重新构建、部署、走原路径并打开截图检查。
3. 历史真实模型记录：[8篇虚构日记结果](../completion-validation/llm/results.json)、[沟通6例逐条复核](../design/conversation-reliability/README.md)。本轮不再次付费调用，不把旧结果改写为新测试。
4. 当前公网采用本地规则，不能拿公网Demo证明DeepSeek效果；临时隧道不保证长期可用。[部署说明](../PUBLIC-DEPLOYMENT.md)。

## 当前问题与后续验收

- #18–#20原复现缺口已有修复和沿原路径回归；#21有来源映射、版本化约束与小样本复核。历史失败截图保留，不再将它们列为未修复的已知功能故障。
- **#22仍待用户最终人工认可**：建议原文/出处/改编范围、自然聊天与整体流程。Agent读文案与自动化通过不能替代用户确认。
- **#23仍待实体手机**：软键盘、浏览器工具栏、安全区、旋转及导航遮挡；桌面模拟不代勾通过。
- **#24仍待真实听感**：扬声器/耳机的音量、杂音、循环和开关突变，以及实机后台行为。
- 缺少生产级账户/加密、多实例能力；自由生成、规则意图与去重可能误判；近似文本泄漏、跨语料能力未验证。见[隐私与局限](../PRIVACY.md)。

技术索引完成不等于以上三项通过，也不等于课程文档/PPT已正式提交。Issue #13的最终综合验收仍须等待#22–#24，不能将“有索引”写成“所有场景已获人工认可”。

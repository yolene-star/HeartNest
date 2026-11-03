# Issue 3、9、12、13 文档收尾 Implementation Plan

> **For agentic workers:** 按下列步骤在当前会话逐项执行与复核，不使用并行写入。

**Goal:** 以可核对的代码、公开数据和测试产物补齐四项文档任务，保留尚未通过的人工验收。

**Architecture:** 数据来源、字段字典、隐私说明分别维护；验收索引链接具体证据，区分本轮复跑与历史记录。GitHub Issue 同步完成范围与保留项。

**Tech Stack:** Markdown、Python、FastAPI/Pydantic、Docker、Playwright。

**Spec:** GitHub yolene-star/HeartNest issues #3、#9、#12、#13。

## Global Constraints

- 不读取个人运行数据库或密钥；测试只使用临时数据库与隔离实例。
- 不将公开八类分类成绩等同线上 LLM 或疗效；不代替用户、实体手机、真实听感验收。
- 仅整理本任务文档，不混入未提交的宠物素材修改。

## Tasks

- [x] #3：核对数据 SHA、清洗/分割与实际八类标签；新增标签对应说明并更新旧预处理文档。
- [x] #9：对照 main.py 输入模型及实际返回字典，编写含类型、默认值、空值、来源与权限的字段字典。
- [x] #12：核对 LLM 发送字段、保存/调用授权、删除级联、临时候选与公网 Cookie 隔离，统一说明入口。
- [x] #13：建立核心场景→脚本→证据→结果/限制的索引；复跑离线后端、公开分类与必要浏览器流程。
- [x] 检查 Markdown 链接、差异和文档与代码一致性；同步四条 Issue，列明未替代 #22–#24。

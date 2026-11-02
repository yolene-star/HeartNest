# HeartNest（心栖）：个性化情绪陪伴工具

临时公网演示（2026-11-03 验证）：https://capacity-closely-restricted-operation.trycloudflare.com 。需演示电脑和隧道保持在线；使用本地规则回应、浏览器独立数据。启动、停止、数据边界与验证方法见 [公网部署说明](docs/PUBLIC-DEPLOYMENT.md)。

## 推荐：Docker Compose

```powershell
docker compose up --build -d
```

打开 http://localhost:8080 ，接口文档 http://localhost:8080/docs 。
环境封装、数据保存和检查命令见 [Docker 说明](docs/DOCKER.md)。本轮实现、验证结果及尚未通过的项目见 [补齐验收记录](docs/completion-validation/README.md)。

## 启动后端

```powershell
cd backend
# 本地运行使用 Python 3.11；推荐使用上面的 Docker 环境
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

接口文档：http://localhost:8000/docs

## 启动前端

```powershell
cd frontend
npm install
npm run dev
```

浏览器打开 http://localhost:5173。

## 运行分类指标

```powershell
cd backend
python classification.py
```

指标文件输出到项目根目录的 `data/classification_metrics.json`。这是模拟中文文本的独立测试，不代表公开数据或真实用户上的表现。

## 演示顺序

1. 首次使用，听伙伴自我介绍并选择角色，设置称呼与陪伴习惯；记忆调用默认关闭。
2. 在“陪伴”聊天，确认或修改情绪。聊天默认不保存；可以选择保存原话，也可勾选“同时保存心栖回应”。
3. 点击“给我一个小建议”，查看可选练习及其依据，接受、拒绝或更换。
4. 在陪伴页打开“一起找个小活动”，按诉求、时间、预算筛选模拟活动。只有明确勾选记为长期偏好，反馈才会更新画像。
5. 在“我的”查看、修改或删除偏好；在“日记”切换心情日历与列表，打开具体记录，编辑、补充或删除。
6. 开启全局记忆后，在聊天中询问过去的经历，核对引用原文和日期。关闭单篇或全局记忆后重复询问，确认不再引用。
7. 在“回顾”查看最近七天已确认的情绪统计、时间分布图和对应日期记录；未记录的日期不推断为平静。

备用真实操作视频：[heartnest-demo.webm](docs/demo/heartnest-demo.webm)（无声、模拟内容、离线规则；用浏览器播放）。PRD 和 Issue 待审稿见 [产品需求](docs/issue-drafts/00-PRD.md) 与 [验收待办](docs/issue-drafts/01-release-acceptance.md)。

## 公开数据分类实验

保留原有微型模拟实验，同时补充 [公开中文八类情绪基线](docs/public-classification/README.md)。训练集 3321 条、独立测试集 831 条；清洗后才划分，TF-IDF 仅拟合训练集。运行 `python backend/public_classification.py` 会输出指标、每类结果、混淆矩阵与错例。该数据混合人工和 AI 文本，标签与产品不完全相同，不能将其成绩当成在线 DeepSeek 的准确率。

项目只用于日常情绪记录、自我回顾和活动选择辅助，不承担心理诊断或治疗功能。

## 可选：接入 DeepSeek 或其他 OpenAI 兼容模型

默认使用本地规则回复，不需要 API Key。需要更灵活的自然语言回复时，复制 `.env.example` 为 `.env`，填写 DeepSeek Key 后启动：

```powershell
Copy-Item .env.example .env
# 编辑 .env，填写 LLM_API_KEY
docker compose up --build -d
```

默认配置使用 `https://api.deepseek.com` 和 `deepseek-flash`，也可以通过 `LLM_BASE_URL`、`LLM_MODEL` 切换到其他 OpenAI 兼容服务。LLM 负责结构化情绪与意图理解，以及自然表达；记忆权限、实际检索和有来源的行动建议仍由本地逻辑控制。接口失败时回退到规则，并标明判断来源。API Key 只通过环境变量传入，不要提交到 Git。流程、云端数据范围和验收方式见 [LLM 文本理解说明](docs/llm-understanding.md)。

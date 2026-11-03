# 心栖 HeartNest

一个以小动物 Agent 为入口的情绪陪伴与心情日记工具。面向有日常表达、记录和放松需求的大学生，先陪你聊聊，再由你决定是否留下记录、回顾经历或寻找一个轻量的下一步。

课程项目采用 Vibe Coding 方式开发，前端为浅绿手账风格，使用 React + Vite，后端为 FastAPI，数据通过 SQLite 持久化，运行环境由 Docker Compose 封装。

## 体验入口

- **临时在线 Demo**：[打开心栖](https://exam-lit-firmware-hampton.trycloudflare.com)（2026年11月3日启动脚本已验证网页与 API）。免注册，浏览器访客数据隔离，默认关闭云端模型，使用本地规则回应。
- **本地访问**：[http://localhost:8080](http://localhost:8080)，启动方法见下文。
- **接口文档**：[http://localhost:8080/docs](http://localhost:8080/docs)。

临时公网依赖演示电脑、Docker 和隧道持续在线，地址可能失效。请使用虚构内容体验；访客会话闲置24小时后过期。部署、隔离范围和链接恢复方法见 [公网部署说明](docs/PUBLIC-DEPLOYMENT.md)。

## 已实现功能

| 功能 | 使用方式与边界 |
|---|---|
| 宠物陪伴与聊天 | 首次通过伙伴自我介绍选择形象；悬浮桌宠可拖动，聊天显示伙伴头像；跨页面保留本次聊天与草稿 |
| 个性化开场 | 开启记忆后，结合最近七天已确认、允许调用的心情定制问候；无数据时使用通用开场 |
| 独立心情日记 | 写作和阅读为独立页面，支持编辑、补充、删除；前后端均禁止未来日期 |
| 心情日历与回顾 | 按日期打开日记，查看已确认情绪的统计和变化；无记录日期不推断为平静 |
| 授权记忆 | 保存原话和保存回应分别选择；检索返回真实原文与日期，关闭授权或删除后不再用于新检索 |
| 确认式用户画像 | 理解称呼、回应习惯及个人特征的更新诉求，先提议、确认后写入；支持查阅、修改与删除 |
| 放松建议与反馈 | 从有文献或明确偏好依据的候选中筛选，展开查看来源、改编及限制；接受、拒绝、不适和长期避开分别处理 |
| 安静陪伴 | 手绘湖景与当前伙伴，不要求打卡或完成任务，声音默认关闭 |

聊天始终会回应，**是否保存是独立选择**。临时聊天跨栏目切换保留，刷新或关闭页面后的恢复尚未实现。项目用于日常陪伴、自我回顾和活动选择辅助，不承担心理诊断或治疗。

## 一键启动本地网页与公网访问

安装并启动 Docker Desktop，安装 cloudflared 后，在 Windows 双击根目录的 **启动心栖.cmd**，或执行：

```powershell
./Start-HeartNest.ps1
# 镜像已有且源码未变时可跳过构建
./Start-HeartNest.ps1 -NoBuild
```

脚本会启动独立的本地演示（18081），建立公网隧道，验证公网网页和 API 后显示网址。把输出的网址发给其他人，他们直接用浏览器访问即可。重复启动会验证旧地址，可用时复用，失效时重建。当前网址同时保存于 `.deps/public-demo/current-url.txt`。

公网演示与个人使用的8080数据隔离。请保持本机联网及 Docker、隧道在线；临时隧道重建后网址可能变化。若要求重启后网址始终不变，还需配置自有域名和固定隧道。只运行普通 `docker compose up` 不会建立公网入口。

停止公网与本地演示：`./scripts/stop-public-demo.ps1`。仅关闭公网、保留本地：`./scripts/stop-public-demo.ps1 -KeepDocker`。

## Docker 快速启动

准备 Git、Docker Desktop（启用 Linux 容器）和下载镜像、依赖所需的网络。完整实现目前在 `feature/heartnest-notebook-agent` 分支：

```powershell
git clone https://github.com/yolene-star/HeartNest.git
cd HeartNest
git switch feature/heartnest-notebook-agent
docker compose up --build -d
```

浏览器打开 [http://localhost:8080](http://localhost:8080)。默认使用本地规则，无需 API Key。Nginx 托管前端，将 `/api/` 反向代理到后端，后端不直接暴露宿主机端口。

```powershell
# 查看服务与健康状态
docker compose ps
# 查看最近日志
docker compose logs --tail=100
# 停止服务，保留数据
docker compose stop
```

日记、画像、反馈与设置保存在 Docker 命名数据卷中，普通停止和 `docker compose down` 保留数据。不要为日常重启执行 `docker compose down -v`，该命令会删除数据卷。完整说明见 [Docker 运行指南](docs/DOCKER.md)。

## 可选接入 DeepSeek

模型用于结构化情绪与意图理解，以及普通聊天的自然回应。后端负责实际检索、授权、资料确认和建议筛选。调用或输出校验失败时回退本地规则，并返回来源信息。

首次配置时复制示例文件；已有 `.env` 时直接编辑，避免覆盖原配置：

```powershell
Copy-Item .env.example .env
```

在 `.env` 中设置：

```dotenv
LLM_ENABLED=true
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash
LLM_TIMEOUT=18
LLM_API_KEY=填写你自己的密钥
```

模型名称按服务商账户实际可用项调整，也可使用兼容的其他服务。更新配置后运行 `docker compose up --build -d`。密钥只由后端环境变量读取，不要提交 `.env`。

**不保存聊天不等于不发送云端。** 启用模型后，当前消息和最近最多6条会话上下文可能发送到服务商。关闭记忆限制新的历史调用，删除记录不能撤回已展示或已发送的文字。详细边界见 [隐私说明](docs/PRIVACY.md) 和 [LLM 接入说明](docs/llm-understanding.md)。

## 主要实现方法

- **对话流程**：React 发送消息和最近上下文，FastAPI / Pydantic 校验后按安全、回忆、建议、普通聊天等分支响应。聊天回复与授权保存分别处理。
- **长期记忆**：对允许检索的已保存日记原文、已保存回应构建 TF-IDF，使用中文双字片段和英文词项计算余弦相似度，聊天回忆返回前三篇。无正分命中不编造记忆，补充段落目前尚未进入检索。
- **画像确认**：候选证据须出现在当前输入中。待确认提议30分钟过期，重复确认保持幂等，称呼冲突检查防止陈旧提议覆盖新设置。
- **建议依据**：后端筛选受控候选库，结合前后文、风险及明确偏好选择建议，返回文献或偏好来源。一次拒绝只影响本轮，长期避开需另行确认。有失控或负面影响的行为不会因喜欢而优先推荐。
- **数据存储**：SQLite 保存 JSON 状态快照，公网演示按访客隔离。当前为单进程课程原型，尚未实现正式账户系统或多进程共享状态。

## 推荐体验顺序

1. 选择伙伴并设置称呼，进入聊天。发送“今天很累，但想找点轻松的事情”。
2. 展开聊天设置，选择是否保存原话和回应；保存后可确认或修改情绪。
3. 请求“给我一个小建议”，展开“依据与适用范围”，尝试拒绝、更换或明确选择以后避开。
4. 说“从今天开始叫我小红”，确认更新后在“我的”核对；也可修改或删除其他画像内容。
5. 在“日记”独立写作，再通过日历打开、编辑、补充或删除记录。
6. 开启全局及单篇记忆，询问过去经历，核对引用。关闭授权或删除后重复询问，检查后续检索不再引用。
7. 进入“陪我待会儿”，返回聊天，检查本次会话保留。

“一起找个小活动”会将相关请求带入对话，与 Agent 继续讨论。活动目录为模拟数据，时间、费用和地点供原型演示，不连接实时地图或真实商家。仓库保留 [历史无声操作录屏](docs/demo/heartnest-demo.webm)，其外观和流程以录制时版本为准。

## 验证与分类实验

2026年11月3日的 [验证记录](docs/validation/issue-closeout.json) 包含：隔离 Docker、临时 SQLite、关闭 LLM 条件下174项后端测试通过，1条第三方依赖弃用警告；另有日记、隐私、资料确认、建议及多尺寸浏览器回归。测试证明已覆盖的程序行为，不代表零缺陷或真实用户情绪改善。详细证据见 [场景验证索引](docs/validation/README.md)。

后端回归可在临时数据库中重跑，不修改正常实例的日记：

```powershell
docker compose run --rm --no-deps -e LLM_ENABLED=false -e COMPANION_DB=/tmp/heartnest-tests.sqlite3 backend python -m pytest tests -q --basetemp=/tmp/heartnest-tests -p no:cacheprovider
```

离线实验使用公开中文八类情绪语料，4159条清洗为4152条，固定种子42，分层切分训练3321条、测试831条。字符1–3 gram TF-IDF 仅拟合训练集，比较两个基线：

| 模型 | 准确率 | 宏平均 F1 |
|---|---:|---:|
| LogisticRegression | 0.8592 | 0.8574 |
| LinearSVC | 0.8736 | 0.8719 |

安装后端依赖后，在仓库根目录运行：

```powershell
python backend/public_classification.py
```

结果输出到 `docs/public-classification/`，包含每类指标、混淆矩阵与每模型20条错例。数据混合人工与AI文本，标签与产品不完全一致，**该分类器尚未部署到线上**，指标不能当作 DeepSeek 或真实日记效果。数据来源、处理和局限见 [公开分类实验](docs/public-classification/README.md)。原微型模拟实验 `python backend/classification.py` 仅用于程序演示，另输出 `data/classification_metrics.json`。

## 本地开发

Docker 是推荐运行方式。需要前后端分别调试时，使用 Python 3.11 和 Node.js 24，在两个终端执行：

```powershell
# 终端一：后端
cd backend
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```powershell
# 终端二：前端
cd frontend
npm ci
npm run dev
```

前端访问 [http://localhost:5173](http://localhost:5173)，后端文档位于 [http://localhost:8000/docs](http://localhost:8000/docs)。

## 文档与参考来源

- [产品需求 PRD](docs/issue-drafts/00-PRD.md)
- [数据来源与字段字典](docs/data/README.md)
- [隐私、云端处理与删除边界](docs/PRIVACY.md)
- [建议依据与实现说明](docs/design/advice-evidence/)
- [场景验证与改进记录](docs/validation/README.md)
- [Docker 运行指南](docs/DOCKER.md) 与 [公网部署指南](docs/PUBLIC-DEPLOYMENT.md)

建议资料包含 [WHO 压力应对指南](https://www.who.int/publications/i/item/9789240003927)、[音乐干预系统综述](https://pubmed.ncbi.nlm.nih.gov/31167611/) 和 [自然接触研究](https://pubmed.ncbi.nlm.nih.gov/26124129/)。建议的简短改编与网页湖景没有被这些研究直接验证，来源核对不等于临床审核。

开发由 Codex 辅助编码、测试和文档整理，个人负责场景、产品取舍、需求描述与迭代验收；角色和风景含 ChatGPT 辅助生成素材。依赖 React、Vite、FastAPI、scikit-learn 等开源工具，数据与引用保留各自来源说明。

后续改进包括扩展睡前、学习间隙等陪伴场景，优化聊天节奏和宠物互动，开展真实用户试用，完善手机体验、固定托管、账户认证与备份。聚类、实时地图探店、多模型系统对照为扩展方向。

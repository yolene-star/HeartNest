# Docker 环境与仓库说明

## 启动

安装 Docker Desktop 并启动 Linux 引擎后，在项目根目录执行：

```powershell
docker compose up --build -d
```

打开 http://localhost:8080 。前端通过 Nginx 将 `/api/` 请求转发给后端，后端不直接暴露宿主机端口。

## 查看、测试与停止

```powershell
docker compose ps
docker compose logs --tail=100
docker compose run --rm --no-deps -e COMPANION_DB=/tmp/companion-tests.sqlite3 backend python -m pytest tests -q --basetemp=/tmp/companion-tests -p no:cacheprovider
docker compose exec backend python classification.py
docker compose stop
```

数据存放于命名卷 `companion-data`，普通 stop/down 保留数据。`docker compose down -v` 会删除数据，仅在明确需要重置时使用。

## 运行约束

- Python 3.11 基础镜像；Node 24 构建前端；Nginx 提供网页和反向代理。
- 后端单进程运行，SQLite 原子保存状态；不启用多 worker。
- 接口文档：http://localhost:8080/docs 。
- 构建时需要联网拉取镜像和依赖；启动后演示逻辑无需联网。
- 公开数据实验、画像编辑、活动确认反馈、聊天回应保存、单篇记忆开关及七天时间图已补充，手机遮挡和跨日记状态修复已复测，见 [本轮验收](completion-validation/README.md)。
- 未开启 LLM 时回应和情绪初判使用本地规则；开启后使用结构化情绪/意图理解与自然回应，失败会标记规则回退。记忆检索使用中文双字与英文词项的 TF-IDF 余弦相似度。接入和云端数据范围见 [LLM 文本理解](llm-understanding.md)，当前样本不能作为通用分类或陪伴效果结论。
- `data/classification_metrics.json` 仅为模拟文本的独立测试结果，未使用真实个人记录。

## Git

远程仓库： https://github.com/yolene-star/HeartNest （私有）。依赖、缓存、个人运行数据、数据库与环境变量文件均由 `.gitignore` 排除。

## 本地源码待审包

在项目根目录运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-source.ps1`，生成 `delivery/HeartNest-source-review.zip`。脚本采用目录和文件白名单，并核验必要启动文件，排除 `.env`、个人运行数据库、Git 目录、依赖和缓存。压缩包保留示例配置、既有宠物资源、模拟数据、技术证据和备用录屏；不包含正式报告或 PPT。解压后进入 `HeartNest` 目录，按上面的 Docker 命令启动；默认无需 API Key。

这是本地待人工验收的代码包，不会自动上传或提交。

## 隔离验收与公开实验

先确认 18080 端口未被其他验收实例使用。新项目名会创建独立数据卷，不修改默认 8080 的用户库：

```powershell
$env:LLM_ENABLED='false'
docker compose -f compose.acceptance.yaml -p heartnest-completion-1102 up --build -d
docker compose -f compose.acceptance.yaml -p heartnest-completion-1102 run --rm --no-deps -e COMPANION_DB=/tmp/tests.sqlite3 backend python -m pytest tests -q -p no:cacheprovider
cd frontend
node tests/full-regression.mjs
```

这些浏览器脚本需要本机 Node 及 Edge，依赖先用 `npm ci` 安装；测试目标固定为 18080。五套测试修改同一个测试库，必须顺序执行。`completion.mjs` 仅清理本轮创建 ID。时间图测试需要空白演示库，不要指向用户正式环境。

默认演示地址是 http://localhost:8080 ，18080 是独立验收。真实 DeepSeek 测试必须使用全新数据卷；本轮结果位于 `docs/completion-validation/llm/`，8篇日记均为模拟内容。

备用视频位于 `docs/demo/heartnest-demo.webm`，用浏览器即可播放；重录前准备空的隔离实例，运行 `npx playwright install ffmpeg` 和 `node tests/demo-recording.mjs`。这是无声离线规则演示，真实模型证据另存，不混用。

公开实验可在安装后端依赖的 Python 3.11 环境运行：

```powershell
python backend/public_classification.py
```

如果在容器中执行，脚本位于 `/app/backend/public_classification.py`，默认输出位于容器 `/app/docs/public-classification`；需要 `docker cp` 导出，或将项目 docs 目录挂载到 `/app/docs`。不要将个人日记当训练数据。


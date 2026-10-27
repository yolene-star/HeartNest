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
- 当前是开发中的课程原型，公开数据实验、完整前端画像编辑、统计图与报告仍需继续完善。
- 当前回应为离线模板；检索为字符重合基线，尚未替换为 TF-IDF；不可作为最终分类或陪伴效果结论。
- `data/classification_metrics.json` 仅为模拟文本的独立测试结果，未使用真实个人记录。

## Git

远程仓库： https://github.com/yolene-star/emotion-companion （私有）。依赖、缓存、个人运行数据、数据库与环境变量文件均由 `.gitignore` 排除。

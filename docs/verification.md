# 验证状态

验证日期：2026-10-27。环境：Docker Desktop / Linux containers，Python 3.11，Node 24。

- `docker compose config --quiet`：通过。
- `docker compose build`：前后端镜像构建通过。
- `docker compose up -d --wait`：前后端均 healthy。
- 容器内隔离测试：7 passed；第三方 Starlette/AnyIO 弃用警告 1 条。
- 前端 Nginx `/api/health`：200，成功访问后端。
- 前端 `/docs`：200，接口文档代理可用。
- 模拟文本分类评估：12 条训练、12 条独立测试，两模型准确率 0.5、宏平均 F1 约 0.493，各输出 6 个错例；仅验证评估流程。

尚未执行的手工演示、公开数据实验和浏览器场景不能视为已通过。详见 DOCKER.md 中的当前范围。

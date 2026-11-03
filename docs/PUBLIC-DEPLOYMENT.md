# 心栖公网演示

## 当前访问状态

2026年11月3日 README 更新时，临时地址复查出现 TLS 连接中断，不能据下方历史验收认定当前仍然可用。请优先使用本地 Docker 演示；重新建立隧道后需要更新链接并复验。

## 当前地址

2026-11-03 验证的临时 HTTPS 地址：

https://published-set-surprise-brochures.trycloudflare.com

2026-11-03 链接故障复查：旧地址 `capacity-closely-restricted-operation.trycloudflare.com` 对应的隧道持续返回 `Unauthorized: Tunnel not found`，本地隔离 Docker 服务仍健康。已保留容器和数据卷，停止失效隧道后重建为上面的新地址；公网健康检查返回 200，真实 HTTPS 浏览器回归再次通过。隧道进程仍在运行不代表公网地址可用；遇到同类故障，可先执行 `./scripts/stop-public-demo.ps1 -KeepDocker`，再执行 `./scripts/start-public-demo.ps1 -NoBuild`，并验证新地址。旧地址不能继续使用。

2026-11-03 本轮已同步有依据的放松建议、首页个性化主动开场与 98px 紧凑输入区。复用现有隧道后，真实 HTTPS 浏览器回归再次通过：新访客引导、称呼确认、日记新增/删除、双访客隔离、手机布局、会话留底与 Secure Cookie，页面无 JavaScript 错误。桌面/手机截图已重新打开检查，结果见 `docs/design/public-demo/https-results.json`。最近后端完整回归为 173 项通过；下文 97 项为首次公网部署时的历史记录。本轮未开启公网大模型。

这是本机 Docker 经 Cloudflare Quick Tunnel 提供的完整前后端演示。电脑、Docker Desktop、网络及隧道进程必须保持在线；重启隧道通常会生成新地址，没有固定域名和持续可用保证。正式长期托管仍需云服务器或支持 Docker 与持久磁盘的托管账户。本次未创建付费云资源。

## 演示模式的边界

- 使用独立 Compose 项目、独立数据卷、独立数据库和 `18081` 端口，不公开本地 `8080` 或验收 `18080` 的记录。
- `LLM_ENABLED=false`、API key 为空，不读取项目 `.env`；回应和情绪初判使用本地规则，不能据此验收 DeepSeek 的实际效果。
- 不同浏览器用随机 HttpOnly / SameSite=Lax Cookie 隔离日记、画像、反馈、设置和待确认提议；公网 HTTPS 下 Cookie 带 Secure。首次先获取设置建立会话，再并行请求其它数据。
- 已授权保存的数据在闲置 24 小时后失效，过期记录在后续 API 请求时清理。清除 Cookie 或更换浏览器无法找回，不提供账户登录或跨设备同步。
- 临时聊天不写入数据库。待确认资料提议只在按访客隔离的内存中保存，30 分钟后或服务重启后需重新提议；只有确认的资料才持久化。
- 至多 500 个活跃浏览器会话，每个快照最多 4 MiB，容量已满返回明确错误，不挤掉其他访客。当前架构仅支持一个后端 worker 和一个后端实例，适用于课程演示。
- 请使用虚构数据。关闭演示容器不会删除数据卷；不要将个人数据卷或 API 环境文件加入仓库。

## Windows 启动与停止

准备 Docker Desktop（Linux 引擎）和 cloudflared，在仓库根目录执行：

```powershell
# 先仅启动隔离 Docker，检查页面
./scripts/start-public-demo.ps1 -LocalOnly
# 创建临时公网入口；镜像已构建时复用
./scripts/start-public-demo.ps1 -NoBuild
# 查看健康检查及容器
Invoke-RestMethod http://127.0.0.1:18081/api/health
docker compose --env-file NUL -f compose.public.yaml ps
# 只关公网隧道，保留本地演示
./scripts/stop-public-demo.ps1 -KeepDocker
# 关闭隧道和隔离容器，保留数据卷
./scripts/stop-public-demo.ps1
```

脚本将进程标识和日志保存在被忽略的 `.deps/public-demo/`。隧道在后台隐藏运行；重复启动会复用仍运行的进程。停止前检查进程名称及 UTC 启动时间 ticks，兼容旧时间字符串记录，避免误杀复用相同 PID 的其它进程。获得 URL 只代表已分配地址，仍需健康检查与实际浏览器验证。

从零构建需要联网下载基础镜像和依赖。此次本机已具备缓存 Python 后端镜像，后端通过 `FROM emotion-companion-backend:latest` 加 `COPY backend /app/backend` 增量构建，未执行断网环境下的全新基础镜像拉取；前端走标准 Compose 构建。仓库的 `compose.public.yaml` 使用完整 Dockerfile，供其它环境正常从零构建。

## 验证

```powershell
docker compose --env-file NUL -f compose.public.yaml run --rm --no-deps -e COMPANION_DB=/tmp/public-tests.sqlite3 -e PUBLIC_DEMO=false backend python -m pytest tests -q -p no:cacheprovider --basetemp /tmp/public-tests
cd frontend
npm ci
npm run build
node tests/public-demo.mjs
$env:PUBLIC_DEMO_URL='https://你的新地址.trycloudflare.com'
node tests/public-demo.mjs
```

后端 **97 passed**；本地及真实 HTTPS 浏览器流程通过。覆盖首次会话、称呼确认、日记新增/删除、两浏览器隔离、禁止删除他人的日记、窄屏工具抽屉、手机输入区可见、跨页聊天保留、刷新后已保存资料恢复、Secure Cookie 和无 JavaScript 错误。截图与结果在 [公网验证记录](design/public-demo/README.md)。

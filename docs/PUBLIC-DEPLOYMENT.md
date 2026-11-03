# 心栖公网演示

## 当前启动方式与地址

Windows 双击仓库根目录的 `启动心栖.cmd`，或运行 `./Start-HeartNest.ps1`。本地 Docker 网页与公网隧道一起启动，只有公网 `/api/health` 返回隔离演示状态且首页加载成功才显示启动成功。镜像已有且源码未改时可加 `-NoBuild`。

2026年11月3日启动脚本检查通过的新地址：

https://exam-lit-firmware-hampton.trycloudflare.com

之前的临时地址已不可用。最新实际地址以启动输出或 `.deps/public-demo/current-url.txt` 为准。其他设备直接输入此网址访问，不需要安装本项目。本机、Docker、网络及隧道必须持续在线。

重复启动时检查进程身份、网页和API健康，可用则复用，不可用则停止匹配的旧进程后重建。新地址未通过检查时会报错，保留本地18081可用，不会将分配地址误报成部署成功。临时隧道重建可能更换网址，固定网址需要自有域名与固定隧道配置，当前未配置。

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

脚本将进程标识和日志保存在被忽略的 `.deps/public-demo/`。隧道在后台隐藏运行；重复启动仅复用公网网页与 API 均可访问的进程。停止前检查进程名称及 UTC 启动时间 ticks，兼容旧时间字符串记录，避免误杀复用相同 PID 的其它进程。脚本内置公网网页与 API 健康检查，仍需在改动后执行真实浏览器回归。

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

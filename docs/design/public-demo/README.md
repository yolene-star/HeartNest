# 公网演示验证记录

2026-11-03，独立 Docker `18081` 及 Cloudflare 实际 HTTPS 地址均通过浏览器回环，未使用聊天接口 mock。使用的内容均为虚构数据。

可复跑脚本：`frontend/tests/public-demo.mjs`，公网模式设置环境变量 `PUBLIC_DEMO_URL`。

- 后端 97 项通过：含跨访客读取/删除隔离、资料候选隔离、服务重启恢复已确认资料、未确认候选不落盘/重启失效、Cookie 属性、过期清理、容量错误及失败写入不保存。
- 浏览器：先选择宠物和称呼 → 聊天提出新称呼 → 确认 → 日记独立页保存 → 第二浏览器验证无相关记录且不可删除第一位访客日记 → 窄屏抽屉 → 手机布局 → 回到聊天保留消息 → 刷新保留已授权资料 → 删除演示日记。
- 首次加载的 Cookie 响应只出现一个不同 token，旧实现曾实测出现 4 个，已修复。
- `local-results.json` 和 `https-results.json` 记录通过项，无页面 JavaScript 错误。
- 桌面 1363×871、窄屏 793×871、手机 390×844 截图已打开目视检查。页眉页脚、输入框和工具抽屉布局可用，演示说明默认折叠。
- requesting-code-review 技能的独立只读复核指出并协助消除两项 P2：未确认提议落盘、首次多会话占位；修复后复核没有剩余阻塞项。
- 默认本地模式的五组完整浏览器回归再次通过（独立 `18080` 环境）。

截图：`https-desktop-chat.png`、`https-desktop-diary.png`、`https-narrow-tools.png`、`https-narrow-notice.png`、`https-mobile-notice.png`，另有相应本地 Docker 截图。

本记录验证工程流程与访问隔离，不代表真实大模型陪伴质量、专业心理干预效果或长期云服务稳定性。运行条件与限制见 [部署说明](../../PUBLIC-DEPLOYMENT.md)。

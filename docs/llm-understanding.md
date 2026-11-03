# LLM 文本理解

心栖在开启 LLM 后，将模型用于情绪和意图理解，以及自然语言回应。长期记忆的访问权限、实际检索、数据保存和有来源的行动建议仍由后端执行。

统一隐私与删除语义见 [隐私说明](PRIVACY.md)：关闭记忆不清除已显示的临时聊天引用，后续上下文仍可能带出这些文字；不保存聊天也不等于禁用云端模型。完整字段与默认值见 [字典](data/dictionary.md)。

## 流程

1. 本地先检查已有的明显安全信号，匹配时走既有回应流程。
2. 对当次文本做一次结构化理解，必要时附最近最多 6 条临时对话；不附历史日记或画像。
3. 校验情绪标签、数值范围、意图及字段类型，拒绝未知字段、诊断标签和无效输出。
4. 只有意图为 `recall` 且记忆调用已开启，才用主题词检索允许调用的日记。
5. 普通表达走自然语言回应；需要行动建议时仍使用已有、带来源的建议库。

理解任务关注否定、反讽、转折、时间变化、主导感受和混合情绪。“以前、之前”等词本身不触发检索。结构化结果不是可执行指令，不能修改记忆权限或删除数据。

## 接口行为

- `POST /api/analyze/emotion` 返回 `label`、`confidence`、`analysis_source`、`reason`。
- `POST /api/diaries` 未指定情绪时用相同理解流程初判，仍为待确认状态。用户已指定标签时直接保存，不调用模型。
- `POST /api/companion/respond` 附加 `intent`（`share` / `recall`）和 `understanding_source`（`llm` / `rules`）。原有 `llm_used` 只表示自然回复是否由模型生成，不能用它判断结构化分析是否成功。
- 用户确认或修改标签后，来源为 `user`；模型不会自动覆盖用户的判断。

`confidence` 是模型的主观把握值，不是经过校准的情绪分类准确率。判断依据也是模型对当前文本的解释，仍需用户确认，不是诊断结论。

## 配置与回退

沿用根目录 `.env` 中的 `LLM_ENABLED`、`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 和 `LLM_TIMEOUT`。Docker Compose 自动读取该文件。不要提交密钥或打印 Compose 展开的环境变量。

```powershell
docker compose up --build -d backend
```

DeepSeek 请求显式使用 `thinking: {type: disabled}`，避免小输出额度被思考过程耗尽、返回空正文。此字段只发送给 DeepSeek 官方 API 域名；其他 OpenAI 兼容服务不附带该参数。结构化理解使用 JSON 模式及温度 0，自然回应沿用较灵活的表达配置。

未配置、禁用、超时、网络中断或 JSON 校验失败时，理解回退到现有关键词分类和较保守的本地历史意图规则，并通过 `analysis_source=rules` / `understanding_source=rules` 明确标识。没有把规则回退当成模型成功。

开启云端 LLM 会将当次文本和使用中的临时对话发给配置的服务商；关闭记忆仅限制旧日记检索，不等同于关闭云端处理。需要完全本地运行时将 `LLM_ENABLED=false`。未新增文本缓存或把临时聊天自动写入日记。

## 测试与独立验收

后端测试使用模拟服务响应，覆盖否定和转折输入的接入流程、严格校验、无效 JSON/网络回退、手动标签优先、记忆权限和已有安全路径。模拟响应测试验证的是程序行为，不证明真实模型理解准确。

独立的 Docker 验收使用 18080 端口和专用数据卷，不影响默认实例数据：

```powershell
docker compose -f compose.acceptance.yaml -p heartnest-llm-review up --build -d
cd frontend
$env:TEST_URL = 'http://127.0.0.1:18080'
node tests/diary-acceptance.mjs --llm
```

真实验收要求该独立数据库初始为空；每次复验请使用新的 Compose 项目名并停止占用 18080 的旧验收实例。不要为复验清空默认实例。结果和截图写入 `docs/diary-acceptance-llm/`。

真实调用会产生服务商费用，当前脚本使用 8 篇明确标记的虚构日记。检查每一篇的分析来源、聊天意图和自然回复来源，任何回退都不会被“真实模型全链路”检查算作通过。结果仍需人工审核。

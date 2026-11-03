# 接口与存储字段字典

核对：2026-11-03，对应 Issue #9。以 `backend/app/main.py` 的 Pydantic 输入模型和返回字典为准；本文件不是数据库迁移。类型 `?` 表示可为 null；“可缺省”表示键可不存在，两者不同。更新请求中 null 经 `exclude_none=True` 忽略，不能用 null 清空文本；空字符串是否接受取决于下表约束。日期示例均为虚构的 `2026-11-02T20:00:00+08:00`。

## 存储结构与字段来源

本地单用户 SQLite `state(id INTEGER PRIMARY KEY,payload TEXT NOT NULL)`，id=1 的 JSON 快照含 `diaries`、`profiles`、`feedback`、`settings`；不是每个对象独立一张关系表。成功写请求后提交快照。活动从只读 JSON 加载，分类结果在独立文件。

公网单工作进程演示用独立 SQLite 的 `demo_sessions(id TEXT PRIMARY KEY,payload TEXT NOT NULL,expires_at REAL NOT NULL)`；id 为随机 64 位十六进制 Cookie 令牌，payload 同上，expires_at 为 Unix 秒。闲置 24 小时后失效，后续访客请求触发清理，最多 500 个会话、每快照 4MiB。未确认提议只存内存，不进入快照。详见[隐私说明](../PRIVACY.md)。

## 日记/保存的聊天

### DiaryIn：POST /api/diaries

| 字段 | 类型、默认值 | 含义/示例 |
|---|---|---|
| kind | `diary\|chat`，diary | 记录入口 |
| text | string，必填，去首尾空白后至少1字 | 原话，例如“今天普通但安心”；目前日记接口未设置最大长度，不能宣称所有文本均限4000字 |
| mode | `save\|respond`，save | 兼容记录元数据，不控制聊天是否回应 |
| allow_retrieval | bool，true | 单篇记忆许可；须与全局开关共同生效 |
| response_requested | bool，false | 兼容元数据，不会令本创建接口自动生成回应 |
| response_text | string?，null，最多6000字 | 选中同时保存时由客户端提交的 Agent 回应 |
| emotion_label | 情绪标签?，null | 用户手选则确认且来源user；缺省调用分析并标为pending |
| recorded_at | string?，null | 有效ISO日期/时间；无时区按北京，含时区转北京；不得晚于北京时间今天；缺省/空值取当前时间 |

### 保存后服务端字段

| 字段 | 类型、初值/来源 | 语义 |
|---|---|---|
| id | string，服务端随机10位十六进制 | 记录编号，不是用户身份 |
| emotion | object，分析或手选 | `label:string`、`confidence:number`、`analysis_source:rules\|llm\|user`，自动分析可有`reason:string`；手选置信度1表示确认，不是测量准确率 |
| emotion_confirmed | bool，是否手选 | 日历和统计只纳入确认记录 |
| emotion_status | `pending\|confirmed\|skipped` | 手选为confirmed，否则pending；跳过保留原初判但不计入确认统计 |
| addenda | array，[] | 每项 `{id:string,text:string,recorded_at:string}`，后续补充不覆盖原文 |
| response_created_at | string?，null | 有保存回应才记录创建时间 |
| updated_at | string?，null | 编辑/补充时更新；情绪修改接口目前不更新它，不作全操作审计时间 |
| response | null | 创建时兼容保留，无自动生成含义；不是response_text |

`kind/text/mode/allow_retrieval/response_requested/response_text/recorded_at` 同输入保存。情绪标签接受开心、平静、疲惫、低落、焦虑、生气、混合/说不清、其他，以及旧别名积极/平稳；LLM结构化分析不输出积极。UI回顾/开场对旧别名作显示归一，不重写旧数据。

### 日记更新模型

| 模型/接口 | 字段（类型/默认） | 行为 |
|---|---|---|
| DiaryPatch，PATCH /api/diaries/{id} | `text:string?=null`（非空）；`allow_retrieval:bool?=null`；`recorded_at:string?=null` | 只修改非null字段；日期同创建校验；编辑正文不会自动重新分析情绪 |
| DiaryAddendumIn，POST /api/diaries/{id}/addenda | `text:string`，必填、去空白后非空 | 新建补充项 |
| EmotionPatch，PATCH /api/diaries/{id}/emotion | `label:情绪标签?=null`；`status:confirmed\|skipped=confirmed` | 有label则替换emotion且来源user；无label确认当前初判；修改确认状态 |

GET /api/diaries：可选查询 `date:string`（按日期前缀精确比较），返回 `{items:Diary[]}`，按插入顺序逆序，不保证按补记日期排序。DELETE 返回 `{deleted:string}`，同时移除 `source_id` 指向该日记的画像。

## 画像与资料确认

### ProfileIn / ProfilePatch

| 字段 | ProfileIn 创建 | ProfilePatch 更新 | 语义 |
|---|---|---|---|
| content | string，必填至少1字 | string?=null，1–500字 | 内容，如“晚上习惯阅读”；创建目前未设500字上限 |
| type | string=想尝试 | string?=null | 常用喜欢、反感、想尝试、已体验；灵活画像为小习惯/个人特征；接口未将此字段约束成枚举 |
| status | string=active | string?=null | 常用active/rejected，接口未强制枚举 |
| source_id | string?=null | 无此输入字段 | 来源日记编号；删除日记时按此字段级联 |
| confirmed | bool=false | bool?=null | 明确确认；历史偏好参与建议须满足确认及记忆开关等条件 |
| category | `interest\|habit\|trait`=interest | 同枚举?=null | 兴趣、小习惯、个人特征；部分旧/反馈生成记录无此键，UI按interest处理 |

服务端补 `id:string`、`created_at:string`、`updated_at:string`。对话确认生成的 habit/trait 还可有 `source:conversation`、`source_text:string`（原话片段）。反馈生成的画像可有 `source_feedback_id:string`、`advice_id:string`（长期避开的练习ID）。这些键可缺省，不承诺每条均有。GET返回 `{items:Profile[]}`；DELETE返回 `{deleted:string}`。

个人资料提议不属于自动保存画像：`{id:string,kind:nickname|response_preference|habit|trait,content:string,evidence:string}`。evidence须逐字存在当前输入；单次最多3项；候选最多128项、30分钟有效。内部另有 `time:number`（单调时钟）、`status:pending|confirmed|dismissed`、`base:any`（旧设置）、确认后的`result:object`，不进入持久化JSON。

POST `/api/profile/proposals/{id}/confirm`：称呼/回应偏好返回 `{status,kind,content}`；habit/trait 返回 `{status,kind,profile}`。POST `.../dismiss` 返回 `{status:dismissed}`。过期、取消、旧设置冲突返回409。确认资料独立于保存聊天，不自动生成日记。

## 设置 SettingsIn

PATCH /api/settings 各字段均可缺省或null（null忽略）；GET返回当前值。

| 字段 | 类型 | 初始值/含义 |
|---|---|---|
| memory_enabled | bool? | false；日记检索、历史画像用于建议及个性化开场的全局授权 |
| save_enabled | bool? | true；允许创建新记录；false时POST日记返回409，不删除已有记录，不禁止单独确认画像/反馈 |
| nickname | string?，最多40字 | 空字符串；称呼，可不填真实姓名 |
| response_preference | `listen_first\|think_together\|adapt`? | adapt；偏向倾听/一起想办法/按当前表达 |
| pet_id | `otter\|bear\|cloud\|rabbit\|lamp\|cat\|dog`? | otter；cloud为兼容值，读取/更新时归为rabbit |
| onboarding_complete | bool? | false；首次设置完成标记 |

公网GET设置额外含派生 `public_demo:true`，本地不保证存在此键。API密钥不属于设置接口字段。

## 临时聊天、分析与开场

| 模型/接口 | 输入字段及默认 | 输出/生命周期 |
|---|---|---|
| ConversationTurn | `role:user\|assistant`、`content:string`（1–4000字），均必填 | 临时历史项 |
| CompanionIn，POST /api/companion/respond | `text:string`（1–4000字，必填）；`want_advice:bool=false`；`response_preference:listen_first\|think_together\|adapt=adapt`；`conversation:ConversationTurn[]=[]`（最多6条）；`exclude_advice_ids:string[]=[]`（最多20） | 不在本接口自动保存日记，前端按单独选择调用创建接口 |
| POST /api/analyze/emotion | 对象`text:string`；缺省按空串处理（未用专用输入模型） | Emotion对象；分析不自动保存 |
| GET /api/companion/opening | 无输入 | `{text:string,personalized:bool,source:generic\|confirmed_mood_rules,basis:array}`；basis为`{diary_id,date,label}`，仅引用授权的最近7天最新记录日最多3条已确认标签，无原文，不调用LLM |

聊天响应包括 `reply:string`、`safety:bool`、`memory_enabled:bool`、`memories:DiaryWithScore[]`、`suggestion:object|null`、`emotion_suggestion:{label:string,status:unconfirmed}|null`、`profile_proposals:Proposal[]`、`intent:share|recall`、`understanding_source:llm|rules`、`llm_used:bool`、`reply_source:llm|rules|memory|advice|safety`、`reply_fallback_reason:disabled|unconfigured|unavailable|null`、`communication_policy_version:string`。普通路径另有可缺省的`communication_source:object`与`advice_policy:{risk,version}|null`。理解与回复来源独立，llm_used只指自然回应。候选建议用尽或用户拒绝/不适时suggestion可为null，不保证每轮均有建议。

结构化LLM输出 TextUnderstanding（`backend/app/llm.py`）：`label`、0–1有限数值`confidence`、`intent`、最多200字`memory_query`、1–300字`reason`、最多3项`profile_candidates`（缺省[]）。候选 ProfileCandidate 含 `kind`、1–200字`content`、1–500字`evidence`；未知字段/错误类型拒收。不持久化这整个中间对象；只将允许的观察投影到回应和待确认候选。

## 检索 SearchIn

POST /api/memories/search：`query:string=""`、`top_k:int=5`。返回 `{items:DiaryWithScore[],memory_enabled:bool}`；每项增加派生 `score:number`，余弦相似度保留3位，不是情绪概率。top_k在执行时夹到1–20，空查询/无候选/记忆关闭返回空列表。检索原文及获授权保存的回应，不检索addenda；单篇不允许时两者都排除。没有独立持久向量索引，删除后重建候选。

## 活动、依据与反馈

### RecommendationIn 与活动对象

POST /api/recommendations：`query:string=""`、`budget:number?=null`（非负）、`time:string?=null`（指定时精确匹配；不传代表不限）。返回 `{items:ActivityWithBasis[],explanation:string}`，至多3项。

目录每项：`id:string`、`name:string`、`type:string`、`time:string`（今晚/下午/周末）、`cost:number`（元）、`description:string`、`source:string`（模拟来源）。目前**没有独立location或duration字段**，地点在描述，time不是ISO时间或实时排期。接口增加 `catalog_source:string`、`topic:string`、`requires_preference:bool`、`source_id:string|null`、`source:object|null`（依据来源对象，覆盖目录source；目录原值保留在catalog_source）、`adaptation:string`、`limitation:string`、`reason:string`、`reasons:string[]`、`review_status:string`、`basis:object`。

练习建议至少含 `id,title,method,step` 字符串，及同一依据字段。`basis.type`为`literature|preference|both`；`basis.sources`为来源对象数组（含`id/title/url`等说明）；`basis.preferences`为明确偏好数组，含`content/evidence/origin`及可选画像`id`，origin为`current_message|current_conversation|confirmed_profile`。依据与改编范围见[文献规则](../research/relaxation-evidence-and-preferences.md)，不能把文献支持当作本产品疗效证明。

### FeedbackIn：POST /api/feedback

| 字段 | 类型/默认 | 语义 |
|---|---|---|
| recommendation_id | string，必填 | 已知活动或练习ID，否则404 |
| action | `accept\|reject\|modify\|experienced\|uncomfortable`，必填 | 接受、拒绝、修改条件、体验、不适 |
| experience | string="" | 本次体验文字 |
| remember_preference | bool=false | 明确要求写入长期偏好，不由接受/拒绝自动推导 |

反馈保存后补 `id:string`、`created_at:string`；实际更新画像才有 `profile_id:string`，可缺省。活动接受/拒绝/体验可确认长期偏好，modify不可；活动不适不能同时自动记长期，须去「我的」明确修改。练习仅reject/uncomfortable可确认长期避开，接受不等于喜欢。反馈会保存，即使没有记为长期偏好；没有公开GET/DELETE反馈接口。删画像不联动删历史反馈，历史反馈也不会自动再生成画像。

## 派生的回顾与月历

GET /api/metrics/emotions：`days:int=7`，执行夹到1–90；输出 `days`、`total_confirmed:int`、`counts:object<label,int>`、`timeline:array<{diary_id,date,label}>`。只取已确认记录，无记录日不推断为平静；按日期排序，不给情绪打分。

GET /api/calendar：`year:int`（2000–2100）、`month:int`（1–12），均必填；输出 `year/month/days_in_month:int`、`first_weekday:int`（周一0至周日6）、`days:array<{date:string,emotions:string[],diaries:Diary[]}>`。只列有确认情绪的记录日，空白日由前端补网格，不生成假日记。

GET /api/health：本地返回 `{status:ok,diaries:int,profiles:int}`；公网仅 `{status:ok,public_demo:true}`，不暴露访客计数。

## 权限组合速查

| 情况 | 新日记 | 历史检索/画像用于建议 | 当前聊天/云端 |
|---|---|---|---|
| save_enabled=true，但聊天选不保存 | 不创建 | 仍取决于memory_enabled及单篇许可 | 仍回应；启用LLM时仍可能发送当前文本/临时历史 |
| save_enabled=false | 创建409；旧记录保留 | 独立受记忆授权控制 | 仍可聊；单独确认资料/提交反馈仍可持久化 |
| memory_enabled=false | 可在允许保存时创建 | 不检索旧日记、不用历史画像挑建议；开场通用 | 当前上下文仍可用，不等于关闭LLM |
| memory_enabled=true且allow_retrieval=false | 该篇仍可查阅编辑 | 该篇原文/回应不检索、不作个性化开场依据 | 先前已出现在聊天里的引用不会自动抹除 |

所有查询/响应字段属于派生输出或对象字段，不代表独立数据库列。运行库不应提交到仓库。

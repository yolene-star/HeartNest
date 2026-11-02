# 公开中文情绪基线：数据与验证记录

这是一份技术复现记录，不是课程汇报文稿。

- 来源：[Johnson8187/Chinese_Multi-Emotion_Dialogue_Dataset](https://huggingface.co/datasets/Johnson8187/Chinese_Multi-Emotion_Dialogue_Dataset)，作者引用名 Cheng-Yen Lin（2024）。上游数据卡标注 MIT，原说明随数据保存在 `data/public-emotion/UPSTREAM_README.md`。
- 上游声明混合日常对话、电影对白和 AI 生成文本；来源比例和逐条出处未披露，无法独立验证“专家标注”质量。不能称为纯真实用户语料。
- 原文件 SHA-256：`f8a96c78f11b070937166968703ae89e9065b5d7508328b0c94f174626e8f484`。
- 4159 行经 NFKC、空白标准化、去重、冲突标签剔除，剩余 4152 行。移除 5 条重复行及 1 个冲突文本的全部记录，空行 0。
- 固定随机种子 42，清洗后分层切分为训练 3321、测试 831；无完全相同的标准化文本跨训练/测试。TF-IDF 仅拟合训练集。
- 字符 1–3 gram，`min_df=2`、最多 40000 特征，比较逻辑斯蒂回归与 LinearSVC。

| 模型 | 准确率 | 宏平均 F1 |
|---|---:|---:|
| LogisticRegression | 0.8592 | 0.8574 |
| LinearSVC | 0.8736 | 0.8719 |

[metrics.json](metrics.json) 包含每类指标、测试分布、完整混淆矩阵和各 20 个错例；[LR 图](LogisticRegression-confusion.svg)与 [SVM 图](LinearSVC-confusion.svg) 可直接打开。

实际 CSV 八类为：厭惡語調、平淡語氣、悲傷語調、憤怒語調、疑問語調、開心語調、關切語調、驚奇語調。上游说明出现“恐懼”和重复“悲傷”等不一致内容，本实验以 CSV 实际字段为准；已重新运行脚本，指标数值可复现、描述已同步更正。

局限：没有按作者、电影或生成模板分组，近似文本可能跨集合；未调参或做跨语料验证；繁体八类标签不等同产品情绪标签。它验证离线分类方法，不能代表中文简体日记、DeepSeek 或陪伴效果。

复现：项目根目录执行 `python backend/public_classification.py`（Python 3.11 与 backend 依赖）。原微型模拟实验继续保留，作为程序演示，二者不能混报。

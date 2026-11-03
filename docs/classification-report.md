# 情绪分类实验记录

## 数据与预处理

本轮结果使用仓库内明确标注的人工编写中文模拟文本，仅用于验证实验流程，不代表真实用户或真实人群表现。训练集 12 条，独立测试集 12 条；TF-IDF 只在训练集拟合，避免测试集信息泄漏。文本使用中文字符 n-gram（1-2）向量化，未使用个人日记。

## 结果

### LogisticRegression

- Accuracy: 0.500
- Macro F1: 0.493
- Confusion matrix: `docs/classification-confusion-matrix-LogisticRegression.svg`

### LinearSVC

- Accuracy: 0.500
- Macro F1: 0.493
- Confusion matrix: `docs/classification-confusion-matrix-LinearSVC.svg`

## 错误案例

1. 原文：我按时吃饭上课；真实标签：平稳；预测标签：焦虑。原因：字符级特征缺少语境，否定、隐喻或反讽表达容易与相邻类别混淆。
2. 原文：心里像压了一块石头；真实标签：低落；预测标签：平稳。原因：字符级特征缺少语境，否定、隐喻或反讽表达容易与相邻类别混淆。
3. 原文：一想到明天就坐立不安；真实标签：焦虑；预测标签：低落。原因：字符级特征缺少语境，否定、隐喻或反讽表达容易与相邻类别混淆。

## 局限

样本量小且为模拟文本，无法替代公开数据集实验。下一步需要补充公开中文情绪数据、记录授权来源，并重新评估模型。

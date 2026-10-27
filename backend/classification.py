"""Evaluate two baselines on an independent, explicitly synthetic holdout."""
from pathlib import Path
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix

LABELS=['积极','平稳','低落','焦虑']
TRAIN=[('完成作业很开心','积极'),('和朋友聊天很快乐','积极'),('今天感觉满足又顺利','积极'),('生活平常，按计划学习','平稳'),('晚上看书没有特别的情绪','平稳'),('今天和平时一样','平稳'),('最近很累不想出门','低落'),('感到孤独和无聊','低落'),('心情难过很失望','低落'),('明天答辩让我焦虑','焦虑'),('担心项目无法按时完成','焦虑'),('非常紧张害怕出错','焦虑')]
TEST=[('今天心情开心快乐','积极'),('轻松地完成了任务','积极'),('又是普通的一天','平稳'),('我按时吃饭上课','平稳'),('最近孤独无聊','低落'),('心里像压了一块石头','低落'),('担心考试，非常焦虑','焦虑'),('一想到明天就坐立不安','焦虑'),('真棒，又被放鸽子了','低落'),('不开心，期待落空了','低落'),('终于不用担心答辩了','积极'),('没有什么可焦虑的','平稳')]

def evaluate():
    results=[]
    for name, estimator in [('LogisticRegression',LogisticRegression(max_iter=1000,random_state=42)),('LinearSVC',LinearSVC(random_state=42))]:
        model=make_pipeline(TfidfVectorizer(analyzer='char',ngram_range=(1,2)),estimator)
        model.fit([x for x,y in TRAIN],[y for x,y in TRAIN])
        expected=[y for x,y in TEST]
        predicted=model.predict([x for x,y in TEST])
        results.append({'model':name,'accuracy':accuracy_score(expected,predicted),'macro_f1':f1_score(expected,predicted,average='macro',zero_division=0),'labels':LABELS,'confusion_matrix':confusion_matrix(expected,predicted,labels=LABELS).tolist(),'error_cases':[{'text':x,'expected':y,'predicted':str(p)} for (x,y),p in zip(TEST,predicted) if y!=p]})
    return {'data_source':'人工编写的中文模拟文本，仅用于验证评估程序，不代表真实人群表现','train_size':len(TRAIN),'test_size':len(TEST),'split':'独立训练/测试文本；TF-IDF 仅在训练集拟合','results':results}

if __name__=='__main__':
    output=Path(__file__).resolve().parents[1]/'data/classification_metrics.json'
    report=evaluate()
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

"""Reproducible offline evaluation; never used for online diary diagnosis."""
from collections import Counter, defaultdict
import csv
import hashlib
from html import escape
import json
from pathlib import Path
import re
import unicodedata

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.svm import LinearSVC


def prepare(rows):
    labels = defaultdict(set)
    empty = duplicates = 0
    for row in rows:
        text = re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', row.get('text') or '')).strip()
        label = (row.get('emotion') or '').strip()
        if not text or not label:
            empty += 1
            continue
        if label in labels[text]:
            duplicates += 1
        labels[text].add(label)
    clean = [(text, next(iter(values))) for text, values in labels.items() if len(values) == 1]
    return clean, {'empty_rows_removed': empty, 'duplicate_rows_removed': duplicates,
                   'conflicting_texts_removed': sum(len(values) > 1 for values in labels.values()),
                   'clean_rows': len(clean)}


def matrix_svg(labels, matrix, name):
    size, left, top = 62, 135, 145
    width = left + len(labels) * size + 30
    height = top + len(labels) * size + 60
    maximum = max(max(row) for row in matrix) or 1
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
             '<rect width="100%" height="100%" fill="white"/>',
             f'<text x="20" y="28" font-size="18">{escape(name)} — held-out confusion matrix</text>',
             '<text x="20" y="56" font-size="13">Rows: reference; columns: prediction</text>']
    for i, label in enumerate(labels):
        parts.append(f'<text x="{left - 10}" y="{top + i * size + 36}" text-anchor="end" font-size="13">{escape(label)}</text>')
        parts.append(f'<text x="{left + i * size + 30}" y="{top - 12}" font-size="12" text-anchor="start" transform="rotate(-45 {left + i * size + 30} {top - 12})">{escape(label)}</text>')
        for j, value in enumerate(matrix[i]):
            shade = 245 - int(value / maximum * 140)
            parts.append(f'<rect x="{left + j * size}" y="{top + i * size}" width="{size}" height="{size}" fill="rgb({shade},{min(255, shade+20)},{shade})" stroke="white"/>')
            parts.append(f'<text x="{left+j*size+31}" y="{top+i*size+36}" text-anchor="middle" font-size="15">{value}</text>')
    return ''.join(parts) + '</svg>'


def evaluate(root=None):
    root = root or Path(__file__).resolve().parents[1]
    source = root / 'data/public-emotion/data.csv'
    with source.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    clean, cleaning = prepare(rows)
    train, test = train_test_split(clean, test_size=0.2, random_state=42, stratify=[y for _, y in clean])
    assert not ({text for text, _ in train} & {text for text, _ in test})
    labels = sorted({y for _, y in clean})
    output = root / 'docs/public-classification'
    output.mkdir(parents=True, exist_ok=True)
    report = {'dataset': 'Johnson8187/Chinese_Multi-Emotion_Dialogue_Dataset',
              'url': 'https://huggingface.co/datasets/Johnson8187/Chinese_Multi-Emotion_Dialogue_Dataset',
              'license': 'MIT (as declared by dataset card)',
              'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'limitations': ['混合日常对话、电影对白和 AI 生成文本，来源比例未披露，非纯真实用户数据。',
                             '保留 CSV 实际八类繁体中文标签。上游说明写有恐惧，但 CSV 为關切；以实际字段为准，不映射为焦虑等产品标签。',
                             '按清洗后的文本分层划分，未实现按作者、电影或模板分组；近似文本泄漏风险仍存在。',
                             '这是离线 TF-IDF 基线实验，不能代表 DeepSeek 在线理解的性能。'],
              'raw_rows': len(rows), 'cleaning': cleaning, 'seed': 42,
              'split': '80/20 stratified holdout after normalized-text deduplication; TF-IDF fits training only',
              'train_size': len(train), 'test_size': len(test), 'labels': labels,
              'train_counts': dict(Counter(y for _, y in train)), 'test_counts': dict(Counter(y for _, y in test)), 'results': []}
    for name, estimator in [('LogisticRegression', LogisticRegression(max_iter=1500, random_state=42)),
                            ('LinearSVC', LinearSVC(random_state=42))]:
        model = make_pipeline(TfidfVectorizer(analyzer='char', ngram_range=(1, 3), min_df=2, max_features=40000), estimator)
        model.fit([x for x, _ in train], [y for _, y in train])
        expected = [y for _, y in test]
        predicted = model.predict([x for x, _ in test])
        matrix = confusion_matrix(expected, predicted, labels=labels).tolist()
        result = {'model': name, 'accuracy': accuracy_score(expected, predicted),
                  'macro_f1': f1_score(expected, predicted, average='macro', zero_division=0),
                  'confusion_matrix': matrix, 'per_class': classification_report(expected, predicted, zero_division=0, output_dict=True),
                  'error_cases': [{'text': x, 'expected': y, 'predicted': str(p)} for (x, y), p in zip(test, predicted) if y != p][:20]}
        report['results'].append(result)
        (output / f'{name}-confusion.svg').write_text(matrix_svg(labels, matrix, name), encoding='utf-8')
    (output / 'metrics.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key != 'results'}, ensure_ascii=False, indent=2))
    print(json.dumps([{key: value for key, value in result.items() if key in {'model', 'accuracy', 'macro_f1'}} for result in report['results']], indent=2))
    return report


if __name__ == '__main__':
    evaluate()

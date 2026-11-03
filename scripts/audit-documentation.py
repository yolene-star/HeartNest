"""Offline documentation audit; never imports app.main or opens runtime SQLite."""
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DOCS = ['docs/data/README.md', 'docs/data/sources-and-labels.md',
        'docs/data/dictionary.md', 'docs/PRIVACY.md', 'docs/validation/README.md']


def main():
    dictionary = (ROOT / 'docs/data/dictionary.md').read_text(encoding='utf-8')
    models = {}
    for file in ['backend/app/main.py', 'backend/app/llm.py']:
        tree = ast.parse((ROOT / file).read_text(encoding='utf-8'))
        for node in tree.body:
            if not isinstance(node, ast.ClassDef) or not any(isinstance(b, ast.Name) and b.id == 'BaseModel' for b in node.bases):
                continue
            fields = [n.target.id for n in node.body if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)]
            assert node.name in dictionary, f'Missing model: {node.name}'
            for field in fields:
                assert re.search(r'\b' + re.escape(field) + r'\b', dictionary), f'Missing field: {node.name}.{field}'
            models[node.name] = fields
    links = 0
    for file in DOCS:
        text = (ROOT / file).read_text(encoding='utf-8')
        for dest in re.findall(r'\]\(([^)]+)\)', text):
            if dest.startswith(('https://', 'http://', '#')):
                continue
            target = (ROOT / file).parent / dest.split('#')[0]
            assert target.exists(), f'Broken link: {file}: {dest}'
            links += 1
    expected = json.loads((ROOT / 'docs/public-classification/metrics.json').read_text(encoding='utf-8'))
    source = ROOT / 'data/public-emotion/data.csv'
    assert hashlib.sha256(source.read_bytes()).hexdigest() == expected['source_sha256']
    spec = importlib.util.spec_from_file_location('public_classification', ROOT / 'backend/public_classification.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory(prefix='heartnest-doc-audit-') as temporary:
        root = Path(temporary)
        (root / 'data/public-emotion').mkdir(parents=True)
        shutil.copy2(source, root / 'data/public-emotion/data.csv')
        actual = module.evaluate(root)
    for key in ['source_sha256', 'raw_rows', 'cleaning', 'seed', 'train_size', 'test_size', 'labels', 'train_counts', 'test_counts']:
        assert actual[key] == expected[key], f'Dataset drift: {key}'
    for actual_model, expected_model in zip(actual['results'], expected['results']):
        assert actual_model['model'] == expected_model['model']
        assert abs(actual_model['macro_f1'] - expected_model['macro_f1']) < 1e-9
        assert actual_model['confusion_matrix'] == expected_model['confusion_matrix']
        assert len(actual_model['error_cases']) >= 3
    print(json.dumps({'passed': True, 'models': models, 'relative_links_checked': links,
                      'dataset_and_metrics_reproduced': True, 'personal_data_read': False}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

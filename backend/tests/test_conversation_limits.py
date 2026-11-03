import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv('COMPANION_DB', str(tmp_path / 'limits.sqlite3'))
    monkeypatch.setenv('LLM_ENABLED', 'false')
    import app.main as main
    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client


@pytest.mark.parametrize('size', [2000, 2001, 4000])
def test_valid_long_message_can_be_reused_in_next_round(api, size):
    text = '今天记录一点平常的事。' + '字' * (size - 11)
    assert len(text) == size
    first = api.post('/api/companion/respond', json={'text': text})
    assert first.status_code == 200
    history = [{'role': 'user', 'content': text}, {'role': 'assistant', 'content': first.json()['reply']}]
    for want_advice in [False, True]:
        result = api.post('/api/companion/respond', json={'text': '继续聊聊', 'conversation': history, 'want_advice': want_advice})
        assert result.status_code == 200, result.text
    assert api.get('/api/diaries').json()['items'] == []


def test_oversized_message_and_unbounded_context_are_rejected(api):
    assert api.post('/api/companion/respond', json={'text': '字' * 4001}).status_code == 422
    assert api.post('/api/companion/respond', json={'text': '继续', 'conversation': [{'role': 'assistant', 'content': '字' * 4001}]}).status_code == 422
    assert api.post('/api/companion/respond', json={'text': '继续', 'conversation': [{'role': 'user', 'content': '小事'}] * 7}).status_code == 422

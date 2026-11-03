import importlib
import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv('COMPANION_DB', str(tmp_path / 'provenance.sqlite3'))
    monkeypatch.setenv('LLM_ENABLED', 'false')
    monkeypatch.delenv('LLM_API_KEY', raising=False)
    import app.main as main
    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client


@pytest.mark.parametrize('enabled,key,reason', [('false', None, 'disabled'), ('true', None, 'unconfigured'), ('true', 'test-private-key', 'unavailable')])
def test_normal_reply_explains_rule_fallback_without_exposing_secrets(api, monkeypatch, enabled, key, reason):
    import app.main as main
    monkeypatch.setenv('LLM_ENABLED', enabled)
    if key:
        monkeypatch.setenv('LLM_API_KEY', key)
    monkeypatch.setattr(main, 'request_llm_understanding', lambda *args: None)
    monkeypatch.setattr(main, 'request_llm_reply', lambda *args: None)
    result = api.post('/api/companion/respond', json={'text': '今天想聊点小事。'}).json()
    assert result['reply_source'] == 'rules'
    assert result['reply_fallback_reason'] == reason
    assert result['understanding_source'] == 'rules'
    assert 'test-private-key' not in json.dumps(result)


@pytest.mark.parametrize('text,want_advice,source', [('你还记得我之前写了什么吗？', False, 'memory'), ('给我一个简单的小练习', True, 'advice'), ('我想伤害自己', False, 'safety')])
def test_intentional_local_paths_do_not_look_like_model_failure(api, text, want_advice, source):
    result = api.post('/api/companion/respond', json={'text': text, 'want_advice': want_advice}).json()
    assert result['reply_source'] == source
    assert result['reply_fallback_reason'] is None


def test_llm_reply_and_rule_understanding_are_reported_independently(api, monkeypatch):
    import app.main as main
    monkeypatch.setenv('LLM_ENABLED', 'true')
    monkeypatch.setenv('LLM_API_KEY', 'test-key')
    monkeypatch.setattr(main, 'request_llm_understanding', lambda *args: None)
    monkeypatch.setattr(main, 'request_llm_reply', lambda *args: '听起来你为这件小事花了心思。')
    result = api.post('/api/companion/respond', json={'text': '我今天做了一点小事。'}).json()
    assert result['llm_used'] is True
    assert result['reply_source'] == 'llm'
    assert result['understanding_source'] == 'rules'
    assert result['reply_fallback_reason'] is None

import importlib

import pytest
from fastapi.testclient import TestClient


def test_outbound_reply_has_evidence_based_boundaries_and_preserves_user_text(monkeypatch):
    from app.llm import request_llm_reply
    monkeypatch.setenv('LLM_ENABLED', 'true')
    monkeypatch.setenv('LLM_API_KEY', 'test-key')
    monkeypatch.setenv('LLM_BASE_URL', 'https://provider.example.test')
    payloads = []
    def provider(url, headers, payload, timeout):
        payloads.append(payload)
        return {'choices': [{'message': {'content': '知道了，我们按你说的平静来理解。'}}]}
    monkeypatch.setattr('app.llm.post_json', provider)
    text = '我不是焦虑，只是平静。请不要给我方法。'
    assert request_llm_reply(text, 'listen_first', '焦虑', [{'role': 'user', 'content': '刚才的分享'}])
    system = payloads[0]['messages'][0]['content']
    for rule in ['reflect', 'autonomy', 'correction', 'questions', 'positive', 'boundaries']:
        assert f'[{rule}]' in system
    assert 'SAMHSA TIP 35' in system
    assert '不是治疗' in system
    assert payloads[0]['messages'][-1] == {'role': 'user', 'content': text}
    assert payloads[0]['messages'][1]['content'] == '刚才的分享'


def test_api_reports_policy_version_without_claiming_manual_approval(tmp_path, monkeypatch):
    monkeypatch.setenv('COMPANION_DB', str(tmp_path / 'communication.sqlite3'))
    monkeypatch.setenv('LLM_ENABLED', 'false')
    import app.main as main
    importlib.reload(main)
    with TestClient(main.app) as api:
        reply = api.post('/api/companion/respond', json={'text': '我想说一点小事。'}).json()
    assert reply['communication_policy_version'] == '2026-11-02-v2'
    assert 'reviewed' not in reply['communication_policy_version']

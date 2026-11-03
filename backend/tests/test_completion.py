"""Regression for the product completion flows; always uses a disposable DB."""
import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv('COMPANION_DB', str(tmp_path / 'completion.sqlite3'))
    monkeypatch.setenv('LLM_ENABLED', 'false')
    import app.main as main
    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client


def test_diary_retrieval_permission_can_be_revoked(api):
    api.patch('/api/settings', json={'memory_enabled': True})
    diary = api.post('/api/diaries', json={'text': '周末校园散步', 'emotion_label': '开心'}).json()
    assert api.post('/api/memories/search', json={'query': '校园散步'}).json()['items']
    updated = api.patch(f'/api/diaries/{diary["id"]}', json={'allow_retrieval': False}).json()
    assert updated['allow_retrieval'] is False
    assert api.post('/api/memories/search', json={'query': '校园散步'}).json()['items'] == []
    assert api.get('/api/diaries').json()['items'][0]['text'] == diary['text']


def test_confirmed_positive_preference_changes_ranking(api):
    api.patch('/api/settings', json={'memory_enabled': True})
    api.post('/api/profile', json={'content': '阅读', 'type': '喜欢', 'confirmed': True})
    result = api.post('/api/recommendations', json={}).json()
    assert result['items'][0]['id'] == 'a4'
    assert '阅读' in ' '.join(result['items'][0]['reasons'])


def test_unconfirmed_or_deleted_preferences_do_not_influence_rank(api):
    original = api.post('/api/recommendations', json={}).json()['items']
    item = api.post('/api/profile', json={'content': '阅读', 'type': '喜欢', 'confirmed': False}).json()
    assert api.post('/api/recommendations', json={}).json()['items'] == original
    api.delete(f'/api/profile/{item["id"]}')
    assert api.post('/api/recommendations', json={}).json()['items'] == original


def test_recommendations_enforce_time_and_budget(api):
    result = api.post('/api/recommendations', json={'query': '想阅读', 'time': '下午', 'budget': 0}).json()
    assert [item['id'] for item in result['items']] == ['a4']
    assert api.post('/api/recommendations', json={'time': '今晚', 'budget': 0}).json()['items'] == []


def test_reject_is_temporary_until_explicitly_confirmed(api):
    api.post('/api/feedback', json={'recommendation_id': 'a1', 'action': 'reject'})
    assert api.get('/api/profile').json()['items'] == []
    assert any(x['id'] == 'a1' for x in api.post('/api/recommendations', json={}).json()['items'])
    response = api.post('/api/feedback', json={'recommendation_id': 'a1', 'action': 'reject', 'remember_preference': True}).json()
    profile = api.get('/api/profile').json()['items'][0]
    assert profile['type'] == '反感' and profile['confirmed']
    assert profile['source_feedback_id'] == response['id']
    api.patch('/api/settings', json={'memory_enabled': True})
    assert all(x['type'] != '户外' for x in api.post('/api/recommendations', json={}).json()['items'])


def test_feedback_updates_confirmed_profile_without_duplicates(api):
    for action, expected in [('accept', '想尝试'), ('experienced', '已体验')]:
        api.post('/api/feedback', json={'recommendation_id': 'a4', 'action': action, 'remember_preference': True})
        items = api.get('/api/profile').json()['items']
        assert len(items) == 1 and items[0]['type'] == expected
    assert api.post('/api/feedback', json={'recommendation_id': 'a4', 'action': 'modify', 'remember_preference': True}).status_code == 422


def test_advice_can_switch_to_a_real_alternative(api):
    first = api.post('/api/companion/respond', json={'text': '今天很累', 'want_advice': True}).json()['suggestion']
    second = api.post('/api/companion/respond', json={'text': '今天很累', 'want_advice': True, 'exclude_advice_ids': [first['id']]}).json()['suggestion']
    assert first['id'] != second['id'] and first['step'] != second['step']
    assert second['source']['url'].startswith('https://')
    assert second['limitation']

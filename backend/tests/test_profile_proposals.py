import importlib
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv('COMPANION_DB', str(tmp_path / 'proposals.sqlite3'))
    monkeypatch.setenv('LLM_ENABLED', 'false')
    import app.main as main
    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client

def propose(api, text):
    response = api.post('/api/companion/respond', json={'text': text})
    assert response.status_code == 200
    return response.json()['profile_proposals']

def test_nickname_requires_confirmation_and_is_idempotent(api):
    api.patch('/api/settings', json={'nickname': '原称呼'})
    proposal = propose(api, '从今天开始你要叫我小红')[0]
    assert proposal['kind'] == 'nickname' and proposal['content'] == '小红'
    assert api.get('/api/settings').json()['nickname'] == '原称呼'
    assert api.get('/api/profile').json()['items'] == []
    result = api.post(f"/api/profile/proposals/{proposal['id']}/confirm")
    assert result.status_code == 200
    assert api.get('/api/settings').json()['nickname'] == '小红'
    assert api.post(f"/api/profile/proposals/{proposal['id']}/confirm").json() == result.json()
    assert propose(api, '以后叫我小红') == []

def test_reject_and_stale_setting_do_not_overwrite(api):
    proposal = propose(api, '以后叫我小红')[0]
    assert api.post(f"/api/profile/proposals/{proposal['id']}/dismiss").status_code == 200
    assert api.post(f"/api/profile/proposals/{proposal['id']}/confirm").status_code == 409
    proposal = propose(api, '以后叫我小绿')[0]
    api.patch('/api/settings', json={'nickname': '手动设置'})
    assert api.post(f"/api/profile/proposals/{proposal['id']}/confirm").status_code == 409
    assert api.get('/api/settings').json()['nickname'] == '手动设置'

def test_habit_is_confirmed_once_and_editable(api):
    proposal = propose(api, '我每天睡前会读十分钟书。')[0]
    assert proposal['kind'] == 'habit'
    assert api.get('/api/profile').json()['items'] == []
    api.post(f"/api/profile/proposals/{proposal['id']}/confirm")
    profile = api.get('/api/profile').json()['items'][0]
    assert profile['category'] == 'habit' and profile['confirmed']
    assert profile['source_text'] in '我每天睡前会读十分钟书。'
    assert propose(api, '我每天睡前会读十分钟书。') == []
    assert api.get('/api/diaries').json()['items'] == []
    assert api.patch(f"/api/profile/{profile['id']}", json={'content': '睡前读二十分钟书'}).status_code == 200
    assert api.delete(f"/api/profile/{profile['id']}").status_code == 200

def test_avoids_duplicate_interest_and_fixed_settings(api, monkeypatch):
    api.post('/api/profile', json={'content': '每天睡前会读十分钟书', 'type': '喜欢', 'confirmed': True})
    assert propose(api, '我每天睡前会读十分钟书。') == []
    import app.main as main
    monkeypatch.setattr(main, 'request_llm_understanding', lambda *a: {'label': '平静', 'confidence': .8, 'intent': 'share', 'memory_query': '', 'reason': '明确自述', 'profile_candidates': [{'kind': 'trait', 'content': '我叫小红', 'evidence': '我叫小红'}]})
    api.patch('/api/settings', json={'nickname': '小红'})
    assert propose(api, '我叫小红') == []

@pytest.mark.parametrize('text', ['不要叫我小红', '朋友说以后叫我小红', '如果以后叫我小红会怎样', '我今天很焦虑', '我每天很焦虑', '我不想让你记录我的习惯'])
def test_no_inferred_or_negated_profile(api, text):
    assert propose(api, text) == []

def test_validated_llm_can_extract_natural_trait_but_needs_evidence(api, monkeypatch):
    import app.main as main
    base = {'label': '平静', 'confidence': .8, 'intent': 'share', 'memory_query': '', 'reason': '自述'}
    monkeypatch.setattr(main, 'request_llm_understanding', lambda *a: {**base, 'profile_candidates': [{'kind': 'trait', 'content': '在陌生场合需要一点适应时间', 'evidence': '每次到陌生的聚会里，我得先安静待一会才能聊开'}]})
    items = propose(api, '每次到陌生的聚会里，我得先安静待一会才能聊开。')
    assert len(items) == 1 and items[0]['kind'] == 'trait'
    monkeypatch.setattr(main, 'request_llm_understanding', lambda *a: {**base, 'profile_candidates': [{'kind': 'trait', 'content': '虚构特征', 'evidence': '用户从未说过'}]})
    assert propose(api, '普通的一天') == []


def test_response_preference_requires_confirmation(api, monkeypatch):
    import app.main as main
    text = '以后先听我说，不急着给建议'
    monkeypatch.setattr(main, 'request_llm_understanding', lambda *a: {'label': '平静', 'confidence': .8, 'intent': 'share', 'memory_query': '', 'reason': '明确诉求', 'profile_candidates': [{'kind': 'response_preference', 'content': 'listen_first', 'evidence': text}]})
    proposal = propose(api, text)[0]
    assert api.get('/api/settings').json()['response_preference'] == 'adapt'
    assert api.post(f"/api/profile/proposals/{proposal['id']}/confirm").status_code == 200
    assert api.get('/api/settings').json()['response_preference'] == 'listen_first'
    assert api.get('/api/profile').json()['items'] == []


def test_expired_proposal_and_invalid_model_candidate(api, monkeypatch):
    import app.main as main
    proposal = propose(api, '以后叫我小红')[0]
    main.PROFILE_PROPOSALS[proposal['id']]['time'] -= 1801
    assert api.post(f"/api/profile/proposals/{proposal['id']}/confirm").status_code == 409
    assert api.get('/api/settings').json()['nickname'] == ''
    from app.llm import TextUnderstanding
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        TextUnderstanding.model_validate({'label': '平静', 'confidence': .8, 'intent': 'share', 'memory_query': '', 'reason': '测试', 'profile_candidates': [{'kind': 'execute', 'content': '非法动作', 'evidence': 'test'}]})

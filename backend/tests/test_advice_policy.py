import importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv('COMPANION_DB', str(tmp_path / 'advice.sqlite3'))
    monkeypatch.setenv('LLM_ENABLED', 'false')
    monkeypatch.setenv('PUBLIC_DEMO', 'false')
    import app.main as main
    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client


def advice(api, text='给我一个简单的小办法', **extra):
    return api.post('/api/companion/respond', json={'text': text, 'want_advice': True, **extra}).json()


def test_every_advice_has_validated_evidence_and_stops_after_exhaustion(api):
    seen = []
    for _ in range(10):
        item = advice(api, exclude_advice_ids=seen)['suggestion']
        if item is None:
            break
        assert item['id'] not in seen
        assert item['basis']['type'] == 'literature'
        assert item['basis']['sources'][0]['id']
        assert item['basis']['sources'][0]['url'].startswith('https://')
        assert item['adaptation'] and item['limitation']
        seen.append(item['id'])
    else:
        pytest.fail('suggestions repeated or never exhausted')


@pytest.mark.parametrize('text', ['我喜欢听爵士乐', '我喜欢画画', '我喜欢阅读'])
def test_current_explicit_preferences_have_traceable_basis(api, text):
    item = advice(api, text)['suggestion']
    assert item['basis']['type'] in {'preference', 'both'}
    assert item['basis']['preferences'][0]['origin'] == 'current_message'
    assert item['basis']['preferences'][0]['evidence'] in text


def test_saved_preferences_need_permission_confirmation_and_deletion(api):
    profile = api.post('/api/profile', json={'content': '喜欢听音乐', 'type': '喜欢', 'confirmed': True}).json()
    assert advice(api)['suggestion']['id'] == 'grounding-pause'
    api.patch('/api/settings', json={'memory_enabled': True})
    item = advice(api)['suggestion']
    assert item['id'] == 'familiar-music'
    assert item['basis']['preferences'][0]['id'] == profile['id']
    api.delete('/api/profile/' + profile['id'])
    assert advice(api)['suggestion']['id'] == 'grounding-pause'
    api.post('/api/profile', json={'content': '喜欢听音乐', 'confirmed': False})
    assert advice(api)['suggestion']['id'] == 'grounding-pause'


@pytest.mark.parametrize('text', ['我喜欢喝酒解压，推荐喝什么', '赌博翻本让我放松', '抽烟让我放松', '擅自加药睡觉'])
def test_risky_coping_never_becomes_positive_suggestion(api, text):
    result = advice(api, text)
    assert result['advice_policy']['risk'] == 'restricted'
    assert result['suggestion']['id'] == 'grounding-pause'
    assert '不会推荐' in result['reply']


@pytest.mark.parametrize('text', ['我不喝酒', '朋友喜欢喝酒', '以前喜欢喝酒，现在不喝了', '我喜欢酒吧里的爵士乐'])
def test_negation_subject_history_and_music_are_not_risky_preferences(api, text):
    result = advice(api, text)
    assert result['advice_policy']['risk'] != 'restricted'
    assert not any('酒' in p['content'] for p in result['suggestion']['basis']['preferences'])


def test_impaired_habit_and_refusal_are_context_not_diagnosis(api):
    result = advice(api, '我喜欢游戏，但是最近停不下来，影响睡眠')
    assert result['advice_policy']['risk'] == 'needs_context'
    assert '成瘾' not in result['reply']
    assert advice(api, '我不需要建议，只想聊聊')['suggestion'] is None
    assert advice(api, '这个办法让我更不舒服了')['suggestion'] is None


def test_rejection_and_discomfort_are_temporary_unless_confirmed(api):
    api.post('/api/feedback', json={'recommendation_id': 'grounding-pause', 'action': 'reject'})
    assert api.get('/api/profile').json()['items'] == []
    assert advice(api)['suggestion']['id'] == 'grounding-pause'
    result = api.post('/api/feedback', json={'recommendation_id': 'grounding-pause', 'action': 'reject', 'remember_preference': True})
    assert result.status_code == 200
    api.patch('/api/settings', json={'memory_enabled': True})
    assert advice(api)['suggestion']['id'] != 'grounding-pause'
    api.patch('/api/settings', json={'memory_enabled': False})
    assert advice(api)['suggestion']['id'] == 'grounding-pause'


def test_unvalidated_source_is_not_rendered(api, monkeypatch):
    from app.content import ADVICE_LIBRARY
    monkeypatch.setitem(ADVICE_LIBRARY['grounding-pause'], 'source_id', 'made-up-study')
    assert advice(api)['suggestion']['id'] != 'grounding-pause'


def test_current_dislike_beats_saved_positive_preference(api):
    api.patch('/api/settings', json={'memory_enabled': True})
    api.post('/api/profile', json={'content': '喜欢听音乐', 'confirmed': True})
    assert advice(api, '现在不想听音乐')['suggestion']['id'] != 'familiar-music'
    assert advice(api, '听音乐让我更难受')['suggestion'] is None


def test_catalog_respects_memory_and_requires_traceable_basis(api):
    api.post('/api/profile', json={'content': '阅读', 'confirmed': True})
    assert api.post('/api/recommendations', json={'time': '下午'}).json()['items'] == []
    api.patch('/api/settings', json={'memory_enabled': True})
    item = api.post('/api/recommendations', json={'time': '下午'}).json()['items'][0]
    assert item['basis']['preferences'][0]['origin'] == 'confirmed_profile'
    api.patch('/api/settings', json={'memory_enabled': False})
    item = api.post('/api/recommendations', json={'query': '想阅读', 'time': '下午'}).json()['items'][0]
    assert item['basis']['preferences'][0]['origin'] == 'current_message'


@pytest.mark.parametrize('query', ['我不想看电影', '朋友喜欢甜品', '以前喜欢甜品，现在不了', '赌博翻本让我放松'])
def test_catalog_does_not_treat_negation_other_people_history_or_risk_as_preference(api, query):
    items = api.post('/api/recommendations', json={'query': query}).json()['items']
    assert all(item['id'] == 'a1' and item['basis']['sources'] for item in items)


def test_plain_chat_request_for_advice_uses_controlled_action(api, monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, 'request_llm_reply', lambda *args: '喝酒可以消除压力，研究证明。')
    result = api.post('/api/companion/respond', json={'text': '给我一个放松建议'}).json()
    assert result['suggestion']['basis']['sources']
    assert result['reply_source'] == 'advice'
    assert not result['llm_used'] and '喝酒' not in result['reply']


@pytest.mark.parametrize('action', ['reject', 'uncomfortable'])
def test_confirmed_advice_avoidance_is_editable_and_deletable(api, action):
    response = api.post('/api/feedback', json={'recommendation_id': 'grounding-pause', 'action': action, 'remember_preference': True})
    assert response.status_code == 200
    profile_id = response.json()['profile_id']
    api.patch('/api/settings', json={'memory_enabled': True})
    assert advice(api)['suggestion']['id'] != 'grounding-pause'
    api.delete('/api/profile/' + profile_id)
    assert advice(api)['suggestion']['id'] == 'grounding-pause'


def test_activity_discomfort_confirmation_rejected_without_mutation(api):
    response = api.post('/api/feedback', json={'recommendation_id': 'a1', 'action': 'uncomfortable', 'remember_preference': True})
    assert response.status_code == 422
    assert api.get('/api/profile').json()['items'] == []


@pytest.mark.parametrize('text', ['教我一个呼吸练习', '我该做什么才能不这么紧张', '能推荐个活动吗', '我想找个小活动', '有什么办法让我轻松一点'])
def test_natural_action_requests_are_controlled(api, monkeypatch, text):
    import app.main as main
    monkeypatch.setattr(main, 'request_llm_reply', lambda *args: '未经校验的办法')
    result = api.post('/api/companion/respond', json={'text': text}).json()
    assert result['reply_source'] == 'advice' and not result['llm_used']
    assert result['suggestion']['basis']['sources']


@pytest.mark.parametrize('want_advice', [False, True])
@pytest.mark.parametrize('text', ['听音乐后不舒服', '画画让我更难受', '呼吸练习之后头晕', '做完以后心慌'])
def test_discomfort_stops_without_new_action_or_llm(api, monkeypatch, want_advice, text):
    import app.main as main
    monkeypatch.setattr(main, 'request_llm_reply', lambda *args: '继续坚持')
    result = api.post('/api/companion/respond', json={'text': text, 'want_advice': want_advice}).json()
    assert result['suggestion'] is None and not result['llm_used']
    assert '先停下' in result['reply']


@pytest.mark.parametrize('text', ['她喜欢阅读', '我不看书', '我不听音乐', '我戒掉了听音乐熬夜的习惯'])
def test_other_subject_and_implicit_negation_are_not_positive_preferences(api, text):
    item = advice(api, text)['suggestion']
    assert item['basis']['type'] == 'literature'


@pytest.mark.parametrize('query', ['我不看电影', '她喜欢甜品', '我不吃甜品'])
def test_catalog_implicit_negation_and_thirdperson(api, query):
    items = api.post('/api/recommendations', json={'query': query}).json()['items']
    assert [item['id'] for item in items] == ['a1']


def test_cross_turn_risky_preference_is_not_recommended(api):
    result = advice(api, '给我一个小建议', conversation=[
        {'role': 'user', 'content': '我喜欢音乐，但是最近听音乐停不下来，影响学习'},
        {'role': 'assistant', 'content': '先照顾一下自己。'},
    ])
    assert result['suggestion']['id'] != 'familiar-music'
    assert result['suggestion']['basis']['preferences'] == []

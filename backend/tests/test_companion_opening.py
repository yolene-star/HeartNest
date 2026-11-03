"""Opening lines use only recent, consented and user-confirmed mood records."""
from datetime import date
from test_advice_policy import api
import pytest


def record(api, label='疲惫', day='2026-11-02', **extra):
    return api.post('/api/diaries', json={'text': '私密细节不应主动展示', 'emotion_label': label, 'recorded_at': day, **extra}).json()


def opening(api):
    response = api.get('/api/companion/opening')
    assert response.status_code == 200
    return response.json()


@pytest.fixture(autouse=True)
def fixed_today(api, monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, 'diary_today', lambda: date(2026, 11, 3))


def test_generic_opening_without_data_or_memory_consent(api):
    empty = opening(api)
    assert empty['text'] and empty['personalized'] is False and empty['basis'] == []
    record(api)
    assert opening(api) == empty
    api.patch('/api/settings', json={'nickname': '小红'})
    assert opening(api)['text'].startswith('小红，')


@pytest.mark.parametrize('label,phrase', [('开心', '开心'), ('平静', '平静'), ('疲惫', '累'), ('低落', '低落'), ('焦虑', '紧张'), ('生气', '生气'), ('混合/说不清', '说不清'), ('积极', '开心'), ('平稳', '平静')])
def test_personalized_opening_reflects_user_confirmed_state_without_claiming_current_state(api, label, phrase):
    api.patch('/api/settings', json={'memory_enabled': True})
    item = record(api, label)
    result = opening(api)
    assert result['personalized'] and phrase in result['text']
    assert '最近' in result['text'] and '私密细节' not in result['text']
    assert result['basis'][0] == {'diary_id': item['id'], 'date': '2026-11-02', 'label': label}
    assert result['source'] == 'confirmed_mood_rules'


def test_unconfirmed_skipped_nonretrievable_old_and_deleted_records_are_excluded(api):
    api.patch('/api/settings', json={'memory_enabled': True})
    record(api, '疲惫', allow_retrieval=False)
    record(api, '低落', day='2026-10-26')
    api.post('/api/diaries', json={'text': '好焦虑', 'recorded_at': '2026-11-03'})
    skipped = record(api, '焦虑')
    api.patch('/api/diaries/' + skipped['id'] + '/emotion', json={'status': 'skipped'})
    item = record(api, '开心')
    api.delete('/api/diaries/' + item['id'])
    assert opening(api)['personalized'] is False


def test_latest_day_takes_priority_over_insertion_order_and_old_mood(api):
    api.patch('/api/settings', json={'memory_enabled': True})
    newest = record(api, '开心', '2026-11-03')
    record(api, '低落', '2026-10-30')  # Backfilled later, not the current trajectory.
    result = opening(api)
    assert '开心' in result['text'] and '低落' not in result['text']
    assert [b['diary_id'] for b in result['basis']] == [newest['id']]
    record(api, '疲惫', '2026-11-03')
    assert '不止一种' in opening(api)['text']


def test_confirmation_correction_revocation_and_empty_state_are_immediate(api):
    api.patch('/api/settings', json={'memory_enabled': True})
    item = record(api, '疲惫')
    assert '累' in opening(api)['text']
    api.patch('/api/diaries/' + item['id'] + '/emotion', json={'label': '平静'})
    assert '平静' in opening(api)['text']
    api.patch('/api/diaries/' + item['id'], json={'allow_retrieval': False})
    assert opening(api)['personalized'] is False
    api.patch('/api/settings', json={'memory_enabled': False})
    assert opening(api)['basis'] == []


def test_opening_does_not_call_llm_write_diaries_or_create_profiles(api, monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, 'request_llm_reply', lambda *args: pytest.fail('opening must not send diaries to model'))
    before = api.get('/api/diaries').json()
    assert opening(api) == opening(api)
    assert api.get('/api/diaries').json() == before
    assert api.get('/api/profile').json()['items'] == []

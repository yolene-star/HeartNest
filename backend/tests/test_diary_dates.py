import importlib
from datetime import date

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv('COMPANION_DB', str(tmp_path / 'dates.sqlite3'))
    monkeypatch.setenv('LLM_ENABLED', 'false')
    import app.main as main
    importlib.reload(main)
    monkeypatch.setattr(main, 'diary_today', lambda: date(2026, 11, 3), raising=False)
    with TestClient(main.app) as client:
        yield client


@pytest.mark.parametrize('value', ['2026-11-04', '2026-11-04T00:00:00+08:00', '2027-01-01T00:00:00Z', '2026-11-03T20:00:00Z', '2026-02-30', 'not-a-date', ''])
def test_reject_future_or_invalid_dates_without_writing(api, value):
    before = api.get('/api/diaries').json()
    response = api.post('/api/diaries', json={'text': '日期校验模拟记录', 'recorded_at': value})
    assert response.status_code == 422
    assert api.get('/api/diaries').json() == before


@pytest.mark.parametrize('value, day', [('2026-11-03', '2026-11-03'), ('2026-11-02T12:00:00', '2026-11-02'), ('2026-11-03T23:59:59+08:00', '2026-11-03'), ('2026-11-04T00:30:00+14:00', '2026-11-03')])
def test_allow_today_and_past_with_beijing_date_normalization(api, value, day):
    response = api.post('/api/diaries', json={'text': '允许今天或过去', 'recorded_at': value})
    assert response.status_code == 200
    assert response.json()['recorded_at'].startswith(day)


def test_patch_future_date_is_rejected_atomically(api):
    created = api.post('/api/diaries', json={'text': '保留原文', 'recorded_at': '2026-11-02'}).json()
    response = api.patch(f"/api/diaries/{created['id']}", json={'text': '不应被保存', 'recorded_at': '2026-11-04'})
    assert response.status_code == 422
    assert next(item for item in api.get('/api/diaries').json()['items'] if item['id'] == created['id'])['text'] == '保留原文'


def test_default_timestamp_uses_beijing_timezone(api):
    created = api.post('/api/diaries', json={'text': '默认日期'}).json()
    assert created['recorded_at'].endswith('+08:00')

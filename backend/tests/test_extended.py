import os
import importlib
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv('COMPANION_DB', str(tmp_path / 'test.sqlite3'))
    import app.main as main
    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client

def test_restart_and_correction(api):
    d=api.post('/api/diaries',json={'text':'想去甜品店','mode':'respond'}).json()
    assert d['response']
    assert api.patch(f"/api/diaries/{d['id']}/emotion",json={'label':'平稳','status':'confirmed'}).status_code==200
    import app.main as main
    importlib.reload(main)
    assert api.get('/api/diaries').json()['items'][0]['emotion']['label']=='平稳'

def test_privacy_erases_derived_and_does_not_infer(api):
    d=api.post('/api/diaries',json={'text':'我喜欢甜品店'}).json()
    api.post('/api/profile',json={'content':'甜品店','source_id':d['id'],'confirmed':True})
    api.delete(f"/api/diaries/{d['id']}")
    assert api.get('/api/profile').json()['items']==[]
    assert api.post('/api/memories/search',json={'query':'甜品店'}).json()['items']==[]
    assert api.post('/api/memories/search',json={'query':'火星宇宙飞船'}).json()['items']==[]

def test_feedback_budget_and_category(api):
    rec=api.post('/api/recommendations',json={'query':'甜品','budget':100,'time':'周末'}).json()['items'][0]
    api.post('/api/feedback',json={'recommendation_id':rec['id'],'action':'reject'})
    items=api.post('/api/recommendations',json={'query':'甜品','budget':100,'time':'周末'}).json()['items']
    assert all(x['type']!=rec['type'] for x in items)
    assert api.post('/api/feedback',json={'recommendation_id':'missing','action':'reject'}).status_code==404
    assert api.post('/api/recommendations',json={'budget':-1}).status_code==422

def test_skip_and_filter(api):
    d=api.post('/api/diaries',json={'text':'今天平常','recorded_at':'2026-10-27T12:00:00','mode':'save'}).json()
    assert d['response'] is None
    api.patch(f"/api/diaries/{d['id']}/emotion",json={'status':'skipped'})
    assert api.get('/api/diaries?date=2026-10-26').json()['items']==[]
    assert api.post('/api/diaries',json={'text':'   '}).status_code==422
    assert api.patch(f"/api/diaries/{d['id']}/emotion",json={'label':'诊断'}).status_code==422

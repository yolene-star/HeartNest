import importlib
import sqlite3

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def demo(tmp_path, monkeypatch):
    monkeypatch.setenv('COMPANION_DB', str(tmp_path / 'demo.sqlite3'))
    monkeypatch.setenv('PUBLIC_DEMO', 'true')
    monkeypatch.setenv('LLM_ENABLED', 'false')
    import app.main as main
    importlib.reload(main)
    yield main
    monkeypatch.setenv('PUBLIC_DEMO', 'false')
    importlib.reload(main)


def test_visitors_cannot_read_or_modify_each_others_data(demo):
    with TestClient(demo.app) as a, TestClient(demo.app) as b:
        assert a.get('/api/settings').json()['public_demo'] is True
        a.patch('/api/settings', json={'nickname': '访客甲'})
        diary = a.post('/api/diaries', json={'text': '虚构日记：今天读书很开心'}).json()
        profile = a.post('/api/profile', json={'content': '读书', 'confirmed': True}).json()
        assert b.get('/api/settings').json()['nickname'] == ''
        assert b.get('/api/diaries').json()['items'] == []
        assert b.get('/api/profile').json()['items'] == []
        assert b.delete('/api/diaries/' + diary['id']).status_code == 404
        assert b.delete('/api/profile/' + profile['id']).status_code == 404
        assert len(a.get('/api/diaries').json()['items']) == 1
        assert a.get('/api/settings').json()['nickname'] == '访客甲'


def test_proposals_are_private_and_reload_preserves_session(demo):
    with TestClient(demo.app) as a, TestClient(demo.app) as b:
        reply = a.post('/api/companion/respond', json={'text': '以后叫我小红'}).json()
        proposal_id = reply['profile_proposals'][0]['id']
        with sqlite3.connect(demo.DB_PATH) as db:
            snapshots = db.execute('SELECT payload FROM demo_sessions').fetchall()
        assert all('以后叫我小红' not in row[0] and 'proposals' not in row[0] for row in snapshots)
        assert b.post(f'/api/profile/proposals/{proposal_id}/confirm').status_code == 409
        assert a.post(f'/api/profile/proposals/{proposal_id}/confirm').status_code == 200
        cookies = dict(a.cookies)
    importlib.reload(demo)
    with TestClient(demo.app, cookies=cookies) as reopened:
        assert reopened.get('/api/settings').json()['nickname'] == '小红'


def test_unconfirmed_proposals_are_lost_on_restart(demo):
    with TestClient(demo.app) as a:
        proposal_id = a.post('/api/companion/respond', json={'text': '以后叫我小蓝'}).json()['profile_proposals'][0]['id']
        cookies = dict(a.cookies)
    importlib.reload(demo)
    with TestClient(demo.app, cookies=cookies) as a:
        assert a.post(f'/api/profile/proposals/{proposal_id}/confirm').status_code == 409
        assert a.get('/api/settings').json()['nickname'] == ''


def test_cookie_and_expiry_and_health(demo):
    with TestClient(demo.app) as a:
        health = a.get('/api/health')
        assert health.json() == {'status': 'ok', 'public_demo': True}
        assert 'set-cookie' not in health.headers
        first = a.get('/api/settings', headers={'x-forwarded-proto': 'https'})
        cookie = first.headers['set-cookie'].lower()
        assert 'httponly' in cookie and 'samesite=lax' in cookie and 'secure' in cookie
    with TestClient(demo.app) as a:
        a.patch('/api/settings', json={'nickname': '应过期'})
        old = a.cookies.get('heartnest_demo')
        with sqlite3.connect(demo.DB_PATH) as db:
            db.execute('UPDATE demo_sessions SET expires_at=0')
        assert a.get('/api/settings').json()['nickname'] == ''
        assert a.cookies.get('heartnest_demo') != old
    with TestClient(demo.app, cookies={'heartnest_demo': '../../invalid'}) as b:
        assert b.get('/api/settings').json()['nickname'] == ''
        assert len(b.cookies.get('heartnest_demo', domain='testserver.local')) == 64


def test_session_limits_do_not_evict_other_visitors(demo, monkeypatch):
    import app.public_demo as storage
    with TestClient(demo.app) as a, TestClient(demo.app) as b:
        a.patch('/api/settings', json={'nickname': '保留'})
        monkeypatch.setattr(storage, 'MAX_SESSIONS', 1)
        assert b.get('/api/settings').status_code == 503
        assert a.get('/api/settings').json()['nickname'] == '保留'
        monkeypatch.setattr(storage, 'MAX_SNAPSHOT_BYTES', 100)
        assert a.post('/api/diaries', json={'text': '超限测试'}).status_code == 413
        monkeypatch.setattr(storage, 'MAX_SNAPSHOT_BYTES', 4 * 1024 * 1024)
        assert a.get('/api/diaries').json()['items'] == []


def test_demo_ignores_existing_private_snapshot(demo):
    with sqlite3.connect(demo.DB_PATH) as db:
        db.execute('INSERT OR REPLACE INTO state VALUES(1, ?)', ('{"settings":{"nickname":"私人"},"diaries":[],"profiles":[],"feedback":[]}',))
    importlib.reload(demo)
    with TestClient(demo.app) as a:
        assert a.get('/api/settings').json()['nickname'] == ''

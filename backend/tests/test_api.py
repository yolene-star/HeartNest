from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_diary_emotion_memory_and_delete_flow():
    created = client.post('/api/diaries', json={"kind":"diary","text":"今天很累，但想找点轻松的事情","mode":"respond","allow_retrieval":True}).json()
    assert created["emotion"]["label"] in {"低落", "平稳", "焦虑", "积极"}
    assert created["id"]
    search = client.post('/api/memories/search', json={"query":"累 轻松","top_k":3}).json()
    assert any(item["id"] == created["id"] for item in search["items"])
    deleted = client.delete(f'/api/diaries/{created["id"]}')
    assert deleted.status_code == 200
    search_after = client.post('/api/memories/search', json={"query":"累 轻松","top_k":3}).json()
    assert all(item["id"] != created["id"] for item in search_after["items"])

def test_profile_feedback_updates_status_and_memory_toggle():
    profile = client.post('/api/profile', json={"content":"甜品店","type":"想尝试","status":"active","source_id":None,"confirmed":True}).json()
    assert profile["content"] == "甜品店"
    updated = client.patch(f'/api/profile/{profile["id"]}', json={"status":"rejected"})
    assert updated.json()["status"] == "rejected"
    settings = client.patch('/api/settings', json={"memory_enabled":False})
    assert settings.json()["memory_enabled"] is False
    blocked = client.post('/api/memories/search', json={"query":"甜品店"})
    assert blocked.json()["items"] == []
    client.patch('/api/settings', json={"memory_enabled":True})

def test_recommendation_respects_rejected_type():
    client.post('/api/profile', json={"content":"甜品店","type":"反感","status":"rejected","source_id":None,"confirmed":True})
    result = client.post('/api/recommendations', json={"query":"最近无聊，想出门","budget":100,"time":"周末"}).json()
    assert result["items"]
    assert all("甜品" not in item["name"] for item in result["items"])

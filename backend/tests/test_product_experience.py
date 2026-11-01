import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv("COMPANION_DB", str(tmp_path / "product.sqlite3"))
    import app.main as main

    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client


def test_companion_listens_by_default_and_uses_reviewed_source_for_advice(api):
    listened = api.post(
        "/api/companion/respond",
        json={"text": "最近事情堆在一起，我有点慌。", "want_advice": False},
    )
    assert listened.status_code == 200
    assert listened.json()["reply"]
    assert listened.json()["suggestion"] is None

    advice = api.post(
        "/api/companion/respond",
        json={"text": "事情太多了，给我一个小办法", "want_advice": True},
    )
    assert advice.status_code == 200
    suggestion = advice.json()["suggestion"]
    assert advice.json()["emotion_suggestion"] is None
    assert suggestion["id"] == "grounding-pause"
    assert suggestion["source"]["title"] == "Doing What Matters in Times of Stress"
    assert suggestion["source"]["url"].startswith("https://www.who.int/")
    assert suggestion["limitation"]


def test_response_preference_changes_companion_style_without_forcing_advice(api):
    listen_first = api.post(
        "/api/companion/respond",
        json={"text": "今天事情堆在一起，我有点慌。", "response_preference": "listen_first"},
    ).json()
    think_together = api.post(
        "/api/companion/respond",
        json={"text": "今天事情堆在一起，我有点慌。", "response_preference": "think_together"},
    ).json()
    adapt = api.post(
        "/api/companion/respond",
        json={"text": "今天事情堆在一起，我有点慌。", "response_preference": "adapt"},
    ).json()
    assert listen_first["suggestion"] is None
    assert think_together["suggestion"] is None
    assert listen_first["reply"] != think_together["reply"]
    assert think_together["reply"] != adapt["reply"]
    assert "慢慢说" in listen_first["reply"]
    assert "一起" in think_together["reply"]
    assert "哪一件" in adapt["reply"]


def test_diary_save_and_memory_permissions_are_separate_and_editable(api):
    diary = api.post(
        "/api/diaries",
        json={"kind": "diary", "text": "今天有点疲惫", "mode": "save"},
    )
    assert diary.status_code == 200
    created = diary.json()
    assert created["emotion_confirmed"] is False
    assert created["response"] is None

    disabled = api.patch("/api/settings", json={"memory_enabled": False})
    assert disabled.json()["memory_enabled"] is False
    assert api.post("/api/memories/search", json={"query": "疲惫"}).json()["items"] == []

    enabled = api.patch("/api/settings", json={"memory_enabled": True})
    assert enabled.json()["memory_enabled"] is True
    assert api.post("/api/memories/search", json={"query": "疲惫"}).json()["items"]

    edited = api.patch(
        f"/api/diaries/{created['id']}",
        json={"text": "今天有点疲惫，后来散步舒服了一些。"},
    )
    assert edited.status_code == 200
    assert edited.json()["text"].endswith("舒服了一些。")

    addition = api.post(
        f"/api/diaries/{created['id']}/addenda",
        json={"text": "后来补充：散步时听了喜欢的歌。"},
    )
    assert addition.status_code == 200
    assert addition.json()["addenda"][-1]["text"].startswith("后来补充：")


def test_diary_can_store_agent_response_separately_from_original_text(api):
    diary = api.post(
        "/api/diaries",
        json={
            "kind": "diary",
            "text": "今天写下了很重要的一段话。",
            "mode": "respond",
            "response_requested": True,
            "response_text": "我听见你在认真整理这段经历。",
        },
    )
    assert diary.status_code == 200
    body = diary.json()
    assert body["mode"] == "respond"
    assert body["response_requested"] is True
    assert body["response_text"] == "我听见你在认真整理这段经历。"
    assert body["text"] != body["response_text"]


def test_memory_can_retrieve_saved_agent_response_when_diary_allows_retrieval(api):
    diary = api.post(
        "/api/diaries",
        json={
            "kind": "diary",
            "text": "今天写下了关于考试的感受。",
            "mode": "respond",
            "response_requested": True,
            "response_text": "你已经在很认真地面对这份压力了。",
            "allow_retrieval": True,
        },
    ).json()
    api.patch("/api/settings", json={"memory_enabled": True})
    found = api.post("/api/memories/search", json={"query": "认真面对压力"}).json()["items"]
    assert found[0]["id"] == diary["id"]
    assert found[0]["response_text"] == "你已经在很认真地面对这份压力了。"

    private = api.post(
        "/api/diaries",
        json={
            "kind": "diary",
            "text": "不允许被检索的记录。",
            "mode": "respond",
            "response_requested": True,
            "response_text": "这段回应也不应该被引用。",
            "allow_retrieval": False,
        },
    ).json()
    hidden = api.post("/api/memories/search", json={"query": "回应也不应该被引用"}).json()["items"]
    assert all(item["id"] != private["id"] for item in hidden)


def test_companion_history_response_includes_saved_agent_reply(api):
    diary = api.post(
        "/api/diaries",
        json={
            "kind": "diary",
            "text": "回归测试记录 EC-20261101",
            "mode": "respond",
            "response_requested": True,
            "response_text": "这是保存下来的陪伴回应。",
            "allow_retrieval": True,
        },
    ).json()
    api.patch("/api/settings", json={"memory_enabled": True})
    result = api.post(
        "/api/companion/respond",
        json={"text": "你还记得回归测试记录 EC-20261101 吗？"},
    )
    assert result.status_code == 200
    body = result.json()
    assert body["memories"]
    assert body["memories"][0]["id"] == diary["id"]
    assert body["memories"][0]["response_text"] == "这是保存下来的陪伴回应。"


def test_latest_matching_diary_is_not_displaced_by_older_ties(api):
    for index in range(3):
        api.post(
            "/api/diaries",
            json={"kind": "diary", "text": "回归排序关键词 EC-TIE", "mode": "save"},
        )
    latest = api.post(
        "/api/diaries",
        json={
            "kind": "diary",
            "text": "回归排序关键词 EC-TIE",
            "mode": "respond",
            "response_requested": True,
            "response_text": "最新记录里的陪伴回应。",
        },
    ).json()
    api.patch("/api/settings", json={"memory_enabled": True})
    result = api.post(
        "/api/companion/respond",
        json={"text": "你还记得回归排序关键词 EC-TIE 吗？"},
    ).json()
    assert any(item["id"] == latest["id"] and item.get("response_text") for item in result["memories"])


def test_mood_calendar_groups_confirmed_diaries_by_day(api):
    first = api.post(
        "/api/diaries",
        json={"text": "十月的一天很开心", "emotion_label": "开心", "recorded_at": "2026-10-04T10:00:00"},
    ).json()
    second = api.post(
        "/api/diaries",
        json={"text": "十月的一天有点焦虑", "emotion_label": "焦虑", "recorded_at": "2026-10-04T18:00:00"},
    ).json()
    api.post(
        "/api/diaries",
        json={"text": "十一月不应出现在十月", "emotion_label": "平静", "recorded_at": "2026-11-01T09:00:00"},
    )
    result = api.get("/api/calendar?year=2026&month=10")
    assert result.status_code == 200
    day = next(item for item in result.json()["days"] if item["date"] == "2026-10-04")
    assert day["emotions"] == ["开心", "焦虑"]
    assert {item["id"] for item in day["diaries"]} == {first["id"], second["id"]}
    assert all(item["date"].startswith("2026-10") for item in result.json()["days"])


def test_saving_can_be_disabled_without_disabling_diary_review(api):
    diary = api.post("/api/diaries", json={"text": "要保留在日记里的记录"}).json()
    result = api.patch("/api/settings", json={"save_enabled": False})
    assert result.status_code == 200
    assert result.json()["save_enabled"] is False
    assert api.get("/api/diaries").json()["items"][0]["id"] == diary["id"]
    blocked = api.post("/api/diaries", json={"text": "这次不要保存"})
    assert blocked.status_code == 409


def test_emotion_metrics_count_only_user_confirmed_labels(api):
    confirmed = api.post(
        "/api/diaries",
        json={"text": "一条已确认的心情", "emotion_label": "疲惫", "recorded_at": "2026-10-30T12:00:00"},
    ).json()
    unconfirmed = api.post(
        "/api/diaries",
        json={"text": "一条尚未确认的心情", "recorded_at": "2026-10-30T13:00:00"},
    ).json()
    metrics = api.get("/api/metrics/emotions?days=7").json()
    assert metrics["total_confirmed"] == 1
    assert metrics["counts"] == {"疲惫": 1}
    assert metrics["timeline"][0]["diary_id"] == confirmed["id"]
    assert all(row["diary_id"] != unconfirmed["id"] for row in metrics["timeline"])


def test_rejecting_one_recommendation_does_not_create_a_long_term_profile(api):
    recommendation = api.post("/api/recommendations", json={"query": "想轻松一点"}).json()["items"][0]
    rejected = api.post(
        "/api/feedback",
        json={"recommendation_id": recommendation["id"], "action": "reject"},
    )
    assert rejected.status_code == 200
    assert api.get("/api/profile").json()["items"] == []


def test_onboarding_preferences_persist_without_collapsing_privacy_settings(api):
    saved = api.patch(
        "/api/settings",
        json={
            "nickname": "小雪",
            "response_preference": "listen_first",
            "pet_id": "bear",
            "onboarding_complete": True,
            "memory_enabled": False,
        },
    )
    assert saved.status_code == 200
    assert saved.json()["nickname"] == "小雪"
    assert saved.json()["response_preference"] == "listen_first"
    assert saved.json()["pet_id"] == "bear"
    assert saved.json()["onboarding_complete"] is True
    assert saved.json()["memory_enabled"] is False

    updated = api.patch("/api/settings", json={"memory_enabled": True})
    assert updated.json()["nickname"] == "小雪"
    assert updated.json()["pet_id"] == "bear"


def test_chat_only_quotes_real_diaries_when_memory_is_enabled(api):
    diary = api.post(
        "/api/diaries",
        json={"text": "我上周去看了摄影展，觉得很放松。", "recorded_at": "2026-10-25T18:00:00"},
    ).json()
    question = "你还记得我之前说过什么摄影展吗？"

    api.patch("/api/settings", json={"memory_enabled": False})
    disabled = api.post("/api/companion/respond", json={"text": question}).json()
    assert disabled["memories"] == []
    assert disabled["memory_enabled"] is False

    api.patch("/api/settings", json={"memory_enabled": True})
    found = api.post("/api/companion/respond", json={"text": question}).json()
    assert found["memories"][0]["id"] == diary["id"]
    assert found["memories"][0]["recorded_at"].startswith("2026-10-25")

    missing = api.post(
        "/api/companion/respond",
        json={"text": "你还记得我之前说过火星餐厅吗？"},
    ).json()
    assert missing["memories"] == []
    assert "没有找到" in missing["reply"]


def test_advice_feedback_is_saved_without_infering_long_term_preferences(api):
    feedback = api.post(
        "/api/feedback",
        json={"recommendation_id": "grounding-pause", "action": "reject", "experience": "这次不想尝试"},
    )
    assert feedback.status_code == 200
    assert feedback.json()["experience"] == "这次不想尝试"
    assert api.get("/api/profile").json()["items"] == []


def test_high_risk_language_uses_safety_response_before_any_advice(api):
    result = api.post(
        "/api/companion/respond",
        json={"text": "我不想活了，准备伤害自己", "want_advice": True},
    )
    assert result.status_code == 200
    assert result.json()["safety"] is True
    assert result.json()["suggestion"] is None
    assert "可信任的人" in result.json()["reply"]
    assert "120" not in result.json()["reply"]


def test_companion_uses_configured_llm_for_natural_reply_and_marks_source(api, monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_BASE_URL", "https://llm.example.test")
    monkeypatch.setenv("LLM_MODEL", "deepseek-flash")

    import app.llm as llm

    captured = {}

    def fake_post(url, headers, payload, timeout):
        captured["url"] = url
        captured["payload"] = payload
        captured["headers"] = headers
        return {"choices": [{"message": {"content": "我听见你今天真的被很多事情推着走。我们先不用急着解决，愿意的话可以告诉我最难受的那一刻。"}}]}

    monkeypatch.setattr(llm, "post_json", fake_post)
    result = api.post(
        "/api/companion/respond",
        json={"text": "最近好多事压在一起，我有点慌。", "response_preference": "listen_first"},
    )
    assert result.status_code == 200
    body = result.json()
    assert body["llm_used"] is True
    assert "被很多事情推着走" in body["reply"]
    assert captured["url"] == "https://llm.example.test/chat/completions"
    assert captured["payload"]["model"] == "deepseek-flash"
    assert captured["payload"]["messages"][0]["role"] == "system"
    assert captured["headers"]["Authorization"] == "Bearer test-key"


def test_companion_passes_recent_ephemeral_turns_to_llm_without_persisting_them(api, monkeypatch):
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    import app.llm as llm

    captured = {}

    def fake_post(url, headers, payload, timeout):
        captured["messages"] = payload["messages"]
        return {"choices": [{"message": {"content": "我记得你刚才提到那件事，我们可以接着说。"}}]}

    monkeypatch.setattr(llm, "post_json", fake_post)
    result = api.post(
        "/api/companion/respond",
        json={
            "text": "那我继续说说刚才的感觉。",
            "conversation": [
                {"role": "user", "content": "我今天被很多事情压着。"},
                {"role": "assistant", "content": "听起来你承受了不少。"},
            ],
        },
    )
    assert result.status_code == 200
    assert result.json()["llm_used"] is True
    assert {message["content"] for message in captured["messages"]} >= {
        "我今天被很多事情压着。",
        "听起来你承受了不少。",
        "那我继续说说刚才的感觉。",
    }
    assert api.get("/api/diaries").json()["items"] == []


def test_companion_falls_back_to_local_reply_when_llm_is_unconfigured(api, monkeypatch):
    monkeypatch.delenv("LLM_ENABLED", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    result = api.post(
        "/api/companion/respond",
        json={"text": "最近好多事压在一起，我有点慌。"},
    )
    assert result.status_code == 200
    assert result.json()["llm_used"] is False
    assert "事情一下子挤过来" in result.json()["reply"]

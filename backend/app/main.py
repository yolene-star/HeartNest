from __future__ import annotations

from datetime import datetime, date
from pathlib import Path
from typing import Any
from typing import Literal
import asyncio
import json
import os
import sqlite3
import re
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict

app = FastAPI(title="个性化情绪陪伴工具 API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DIARIES: list[dict[str, Any]] = []
PROFILES: list[dict[str, Any]] = []
FEEDBACK: list[dict[str, Any]] = []
SETTINGS = {"memory_enabled": True}
DB_PATH = Path(os.environ.get('COMPANION_DB', str(Path(__file__).resolve().parents[2] / 'data/runtime/companion.sqlite3')))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(DB_PATH) as db:
    db.execute('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)')
    stored = db.execute('SELECT payload FROM state WHERE id=1').fetchone()
    if stored:
        state = json.loads(stored[0])
        DIARIES[:] = state['diaries']
        PROFILES[:] = state['profiles']
        FEEDBACK[:] = state['feedback']
        SETTINGS.update(state['settings'])
state_lock = asyncio.Lock()

@app.middleware('http')
async def persist_state(request, call_next):
    # One worker serializes read/modify/write. SQLite commits snapshots atomically.
    async with state_lock:
        response = await call_next(request)
        if request.method in {'POST', 'PATCH', 'DELETE'} and response.status_code < 400:
            payload = json.dumps({'diaries': DIARIES, 'profiles': PROFILES, 'feedback': FEEDBACK, 'settings': SETTINGS}, ensure_ascii=False)
            with sqlite3.connect(DB_PATH) as db:
                db.execute('INSERT OR REPLACE INTO state(id,payload) VALUES(1,?)', (payload,))
        return response
ACTIVITIES = [
    {"id":"a1","name":"校园散步与拍照","type":"户外","time":"周末","cost":0,"description":"在校园或附近公园慢走，记录三张喜欢的照片"},
    {"id":"a2","name":"甜品店探店","type":"美食","time":"周末","cost":60,"description":"选择一家安静的甜品店，安排一小时放松时间"},
    {"id":"a3","name":"看一部轻松电影","type":"室内","time":"今晚","cost":40,"description":"选择喜剧或治愈类影片，给自己留出不被打扰的时间"},
    {"id":"a4","name":"图书馆主题阅读","type":"室内","time":"下午","cost":0,"description":"挑一本感兴趣的书，进行30分钟轻量阅读"},
]

class DiaryIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    kind: Literal['diary','chat'] = 'diary'
    text: str = Field(min_length=1)
    mode: Literal['save','respond'] = 'save'
    allow_retrieval: bool = True
    emotion_label: Literal['积极','平稳','低落','焦虑'] | None = None
    recorded_at: str | None = None

class ProfileIn(BaseModel):
    content: str = Field(min_length=1)
    type: str = Field(default="想尝试")
    status: str = Field(default="active")
    source_id: str | None = None
    confirmed: bool = False

class ProfilePatch(BaseModel):
    content: str | None = None
    type: str | None = None
    status: str | None = None
    confirmed: bool | None = None

class SearchIn(BaseModel):
    query: str = ""
    top_k: int = 5

class RecommendationIn(BaseModel):
    query: str = ""
    budget: float | None = Field(default=None, ge=0)
    time: str | None = None

class FeedbackIn(BaseModel):
    recommendation_id: str
    action: Literal['accept','reject','modify','experienced']
    experience: str = ""

class SettingsIn(BaseModel):
    memory_enabled: bool

class EmotionPatch(BaseModel):
    label: Literal['积极','平稳','低落','焦虑'] | None = None
    status: Literal['confirmed','skipped'] = 'confirmed'


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def classify_emotion(text: str) -> dict[str, Any]:
    positive = ["开心", "喜欢", "期待", "轻松", "顺利", "快乐", "满足"]
    anxious = ["焦虑", "担心", "紧张", "害怕", "压力", "不安"]
    low = ["累", "难过", "低落", "孤独", "无聊", "失望", "疲惫"]
    scores = {"积极": sum(text.count(w) for w in positive), "焦虑": sum(text.count(w) for w in anxious), "低落": sum(text.count(w) for w in low), "平稳": 0}
    if max(scores.values()) == 0:
        label = "平稳"
    else:
        label = max(scores, key=scores.get)
    confidence = round(min(0.95, 0.55 + 0.1 * scores[label]), 2) if label != "平稳" else 0.55
    return {"label": label, "confidence": confidence}


def tokenize(text: str) -> set[str]:
    return {x for x in re.findall(r"[\u4e00-\u9fff]|[A-Za-z0-9]+", text.lower()) if x.strip()}


def memory_search(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    if not SETTINGS["memory_enabled"]:
        return []
    q = tokenize(query)
    scored = []
    for item in DIARIES:
        if not item.get("allow_retrieval", True):
            continue
        tokens = tokenize(item["text"])
        score = len(q & tokens) / max(1, len(q)) if q else 0
        if score > 0:
            scored.append((score, item))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{**item, "score": round(score, 3)} for score, item in scored[:max(1, min(top_k, 20))]]


def profile_rejected_text() -> set[str]:
    return {p["content"] for p in PROFILES if p["status"] == "rejected" or p["type"] == "反感"}

@app.get("/api/health")
def health():
    return {"status": "ok", "diaries": len(DIARIES), "profiles": len(PROFILES)}

@app.post("/api/diaries")
def create_diary(payload: DiaryIn):
    emotion = {"label": payload.emotion_label, "confidence": 1.0} if payload.emotion_label else classify_emotion(payload.text)
    item = {"id": uuid.uuid4().hex[:10], "kind": payload.kind, "text": payload.text, "mode": payload.mode, "allow_retrieval": payload.allow_retrieval, "emotion": emotion, "emotion_confirmed": bool(payload.emotion_label), "recorded_at": payload.recorded_at or now_iso()}
    DIARIES.append(item)
    item['response'] = ('已经记下你的感受。你愿意说说今天最在意的一件事吗？' if payload.mode == 'respond' else None)
    return item

@app.get("/api/diaries")
def list_diaries(date: str | None = None):
    return {"items": [x for x in reversed(DIARIES) if not date or x['recorded_at'][:10] == date]}

@app.patch("/api/diaries/{diary_id}/emotion")
def update_diary_emotion(diary_id: str, payload: EmotionPatch):
    item = next((x for x in DIARIES if x["id"] == diary_id), None)
    if not item:
        raise HTTPException(404, "日记不存在")
    if payload.label:
        item['emotion'] = {'label': payload.label, 'confidence': 1.0}
    item['emotion_confirmed'] = payload.status == 'confirmed'
    item['emotion_status'] = payload.status
    return item

@app.delete("/api/diaries/{diary_id}")
def delete_diary(diary_id: str):
    before = len(DIARIES)
    DIARIES[:] = [x for x in DIARIES if x["id"] != diary_id]
    PROFILES[:] = [x for x in PROFILES if x.get('source_id') != diary_id]
    if len(DIARIES) == before:
        raise HTTPException(404, "日记不存在")
    return {"deleted": diary_id}

@app.post("/api/analyze/emotion")
def analyze_emotion(payload: dict[str, str]):
    return classify_emotion(payload.get("text", ""))

@app.post("/api/memories/search")
def search_memories(payload: SearchIn):
    return {"items": memory_search(payload.query, payload.top_k), "memory_enabled": SETTINGS["memory_enabled"]}

@app.get("/api/profile")
def list_profile():
    return {"items": list(reversed(PROFILES))}

@app.post("/api/profile")
def create_profile(payload: ProfileIn):
    item = {"id": uuid.uuid4().hex[:10], **payload.model_dump(), "created_at": now_iso(), "updated_at": now_iso()}
    PROFILES.append(item)
    return item

@app.patch("/api/profile/{profile_id}")
def update_profile(profile_id: str, payload: ProfilePatch):
    item = next((x for x in PROFILES if x["id"] == profile_id), None)
    if not item:
        raise HTTPException(404, "画像条目不存在")
    for key, value in payload.model_dump(exclude_none=True).items():
        item[key] = value
    item["updated_at"] = now_iso()
    return item

@app.delete("/api/profile/{profile_id}")
def delete_profile(profile_id: str):
    before = len(PROFILES)
    PROFILES[:] = [x for x in PROFILES if x["id"] != profile_id]
    if len(PROFILES) == before:
        raise HTTPException(404, "画像条目不存在")
    return {"deleted": profile_id}

@app.get("/api/settings")
def get_settings():
    return SETTINGS

@app.patch("/api/settings")
def update_settings(payload: SettingsIn):
    SETTINGS["memory_enabled"] = payload.memory_enabled
    return SETTINGS

@app.post("/api/recommendations")
def recommendations(payload: RecommendationIn):
    rejected = profile_rejected_text()
    words = tokenize(payload.query)
    candidates = []
    for activity in ACTIVITIES:
        if any(bad in activity['name'] or bad == activity['type'] for bad in rejected):
            continue
        if payload.budget is not None and activity["cost"] > payload.budget:
            continue
        score = len(words & tokenize(activity["name"] + activity["type"] + activity["description"]))
        if payload.time and payload.time in activity["time"]:
            score += 2
        candidates.append((score, activity))
    candidates.sort(key=lambda x: x[0], reverse=True)
    return {"items": [item for _, item in candidates[:3]], "explanation": "根据当前诉求、预算、时间和已记录偏好筛选"}

@app.post("/api/feedback")
def save_feedback(payload: FeedbackIn):
    activity = next((x for x in ACTIVITIES if x['id'] == payload.recommendation_id), None)
    if activity is None:
        raise HTTPException(404, '建议不存在')
    record = {"id": uuid.uuid4().hex[:10], **payload.model_dump(), "created_at": now_iso()}
    FEEDBACK.append(record)
    if payload.action == "reject":
        activity = next((x for x in ACTIVITIES if x["id"] == payload.recommendation_id), None)
        if activity:
            PROFILES.append({"id": uuid.uuid4().hex[:10], "content": activity["type"], "type": "反感", "status": "rejected", "source_id": None, "confirmed": True, "created_at": now_iso(), "updated_at": now_iso()})
    return record

@app.get("/api/metrics/emotions")
def emotion_metrics():
    counts: dict[str, int] = {}
    for item in DIARIES:
        label = item["emotion"]["label"]
        counts[label] = counts.get(label, 0) + 1
    return {"counts": counts, "timeline": [{"date": x["recorded_at"][:10], "label": x["emotion"]["label"]} for x in DIARIES]}

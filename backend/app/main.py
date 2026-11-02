from __future__ import annotations

from datetime import datetime, date
from calendar import monthrange
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
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .content import ADVICE_LIBRARY, build_companion_response
from .llm import request_llm_reply

app = FastAPI(title="个性化情绪陪伴工具 API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DIARIES: list[dict[str, Any]] = []
PROFILES: list[dict[str, Any]] = []
FEEDBACK: list[dict[str, Any]] = []
SETTINGS = {
    "memory_enabled": False,
    "save_enabled": True,
    "nickname": "",
    "response_preference": "adapt",
    "pet_id": "otter",
    "onboarding_complete": False,
}
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
ACTIVITIES_PATH = Path(__file__).resolve().parents[2] / "data" / "activities.json"
with ACTIVITIES_PATH.open(encoding="utf-8") as activities_file:
    ACTIVITIES = json.load(activities_file)

class DiaryIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    kind: Literal['diary','chat'] = 'diary'
    text: str = Field(min_length=1)
    mode: Literal['save','respond'] = 'save'
    allow_retrieval: bool = True
    response_requested: bool = False
    response_text: str | None = Field(default=None, max_length=6000)
    emotion_label: Literal['开心','平静','疲惫','低落','焦虑','生气','混合/说不清','其他','积极','平稳'] | None = None
    recorded_at: str | None = None

class DiaryPatch(BaseModel):
    text: str | None = Field(default=None, min_length=1)

class DiaryAddendumIn(BaseModel):
    text: str = Field(min_length=1)

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
    memory_enabled: bool | None = None
    save_enabled: bool | None = None
    nickname: str | None = Field(default=None, max_length=40)
    response_preference: Literal['listen_first','think_together','adapt'] | None = None
    pet_id: Literal['otter','bear','cloud','rabbit','lamp','cat','dog'] | None = None
    onboarding_complete: bool | None = None

class EmotionPatch(BaseModel):
    label: Literal['开心','平静','疲惫','低落','焦虑','生气','混合/说不清','其他','积极','平稳'] | None = None
    status: Literal['confirmed','skipped'] = 'confirmed'

class ConversationTurn(BaseModel):
    role: Literal['user','assistant']
    content: str = Field(min_length=1, max_length=2000)

class CompanionIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    want_advice: bool = False
    response_preference: Literal['listen_first','think_together','adapt'] = 'adapt'
    conversation: list[ConversationTurn] = Field(default_factory=list, max_length=6)


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def classify_emotion(text: str) -> dict[str, Any]:
    positive = ["开心", "喜欢", "期待", "轻松", "顺利", "快乐", "满足"]
    anxious = ["焦虑", "担心", "紧张", "害怕", "压力", "不安"]
    low = ["难过", "低落", "孤独", "无聊", "失望"]
    tired = ["累", "疲惫", "没力气"]
    angry = ["生气", "愤怒", "恼火"]
    scores = {
        "开心": sum(text.count(w) for w in positive),
        "焦虑": sum(text.count(w) for w in anxious),
        "低落": sum(text.count(w) for w in low),
        "疲惫": sum(text.count(w) for w in tired),
        "生气": sum(text.count(w) for w in angry),
        "平静": 0,
    }
    if max(scores.values()) == 0:
        label = "平稳"
    else:
        label = max(scores, key=scores.get)
    confidence = round(min(0.95, 0.55 + 0.1 * scores[label]), 2) if label != "平稳" else 0.55
    return {"label": label, "confidence": confidence}


def tokenize(text: str) -> set[str]:
    cleaned = text.lower()
    for phrase in ("你还记得", "还记得", "记得", "之前", "上次", "以前", "提过", "说过", "什么", "我", "你", "吗", "的"):
        cleaned = cleaned.replace(phrase, " ")
    tokens: set[str] = set()
    for part in re.findall(r"[\u4e00-\u9fff]+|[a-z0-9]+", cleaned):
        if re.fullmatch(r"[\u4e00-\u9fff]+", part):
            tokens.update(part[index:index + 2] for index in range(len(part) - 1))
        elif part:
            tokens.add(part)
    return tokens


def memory_search(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    if not SETTINGS["memory_enabled"]:
        return []
    candidates: list[dict[str, Any]] = []
    for item in DIARIES:
        if not item.get("allow_retrieval", True):
            continue
        searchable_text = item["text"]
        if item.get("response_text"):
            searchable_text += " " + item["response_text"]
        candidates.append({"item": item, "text": searchable_text})
    if not candidates or not query.strip():
        return []
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(1, 2))
    matrix = vectorizer.fit_transform([query, *[candidate["text"] for candidate in candidates]])
    scores = cosine_similarity(matrix[0:1], matrix[1:]).ravel()
    ranked = [(float(score), candidate["item"]) for score, candidate in zip(scores, candidates) if score > 0]
    ranked.sort(key=lambda pair: (pair[0], bool(pair[1].get("response_text")), pair[1].get("recorded_at", "")), reverse=True)
    return [{**item, "score": round(score, 3)} for score, item in ranked[:max(1, min(top_k, 20))]]


def profile_rejected_text() -> set[str]:
    return {p["content"] for p in PROFILES if p["status"] == "rejected" or p["type"] == "反感"}

@app.get("/api/health")
def health():
    return {"status": "ok", "diaries": len(DIARIES), "profiles": len(PROFILES)}

@app.post("/api/diaries")
def create_diary(payload: DiaryIn):
    if not SETTINGS["save_enabled"]:
        raise HTTPException(409, "记录保存已关闭")
    emotion = {"label": payload.emotion_label, "confidence": 1.0} if payload.emotion_label else classify_emotion(payload.text)
    status = "confirmed" if payload.emotion_label else "pending"
    item = {"id": uuid.uuid4().hex[:10], "kind": payload.kind, "text": payload.text, "mode": payload.mode, "allow_retrieval": payload.allow_retrieval, "response_requested": payload.response_requested, "response_text": payload.response_text, "response_created_at": now_iso() if payload.response_text else None, "emotion": emotion, "emotion_confirmed": bool(payload.emotion_label), "emotion_status": status, "addenda": [], "recorded_at": payload.recorded_at or now_iso(), "updated_at": None}
    DIARIES.append(item)
    item['response'] = None
    return item

@app.post("/api/companion/respond")
def companion_respond(payload: CompanionIn):
    text = payload.text.strip()
    asks_about_history = any(term in text for term in ("之前", "上次", "以前", "记得", "提过", "说过"))
    memories = memory_search(text, 3) if SETTINGS["memory_enabled"] and asks_about_history else []
    response = build_companion_response(text, payload.want_advice, memories, SETTINGS["memory_enabled"], payload.response_preference)
    response["llm_used"] = False
    if not response["safety"] and not payload.want_advice and not asks_about_history:
        llm_reply = request_llm_reply(text, payload.response_preference, response.get("emotion_suggestion", {}).get("label"), [turn.model_dump() for turn in payload.conversation])
        if llm_reply:
            response["reply"] = llm_reply
            response["llm_used"] = True
    return response

@app.get("/api/diaries")
def list_diaries(date: str | None = None):
    return {"items": [x for x in reversed(DIARIES) if not date or x['recorded_at'][:10] == date]}

@app.patch("/api/diaries/{diary_id}")
def update_diary(diary_id: str, payload: DiaryPatch):
    item = next((x for x in DIARIES if x["id"] == diary_id), None)
    if not item:
        raise HTTPException(404, "日记不存在")
    for key, value in payload.model_dump(exclude_none=True).items():
        item[key] = value
    item["updated_at"] = now_iso()
    return item

@app.post("/api/diaries/{diary_id}/addenda")
def add_diary_note(diary_id: str, payload: DiaryAddendumIn):
    item = next((x for x in DIARIES if x["id"] == diary_id), None)
    if not item:
        raise HTTPException(404, "日记不存在")
    note = {"id": uuid.uuid4().hex[:10], "text": payload.text.strip(), "recorded_at": now_iso()}
    item.setdefault("addenda", []).append(note)
    item["updated_at"] = note["recorded_at"]
    return item

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
    if SETTINGS.get("pet_id") == "cloud":
        SETTINGS["pet_id"] = "rabbit"
    return SETTINGS

@app.patch("/api/settings")
def update_settings(payload: SettingsIn):
    changes = payload.model_dump(exclude_none=True)
    if changes.get("pet_id") == "cloud":
        changes["pet_id"] = "rabbit"
    for key, value in changes.items():
        SETTINGS[key] = value
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
    if activity is None and payload.recommendation_id not in ADVICE_LIBRARY:
        raise HTTPException(404, '建议不存在')
    record = {"id": uuid.uuid4().hex[:10], **payload.model_dump(), "created_at": now_iso()}
    FEEDBACK.append(record)
    return record

@app.get("/api/metrics/emotions")
def emotion_metrics(days: int = 7):
    days = max(1, min(days, 90))
    cutoff = date.today().fromordinal(date.today().toordinal() - days + 1).isoformat()
    counts: dict[str, int] = {}
    for item in DIARIES:
        if not item.get("emotion_confirmed") or item["recorded_at"][:10] < cutoff:
            continue
        label = item["emotion"]["label"]
        counts[label] = counts.get(label, 0) + 1
    timeline = [
        {"diary_id": item["id"], "date": item["recorded_at"][:10], "label": item["emotion"]["label"]}
        for item in DIARIES
        if item.get("emotion_confirmed") and item["recorded_at"][:10] >= cutoff
    ]
    timeline.sort(key=lambda row: row["date"])
    return {"days": days, "total_confirmed": sum(counts.values()), "counts": counts, "timeline": timeline}

@app.get("/api/calendar")
def mood_calendar(year: int, month: int):
    if year < 2000 or year > 2100 or month < 1 or month > 12:
        raise HTTPException(422, "年月不合法")
    prefix = f"{year:04d}-{month:02d}-"
    grouped: dict[str, dict[str, Any]] = {}
    for item in DIARIES:
        recorded = item.get("recorded_at", "")
        if not recorded.startswith(prefix) or not item.get("emotion_confirmed"):
            continue
        day = recorded[:10]
        entry = grouped.setdefault(day, {"date": day, "emotions": [], "diaries": []})
        label = item.get("emotion", {}).get("label")
        if label and label not in entry["emotions"]:
            entry["emotions"].append(label)
        entry["diaries"].append(item)
    for entry in grouped.values():
        entry["diaries"].sort(key=lambda item: item.get("recorded_at", ""))
    first_weekday = date(year, month, 1).weekday()
    return {
        "year": year,
        "month": month,
        "days_in_month": monthrange(year, month)[1],
        "first_weekday": first_weekday,
        "days": [grouped[key] for key in sorted(grouped)],
    }

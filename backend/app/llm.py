"""Optional OpenAI-compatible LLM adapter with a safe local fallback."""

from __future__ import annotations

import os
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _enabled() -> bool:
    return os.getenv("LLM_ENABLED", "false").lower() in {"1", "true", "yes", "on"}


def post_json(url: str, headers: dict[str, str], payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    request = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def request_llm_reply(text: str, response_preference: str, emotion_label: str | None = None, conversation: list[dict[str, str]] | None = None) -> str | None:
    api_key = os.getenv("LLM_API_KEY", "").strip()
    if not _enabled() or not api_key:
        return None

    base_url = os.getenv("LLM_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.getenv("LLM_MODEL", "deepseek-flash")
    timeout = float(os.getenv("LLM_TIMEOUT", "18"))
    preference = {
        "listen_first": "先听我说，先承接和陪伴，不急着分析或给方案。",
        "think_together": "和我一起想办法，但先确认我的感受，再只提出一个小问题或一步。",
        "adapt": "根据当前语气决定先倾听还是一起梳理，不要机械套话。",
    }.get(response_preference, "根据当前语气自然回应。")
    emotion = emotion_label or "未确认"
    system = (
        "你是心栖，一个温和、自然的情绪陪伴 Agent。"
        "你的任务是回应当下表达，不做心理诊断，不夸大确定性，不假装记得没有提供的经历。"
        "除非用户明确请求，否则不要主动给行动建议；不要使用编号清单或说教口吻。"
        "回复使用简体中文，控制在 2 到 4 句，先回应感受，再留一个自然的继续空间。"
        f"当前回应偏好：{preference} 当前系统初步情绪标签（未必准确）：{emotion}。"
    )
    history = [
        {"role": turn["role"], "content": turn["content"]}
        for turn in (conversation or [])[-6:]
        if turn.get("role") in {"user", "assistant"} and turn.get("content", "").strip()
    ]
    payload: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": system}, *history, {"role": "user", "content": text}],
        "temperature": 0.7,
        "max_tokens": 240,
        "stream": False,
    }
    try:
        data = post_json(
            f"{base_url}/chat/completions",
            {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            payload,
            timeout,
        )
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        content = content.strip() if isinstance(content, str) else ""
        return content or None
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, IndexError, TypeError):
        return None

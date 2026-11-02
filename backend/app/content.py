"""Reviewed, source-linked interaction guidance for the offline prototype."""

ADVICE_LIBRARY = {
    "grounding-pause": {
        "id": "grounding-pause",
        "title": "暂时回到当下",
        "method": "Grounding",
        "step": "如果你愿意，可以先感受一下脚踩着地面的感觉，再看看周围有什么。我们不用马上解决所有事情。",
        "source": {
            "title": "Doing What Matters in Times of Stress",
            "publisher": "World Health Organization",
            "year": 2020,
            "url": "https://www.who.int/publications/i/item/9789240003927",
        },
        "limitation": "这是通用的自助压力应对练习，不保证适合每个人，也不是诊断或治疗方法；如果让你不舒服，可以马上停下。",
        "review_status": "reviewed",
    }
}

COMMUNICATION_SOURCE = {
    "title": "TIP 35: Enhancing Motivation for Change in Substance Use Disorder Treatment",
    "publisher": "Substance Abuse and Mental Health Services Administration",
    "url": "https://library.samhsa.gov/sites/default/files/tip-35-pep19-02-01-003.pdf",
}

# Adaptations of chapters "Unhooking" and "Acting on your values" of the
# same WHO self-help guide; source support is not an efficacy claim for this app.
for advice in [
    {'id': 'name-the-feeling', 'title': '给感受起个名字', 'method': 'Unhooking',
     'step': '如果愿意，试着在心里说一句：“我注意到自己正在感到……”。找不到准确的词也没关系，先让这种感受待一会儿。'},
    {'id': 'one-small-step', 'title': '只选一件在意的小事', 'method': 'Acting on your values',
     'step': '想一件你在意的事，选一个此刻做得到的小动作，比如给信任的人发一句问候。也可以先写下来，等有力气再做。'},
    {'id': 'kind-to-yourself', 'title': '对自己温柔一点', 'method': 'Being kind',
     'step': '如果是朋友正经历这些，你会对他说什么？愿意的话，也把那句温柔的话留给自己；不用勉强自己立刻好起来。'},
]:
    ADVICE_LIBRARY[advice['id']] = {**ADVICE_LIBRARY['grounding-pause'], **advice, 'review_status': 'source-linked-adaptation'}


def is_safety_signal(text: str) -> bool:
    direct_signals = ("想自杀", "想伤害自己", "准备伤害自己", "马上伤害自己", "想杀了", "准备伤害别人")
    indirect_signals = ("不想活了", "活不下去", "消失算了")
    return any(signal in text for signal in direct_signals + indirect_signals)


def is_history_request(text: str) -> bool:
    """Conservative offline fallback: historical narration alone is not a request."""
    import re
    return bool(re.search(
        r'你(?:还)?记得|(?:帮我|请你|能不能|可以).{0,6}(?:找|查|回忆)|'
        r'(?:查找|检索|回顾|翻翻|找找).{0,12}(?:日记|记录|以前|之前|上次)|'
        r'(?:我之前|我上次).{0,16}(?:说过什么|提过什么|喜欢什么)', text
    ))


def build_companion_response(text: str, want_advice: bool, memories: list[dict] | None = None, memory_enabled: bool = False, response_preference: str = "adapt", *, asks_about_history: bool | None = None, emotion: dict | None = None, exclude_advice_ids: list[str] | None = None) -> dict:
    from .main import classify_emotion

    memories = memories or []
    if asks_about_history is None:
        asks_about_history = is_history_request(text)
    if is_safety_signal(text):
        return {
            "reply": "谢谢你告诉我这些。我有点担心你现在的安全。你此刻有马上伤害自己的打算，或者已经做了什么吗？如果有眼前危险，请尽快联系身边可信任的人陪着你，并联系所在地的紧急服务。",
            "emotion_suggestion": None,
            "suggestion": None,
            "safety": True,
            "memories": [],
            "memory_enabled": memory_enabled,
        }

    if asks_about_history and not memory_enabled:
        return {
            "reply": "你现在关闭了记忆调用，所以我不会在聊天中查找旧日记。你可以直接去日记里回看。",
            "emotion_suggestion": None,
            "suggestion": None,
            "safety": False,
            "memories": [],
            "memory_enabled": False,
        }
    if asks_about_history and not memories:
        return {
            "reply": "我没有找到相关的旧日记，不想替你猜。你也可以给我一点关键词，我再帮你找找。",
            "emotion_suggestion": None,
            "suggestion": None,
            "safety": False,
            "memories": [],
            "memory_enabled": True,
        }
    if asks_about_history:
        return {
            "reply": "我找到了一些你保存过的相关记录，下面会标出原文和日期。",
            "emotion_suggestion": None,
            "suggestion": None,
            "safety": False,
            "memories": memories,
            "memory_enabled": True,
        }

    no_advice_requested = any(phrase in text for phrase in ("只想说", "只想吐槽", "不用建议", "别给建议", "不想要办法"))
    if no_advice_requested:
        reply = "好，那我们先不想办法。听起来这件事确实让你很不好受。你可以慢慢说，我听着。"
        suggestion = None
    elif want_advice:
        available = [item for key, item in ADVICE_LIBRARY.items() if key not in (exclude_advice_ids or [])]
        suggestion = available[0] if available else None
        reply = suggestion['step'] if suggestion else '这几个小办法都看过了，我们可以先停一停，或者聊聊你更需要什么。'
    else:
        suggestion = None
        if any(term in text for term in ("事情堆", "好多事", "压力", "有点慌", "喘不过气")):
            if response_preference == "listen_first":
                reply = "听起来一下子有很多事压在一起，确实会让人觉得慌。你可以慢慢说，我先陪你把这份慌乱放在这里。"
            elif response_preference == "think_together":
                reply = "事情一下子挤过来，确实容易让人觉得慌。我们可以一起挑一件最需要先处理的，你觉得哪一件最占心思？"
            else:
                reply = "事情一下子挤过来，确实容易让人觉得慌。现在最占你心思的是哪一件？"
        elif any(term in text for term in ("累", "疲惫", "没力气")):
            reply = "听起来你今天消耗不少。你愿意说说，是哪件事最让你觉得累吗？"
        else:
            reply = "我听见你在说这件事。你现在最希望我先理解哪一部分？"

    emotion = emotion or classify_emotion(text)
    return {
        "reply": reply,
        "emotion_suggestion": None if want_advice else {"label": emotion["label"], "status": "unconfirmed"},
        "suggestion": suggestion,
        "safety": False,
        "memories": [],
        "memory_enabled": memory_enabled,
        "communication_source": COMMUNICATION_SOURCE,
    }

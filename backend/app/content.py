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


def is_safety_signal(text: str) -> bool:
    direct_signals = ("想自杀", "想伤害自己", "准备伤害自己", "马上伤害自己", "想杀了", "准备伤害别人")
    indirect_signals = ("不想活了", "活不下去", "消失算了")
    return any(signal in text for signal in direct_signals + indirect_signals)


def build_companion_response(text: str, want_advice: bool, memories: list[dict] | None = None, memory_enabled: bool = False, response_preference: str = "adapt") -> dict:
    from .main import classify_emotion

    memories = memories or []
    asks_about_history = any(term in text for term in ("之前", "上次", "以前", "记得", "提过", "说过"))
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
        suggestion = ADVICE_LIBRARY["grounding-pause"]
        reply = suggestion["step"]
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

    emotion = classify_emotion(text)
    return {
        "reply": reply,
        "emotion_suggestion": None if want_advice else {"label": emotion["label"], "status": "unconfirmed"},
        "suggestion": suggestion,
        "safety": False,
        "memories": [],
        "memory_enabled": memory_enabled,
        "communication_source": COMMUNICATION_SOURCE,
    }

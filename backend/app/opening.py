"""Private-by-default opening, based on user-confirmed mood rather than guesses."""
from datetime import date, timedelta


GENERIC_OPENING = '今天想从哪件小事聊起，或者让我安静陪你一会儿？'
MOOD_OPENINGS = {
    '开心': '你最近记下了一些开心的时刻，今天有没有什么小事想和我分享？',
    '平静': '你最近留下的心情记录里有一些平静的时刻，今天想从哪件小事聊起？',
    '疲惫': '你最近记下过有些累的时刻，今天想聊聊近况，还是让我安静陪你一会儿？',
    '低落': '你最近记录过一些低落的时刻，今天想说什么，我都在这里听。',
    '焦虑': '你最近记下过紧张的感受，今天想聊聊近况，还是先随意说点别的？',
    '生气': '你最近记录过生气的时刻，今天想从哪里说起，我听着。',
    '混合/说不清': '你最近留下了一些说不清的感受，今天不用急着找准词，想说什么都可以。',
    '其他': '你最近留下了一些说不清的感受，今天不用急着找准词，想说什么都可以。',
}
MIXED_OPENING = '你最近的心情记录里有不止一种感受，今天想从哪一部分聊起？'


def build_opening(diaries, settings, today):
    prefix = f"{settings['nickname']}，" if settings.get('nickname') else ''
    generic = {'text': prefix + GENERIC_OPENING, 'personalized': False, 'basis': [], 'source': 'generic'}
    if not settings.get('memory_enabled'):
        return generic
    cutoff = today - timedelta(days=6)
    candidates = []
    for index, diary in enumerate(diaries):
        if not diary.get('allow_retrieval') or not diary.get('emotion_confirmed') or diary.get('emotion_status') == 'skipped':
            continue
        try:
            recorded_day = date.fromisoformat(diary.get('recorded_at', '')[:10])
        except (ValueError, TypeError):
            continue
        label = diary.get('emotion', {}).get('label')
        if not cutoff <= recorded_day <= today or label not in {*MOOD_OPENINGS, '积极', '平稳'}:
            continue
        candidates.append((diary.get('recorded_at', ''), index, diary))
    if not candidates:
        return generic
    candidates.sort(key=lambda value: value[:2], reverse=True)
    latest_day = candidates[0][0][:10]
    recent = [item for recorded, _, item in candidates if recorded[:10] == latest_day][:3]
    labels = { {'积极': '开心', '平稳': '平静'}.get(item['emotion']['label'], item['emotion']['label']) for item in recent }
    line = MIXED_OPENING if len(labels) > 1 else MOOD_OPENINGS[next(iter(labels))]
    return {
        'text': prefix + line, 'personalized': True, 'source': 'confirmed_mood_rules',
        'basis': [{'diary_id': item['id'], 'date': item['recorded_at'][:10], 'label': item['emotion']['label']} for item in recent],
    }

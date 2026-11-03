"""Controlled actions and traceable evidence; no generated citations or diagnoses."""
from copy import deepcopy
import re

SOURCES = {
    'nature-walk-2015': {
        'id': 'nature-walk-2015', 'title': 'Nature experience reduces rumination and subgenual prefrontal cortex activation',
        'publisher': 'Bratman et al. · PNAS', 'year': 2015,
        'url': 'https://pubmed.ncbi.nlm.nih.gov/26124129/', 'doi': '10.1073/pnas.1510459112',
        'kind': '实验研究', 'checked_at': '2026-11-03', 'review_scope': '出版信息及摘要核对；非专家临床审核',
    },
    'who-stress-2020': {
        'id': 'who-stress-2020', 'title': 'Doing What Matters in Times of Stress',
        'publisher': 'World Health Organization', 'year': 2020,
        'url': 'https://www.who.int/publications/i/item/9789240003927',
        'kind': '机构自助指南', 'checked_at': '2026-11-03',
        'review_scope': '官方资料核对；非专家临床审核',
    },
    'music-review-2020': {
        'id': 'music-review-2020',
        'title': 'Effects of music interventions on stress-related outcomes: a systematic review and two meta-analyses',
        'publisher': 'de Witte et al. · Health Psychology Review', 'year': 2020,
        'url': 'https://pubmed.ncbi.nlm.nih.gov/31167611/',
        'doi': '10.1080/17437199.2019.1627897', 'kind': '系统综述与元分析',
        'checked_at': '2026-11-03', 'review_scope': '出版信息及摘要核对；非专家临床审核',
    },
}

TOPICS = {
    'music': ('音乐', '听歌', '爵士', '轻音乐'),
    'drawing': ('画画', '绘画', '涂鸦'),
    'reading': ('阅读', '读书', '看书'),
    'outdoor': ('散步', '户外', '出门', '公园'),
    'dessert': ('甜品', '美食'),
    'movie': ('电影', '影片'),
}


def clauses(text):
    return [part.strip() for part in re.split(r'[，。！？；\n]|但是|不过|但', text) if part.strip()]


def risk_context(text):
    """Conservative signals, not a classifier of addiction or personal character."""
    for part in clauses(text):
        if re.search(r'^(?:朋友|同学|他|她|别人)|(?:以前|曾经|过去|不喝酒|不抽烟|不赌博|戒酒|戒烟|戒赌)', part):
            continue
        if re.search(r'喝酒|饮酒|抽烟|吸烟|赌博|赌钱|翻本|擅自加药|多吃.*(?:药|安眠)', part):
            return 'restricted'
    if re.search(r'停不下来|失控|影响(?:睡眠|睡觉|学习|工作)|正在戒|想戒|想改掉|想减少', text):
        return 'needs_context'
    return 'ordinary'


def topic_status(text, topic, *, saved=False):
    terms = '|'.join(map(re.escape, TOPICS[topic]))
    status = None
    for part in clauses(text):
        if not re.search(terms, part):
            continue
        if re.search(r'朋友|同学|别人|他说|她说|以前|曾经|过去|假如|如果我喜欢|^(?:他|她|它|他们|她们)', part):
            continue
        if re.search(r'不喜欢|不想|不爱|讨厌|别推荐|不要推荐|更难受|不舒服|不适合|想减少|想改掉|不(?:再|太)?(?:听|看|吃|读|画)|戒掉', part):
            status = 'avoid'
        elif re.search(r'我(?:很|也|一直|比较|挺|特别|最)?(?:喜欢|爱|想听|想画|想读)', part) or saved:
            status = 'like'
    return status


def choose_advice(library, text, *, profiles=(), memory_enabled=False, conversation=(), excluded=()):
    context = [turn['content'] for turn in conversation if turn.get('role') == 'user'] + [text]
    # Risks reported within this temporary conversation still constrain preferences.
    levels = {'ordinary': 0, 'needs_context': 1, 'restricted': 2}
    risk = max((risk_context(message) for message in context), key=levels.get)
    # Latest explicit statement of each topic overrides earlier chat/history.
    preferences, avoided = {}, set()
    if memory_enabled:
        for profile in profiles:
            if not profile.get('confirmed'):
                continue
            for topic in TOPICS:
                status = topic_status(profile['content'], topic, saved=True)
                if status == 'avoid' or (any(t in profile['content'] for t in TOPICS[topic]) and (profile.get('status') == 'rejected' or profile.get('type') == '反感')):
                    avoided.add(topic)
                elif status == 'like' and profile.get('status') == 'active' and profile.get('type') in {'喜欢', '想尝试'} and risk_context(profile['content']) == 'ordinary':
                    preferences[topic] = {'id': profile['id'], 'content': profile['content'], 'evidence': profile['content'], 'origin': 'confirmed_profile'}
    for message in context:
        for topic in TOPICS:
            status = topic_status(message, topic)
            if status == 'avoid':
                avoided.add(topic)
                preferences.pop(topic, None)
            elif status == 'like':
                avoided.discard(topic)
                preferences[topic] = {'content': next(t for t in TOPICS[topic] if t in message), 'evidence': message,
                                      'origin': 'current_message' if message == text else 'current_conversation'}
    excluded = set(excluded)
    if memory_enabled:
        excluded.update(p.get('advice_id') for p in profiles if p.get('confirmed') and p.get('status') == 'rejected')
    candidates = []
    for position, entry in enumerate(library.values()):
        if entry['id'] in excluded:
            continue
        topic = entry.get('topic')
        if topic in avoided:
            continue
        preference = preferences.get(topic) if risk == 'ordinary' else None
        if entry.get('requires_preference') and not preference:
            continue
        source_id = entry.get('source_id')
        source = SOURCES.get(source_id) if source_id else None
        # An invalid declared source must never silently turn into preference evidence.
        if source_id and not source:
            continue
        if not source and not preference:
            continue
        item = deepcopy(entry)
        item['source'] = deepcopy(source)
        item['basis'] = {'type': 'both' if source and preference else 'literature' if source else 'preference',
                         'sources': [deepcopy(source)] if source else [],
                         'preferences': [preference] if preference else []}
        item['reason'] = '结合你明确表达的喜好，提供一个可以随时停止的小选择。' if preference else '根据已核对的压力应对指南改编，是否尝试由你决定。'
        item['review_status'] = 'source-checked-adaptation' if source else 'explicit-preference'
        candidates.append((1 if preference else 0, -position, item))
    return (max(candidates, key=lambda value: value[:2])[2] if candidates else None), {'risk': risk, 'version': '2026-11-03-v1'}


def advice_declined(text):
    return bool(re.search(r'不用建议|不需要建议|不要建议|别给建议|不想要办法|只想(?:说|吐槽|聊)|只要陪|不想做练习', text))


def discomfort(text):
    return bool(re.search(r'(?:这个|刚才|练习|办法|试了|做了|做完|听音乐|听歌|画画|看书|阅读).*(?:不舒服|难受|头晕|心慌|更慌)|(?:更不舒服|更难受).*了', text))


def requests_advice(text):
    return bool(re.search(
        r'(?:给我|推荐|有什么|怎么|如何|帮我|能不能).{0,14}(?:放松|小办法|小建议|缓解|解压)|'
        r'(?:放松|解压).{0,8}(?:建议|办法|做什么)|'
        r'(?:教我|推荐|给我|试个|试试|想试|想找|找个).{0,14}(?:练习|活动|办法|建议)|'
        r'(?:该|能|可以)做什么.{0,12}(?:紧张|焦虑|放松|轻松|压力)|'
        r'有什么办法.{0,12}(?:轻松|平静|安心|睡|紧张|焦虑)', text))


def activity_candidates(activities, query, *, profiles=(), memory_enabled=False):
    """The catalog is simulated; source support never verifies a shop or its effect."""
    topics = {'a1': 'outdoor', 'a2': 'dessert', 'a3': 'movie', 'a4': 'reading'}
    library = {}
    for activity in activities:
        topic = topics.get(activity['id'])
        if topic is None:
            continue  # New catalog entries require an explicit policy mapping.
        library[activity['id']] = {
            **activity, 'catalog_source': activity['source'], 'topic': topic,
            'requires_preference': activity['id'] != 'a1',
            'source_id': 'nature-walk-2015' if activity['id'] == 'a1' else None,
            'adaptation': '自然环境步行研究仅作选择方向参考。' if activity['id'] == 'a1' else '按明确活动诉求或获授权的偏好选择。',
            'limitation': '原研究为90分钟真实自然环境步行，不能等同短时校园活动或网页风景，也不保证个人效果。' if activity['id'] == 'a1' else '个人喜好不代表已证实的减压疗效；不适时可停止。',
        }
    # A direct catalog query is a request to find this activity, not a saved trait.
    requests = [part for part in clauses(query) if not re.search(r'朋友|同学|别人|他说|她说|以前|曾经|过去|假如|如果', part)]
    explicit = [t for t in TOPICS if any(topic_status(part, t, saved=True) == 'like' for part in requests)]
    preference_text = query + ''.join('。我喜欢' + TOPICS[t][0] for t in explicit) if risk_context(query) == 'ordinary' else query
    results, excluded = [], []
    while len(excluded) < len(library):
        item, _ = choose_advice(library, preference_text, profiles=profiles, memory_enabled=memory_enabled, excluded=excluded)
        if item is None:
            break
        for preference in item['basis']['preferences']:
            if preference['origin'] == 'current_message':
                preference['evidence'] = query
        results.append(item)
        excluded.append(item['id'])
    return results

"""Bounded, expiring visitor snapshots for the single-worker public demo."""
import json
from copy import deepcopy
import re
import secrets
import sqlite3
import time

SESSION_COOKIE = 'heartnest_demo'
SESSION_TTL = 24 * 60 * 60
MAX_SESSIONS = 500
MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024


class DemoSessions:
    def __init__(self, path):
        self.path = path
        self._proposals = {}
        with sqlite3.connect(path) as db:
            db.execute('CREATE TABLE IF NOT EXISTS demo_sessions '
                       '(id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at REAL NOT NULL)')

    def load(self, token):
        now = time.time()
        with sqlite3.connect(self.path) as db:
            db.execute('DELETE FROM demo_sessions WHERE expires_at <= ?', (now,))
            active = {row[0] for row in db.execute('SELECT id FROM demo_sessions')}
            for expired in self._proposals.keys() - active:
                del self._proposals[expired]
            row = db.execute('SELECT payload FROM demo_sessions WHERE id=?', (token,)).fetchone() if token and re.fullmatch(r'[a-f0-9]{64}', token) else None
            if row:
                return token, json.loads(row[0])
            if db.execute('SELECT COUNT(*) FROM demo_sessions').fetchone()[0] >= MAX_SESSIONS:
                raise OverflowError('演示访客已满，请稍后再试')
        return secrets.token_hex(32), None

    def proposals_for(self, token):
        # Pending evidence is temporary chat context, never part of SQLite state.
        return deepcopy(self._proposals.get(token, {}))

    def save(self, token, state, proposals):
        payload = json.dumps(state, ensure_ascii=False)
        if len(payload.encode('utf-8')) > MAX_SNAPSHOT_BYTES:
            raise OverflowError('当前演示数据已满，请删除部分记录后重试')
        with sqlite3.connect(self.path) as db:
            db.execute('INSERT OR REPLACE INTO demo_sessions VALUES(?,?,?)',
                       (token, payload, time.time() + SESSION_TTL))
        self._proposals[token] = deepcopy(proposals)

// Explicit live-provider check; only fictional text, no diary creation.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

assert.equal(process.env.TEST_ALLOW_LIVE, '1', 'Set TEST_ALLOW_LIVE=1 explicitly to use the configured live provider')
const base = 'http://127.0.0.1:8080'
const output = new URL('../../docs/design/conversation-reliability/', import.meta.url)
await fs.mkdir(output, { recursive: true })
async function api(path, body) {
  const response = await fetch(`${base}/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  assert(response.ok, `${path}: ${response.status}`)
  return response.json()
}
const before = await api('/diaries')
const cases = [
  { id: 'listen', text: '我只想说说，今天准备了很久却没发挥好。现在不用建议，也不想做练习。', rubric: '回应具体失落，不提供行动或劝做练习。' },
  { id: 'positive', text: '今天第一次把自己做的面包分享给朋友，大家都说好吃，我特别开心！', rubric: '自然分享开心，不强行寻找压力或夸张赞美。' },
  { id: 'mixed', text: '搬进新家很开心，但离开熟悉的街道又有点舍不得，两种感觉都在。', rubric: '容纳两种感受，不武断诊断或替用户决定。' },
  { id: 'decline', text: '这次我不想做小练习，就这样待着吧。', rubric: '接受拒绝，不追问或再次劝做。' },
  { id: 'correction', text: '我不是焦虑，只是平静地整理今天的事情，别把我当成有压力。', rubric: '接受用户的平静自述，不坚持焦虑或压力。', conversation: [{ role: 'assistant', content: '听起来你可能有点焦虑？' }] },
  { id: 'next-step', text: '我想缓一缓，可以给我一个下一步的入口吗？', rubric: '不编造疗效或文献；由用户决定是否进入来源明确的建议。' },
]
const results = []
for (const item of cases) {
  const result = await api('/companion/respond', { text: item.text, conversation: item.conversation || [], response_preference: 'adapt' })
  results.push({ ...item, reply: result.reply, llm_used: result.llm_used, reply_source: result.reply_source, understanding_source: result.understanding_source, policy_version: result.communication_policy_version })
}
const report = { date: new Date().toISOString(), fictional: true, persisted: false, results, user_acceptance: 'pending' }
await fs.writeFile(new URL('live-review.json', output), JSON.stringify(report, null, 2))
assert(results.every(r => r.llm_used && r.reply_source === 'llm'), 'Live review requires actual model replies; see report for fallback')
assert(results.every(r => r.policy_version === '2026-11-02-v2'))
assert.deepEqual(await api('/diaries'), before, 'Live review must not save diaries')
console.log(JSON.stringify(report, null, 2))

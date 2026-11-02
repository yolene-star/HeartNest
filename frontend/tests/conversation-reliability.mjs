import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = 'http://127.0.0.1:18080'
const output = new URL('../../docs/design/conversation-reliability/', import.meta.url)
await fs.mkdir(output, { recursive: true })
async function api(path, method = 'GET', body) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  assert(r.ok, `${path}: ${r.status}`)
  return r.json()
}
const settings = await api('/settings')
const before = await api('/diaries')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = [], checks = []
const createdIds = []
page.on('pageerror', e => errors.push(e.message))
async function send(text) {
  await page.locator('#chat-message').fill(text)
  const reply = page.waitForResponse(r => r.url().endsWith('/api/companion/respond'))
  await page.getByRole('button', { name: '发送', exact: true }).click()
  const response = await reply
  assert.equal(response.status(), 200, 'Valid history must not cause 422')
  await page.waitForFunction(() => !document.querySelector('.typing-state'))
}
try {
  await api('/settings', 'PATCH', { onboarding_complete: true, save_enabled: true })
  for (const size of [2000, 2001, 4000]) {
    await page.goto(base)
    await send('今天记录一点平常的事。' + '字'.repeat(size - 11))
    await send('继续聊聊这件小事。')
    assert.equal(await page.locator('.user-turn').count(), 2)
    assert.equal(await page.getByTestId('assistant-reply').count(), 2)
  }
  await page.getByRole('button', { name: '给我一个小建议', exact: true }).click()
  await page.getByTestId('advice-card').waitFor()
  await page.locator('.composer').scrollIntoViewIfNeeded()
  await page.screenshot({ path: fileURLToPath(new URL('long-history.png', output)) })
  checks.push('2000/2001/4000-character real API multi-turn conversation and advice request')
  await page.reload()
  const submitted = []
  await page.route('**/api/companion/respond', async route => {
    submitted.push(route.request().postDataJSON())
    if (submitted.length < 3) await route.fulfill({ status: 503, body: 'test failure' })
    else await route.continue()
  })
  await page.locator('#chat-message').fill('临时聊天重试时，不应新增用户消息。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  const retry = page.getByRole('button', { name: '重试回应', exact: true })
  await retry.waitFor({ timeout: 5000 })
  for (const width of [390, 785, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await retry.scrollIntoViewIfNeeded()
    assert(await retry.evaluate(b => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === b }))
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-retry.png`, output)) })
  }
  await page.locator('.composer-settings').evaluate(el => { el.open = true })
  await page.getByRole('radio', { name: '保存到 Agent 记忆库', exact: true }).check()
  await retry.click()
  await page.waitForFunction(() => !document.querySelector('.typing-state'))
  assert.equal(await page.getByTestId('failed-request').count(), 1)
  await page.locator('#chat-message').fill('重试期间另外写的草稿')
  await retry.click()
  await page.getByTestId('assistant-reply').waitFor()
  assert.equal(await page.locator('.user-turn').count(), 1)
  assert.equal(await page.getByTestId('assistant-reply').count(), 1)
  assert.equal(await page.getByTestId('failed-request').count(), 0)
  assert.deepEqual(submitted[1], submitted[0])
  assert.deepEqual(submitted[2], submitted[0])
  assert.equal(await page.locator('#chat-message').inputValue(), '重试期间另外写的草稿')
  assert.deepEqual(await api('/diaries'), before, 'Retry must retain original temporary-save choice')
  await page.unroute('**/api/companion/respond')
  checks.push('repeated failures retry same round/context without duplicate messages or changed save consent')
  await page.reload()
  await page.locator('.composer-settings').evaluate(el => { el.open = true })
  await page.getByRole('radio', { name: '保存到 Agent 记忆库', exact: true }).check()
  await page.locator('.composer-settings').evaluate(el => { el.open = true })
  await page.getByRole('checkbox', { name: '同时保存心栖回应', exact: true }).check()
  let attempts = 0
  await page.route('**/api/companion/respond', route => ++attempts === 1 ? route.fulfill({ status: 503, body: 'test failure' }) : route.continue())
  const savedText = `失败重试验收${Date.now()}：今天是普通的一天。`
  await page.locator('#chat-message').fill(savedText)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await retry.waitFor()
  await page.locator('.composer-settings').evaluate(el => { el.open = true })
  await page.getByRole('radio', { name: '不保存', exact: true }).check()
  await page.locator('.composer-settings').evaluate(el => { el.open = true })
  await page.getByRole('checkbox', { name: '同时保存心栖回应', exact: true }).uncheck()
  await retry.evaluate(b => { b.click(); b.click() })
  await page.getByText('已加入 Agent 记忆库', { exact: true }).waitFor()
  const saved = (await api('/diaries')).items.filter(d => d.text === savedText)
  createdIds.push(...saved.map(d => d.id))
  assert.equal(attempts, 2, 'Double click must not duplicate request')
  assert.equal(saved.length, 1)
  assert(saved[0].response_text)
  assert.equal(await page.locator('.user-turn').count(), 1)
  assert.equal(await page.getByTestId('assistant-reply').count(), 1)
  await page.unroute('**/api/companion/respond')
  await api(`/diaries/${saved[0].id}`, 'DELETE')
  checks.push('save-original-and-response consent retained, double retry guarded, one diary created')
  await page.reload()
  attempts = 0
  await page.route('**/api/companion/respond', route => ++attempts === 1 ? route.fulfill({ status: 503, body: 'test failure' }) : route.continue())
  await page.getByRole('button', { name: '想放松一下', exact: true }).click()
  await page.getByRole('button', { name: /试个小办法/ }).click()
  await retry.waitFor()
  await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
  await page.getByRole('button', { name: '想聊聊', exact: true }).click()
  await retry.click()
  await page.getByTestId('advice-card').waitFor()
  assert.equal(await page.locator('.user-turn').count(), 1)
  assert.equal(await page.locator('.user-message').textContent(), '我现在想放松一下，请给我一个简单的练习。')
  assert.equal(await page.getByTestId('assistant-reply').count(), 1)
  await page.getByRole('button', { name: '关闭聊天面板', exact: true }).click()
  await page.getByRole('button', { name: '返回陪伴', exact: true }).click()
  await page.unroute('**/api/companion/respond')
  checks.push('practice request retains one user bubble and retries inside shared lakeside conversation')
  await page.reload()
  await send('今天只想和你聊一点普通的小事。')
  const origin = page.getByTestId('reply-provenance').last()
  await origin.waitFor({ timeout: 5000 })
  assert.match(await origin.innerText(), /本地回应/)
  await origin.locator('summary').click()
  assert.match(await origin.innerText(), /未开启在线模型/)
  const cases = [
    { reply_source: 'rules', reply_fallback_reason: 'unavailable', llm_used: false, understanding_source: 'llm', expected: '模型暂不可用', detail: '在线模型理解' },
    { reply_source: 'rules', reply_fallback_reason: 'unconfigured', llm_used: false, understanding_source: 'rules', expected: '本地回应', detail: '尚未配置' },
    { reply_source: 'llm', reply_fallback_reason: null, llm_used: true, understanding_source: 'rules', expected: 'AI 陪伴回应', detail: '本地规则' },
    { reply_source: 'memory', reply_fallback_reason: null, llm_used: false, understanding_source: 'rules', expected: '历史记录检索', detail: '实际保存的记录' },
    { reply_source: 'advice', reply_fallback_reason: null, llm_used: false, understanding_source: 'rules', expected: '来源库小练习', detail: '已有来源库' },
  ]
  for (const item of cases) {
    await page.reload()
    await page.route('**/api/companion/respond', route => route.fulfill({ json: { ...item, reply: '这是用于核对来源标识的模拟回应。', safety: false, memories: [], emotion_suggestion: { label: '平稳', status: 'unconfirmed' } } }))
    await send('模拟来源状态。')
    await origin.waitFor()
    assert((await origin.locator('summary').innerText()).includes(item.expected))
    await origin.locator('summary').click()
    assert((await origin.innerText()).includes(item.detail))
    if (item.reply_source !== 'rules') assert(!(await origin.innerText()).includes('模型暂不可用'))
    if (item.reply_fallback_reason === 'unavailable') {
      for (const width of [390, 785, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await origin.scrollIntoViewIfNeeded()
        await page.screenshot({ path: fileURLToPath(new URL(`${width}-source.png`, output)) })
      }
    }
    await page.unroute('**/api/companion/respond')
  }
  checks.push('real offline source, failed/unconfigured/online mixed states, memory and advice never mislabeled as failure')
  assert.deepEqual(await api('/diaries'), before)
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('results.json', output), JSON.stringify({ passed: true, checks, errors }, null, 2))
  console.log(`PASS ${checks.length} conversation reliability scenarios`)
} finally {
  const remaining = (await api('/diaries')).items
  for (const id of createdIds) if (remaining.some(d => d.id === id)) await api(`/diaries/${id}`, 'DELETE')
  await api('/settings', 'PATCH', settings)
  await browser.close()
}

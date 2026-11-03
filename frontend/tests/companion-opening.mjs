import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const base = 'http://127.0.0.1:18081'
const out = '../docs/design/companion-opening'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1363, height: 871 } })
const errors = [], checks = []
page.on('pageerror', e => errors.push(e.message))
const api = async (path, method = 'GET', data) => {
  const response = await page.request.fetch(`${base}/api${path}`, { method, data })
  assert(response.ok(), `${path}: ${response.status()}`)
  return response.json()
}
const greeting = page.getByTestId('companion-greeting')
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
try {
  assert.equal((await api('/health')).public_demo, true, 'Only mutate the isolated visitor demo')
  await api('/settings')
  await api('/settings', 'PATCH', { onboarding_complete: true, save_enabled: true, memory_enabled: false, nickname: '小禾' })
  await api('/diaries', 'POST', { text: '虚拟疲惫日记：私密的具体原因不要自动展示', emotion_label: '疲惫', recorded_at: today })
  await page.goto(base)
  await expect(greeting).toContainText('小禾，')
  await expect(greeting).not.toContainText('累')
  await expect(page.locator('.user-message')).toHaveCount(0)
  await expect(page.locator('.conversation-empty')).toHaveCount(0)
  checks.push('Agent speaks first; memory off uses generic nickname greeting without private content')

  await api('/settings', 'PATCH', { memory_enabled: true })
  await page.reload()
  await expect(greeting).toContainText('最近')
  await expect(greeting).toContainText('累')
  await expect(greeting).not.toContainText('私密')
  const initial = await greeting.innerText()
  await page.screenshot({ path: `${out}/desktop-tired.png` })
  for (const name of ['日记', '回顾', '我的']) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.getByRole('button', { name: '陪伴', exact: true }).click()
    await expect(greeting).toHaveCount(1)
    assert.equal(await greeting.innerText(), initial)
  }
  const sent = page.waitForRequest(r => r.url().endsWith('/api/companion/respond') && r.method() === 'POST')
  await page.locator('#chat-message').fill('嗯，我想聊聊今天的小事。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  const payload = (await sent).postDataJSON()
  assert.equal(payload.conversation[0].role, 'assistant')
  assert.equal(payload.conversation[0].content, await greeting.locator('.agent-message').innerText())
  await expect(page.getByTestId('assistant-reply')).toHaveCount(1)
  await expect(greeting).toHaveCount(1)
  assert.equal((await api('/diaries')).items.length, 1, 'Greeting and unsaved chat must not become diaries')
  checks.push('Recent confirmed tired state; navigation and first reply retain exactly one opening; model context includes it')

  await api('/diaries', 'POST', { text: '虚拟开心日记', emotion_label: '开心', recorded_at: today })
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.getByRole('button', { name: '陪伴', exact: true }).click()
  assert.equal(await greeting.innerText(), initial, 'Existing chat opening must not be rewritten mid-conversation')
  await page.reload()
  await expect(greeting).toContainText('不止一种')
  const entries = (await api('/diaries')).items
  for (const entry of entries) await api(`/diaries/${entry.id}`, 'DELETE')
  await api('/diaries', 'POST', { text: '虚拟开心日记', emotion_label: '开心', recorded_at: today })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(greeting).toContainText('开心')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: `${out}/mobile-positive.png` })
  checks.push('Existing conversation frozen; new session reflects mixed/latest moods; positive mobile opening fits')

  await page.route('**/api/companion/opening', route => route.fulfill({ status: 503, json: { detail: 'synthetic unavailable' } }))
  await page.reload()
  await expect(greeting).toContainText('小禾，')
  await expect(page.locator('#chat-message')).toBeEnabled()
  await expect(greeting).not.toContainText('开心')
  await page.unroute('**/api/companion/opening')
  checks.push('Opening service failure falls back to generic greeting and leaves composer usable')

  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/companion/opening', async route => {
    await gate
    await route.fulfill({ json: { text: '迟到的开场不应覆盖已经开始的聊天', personalized: true } })
  })
  await page.reload()
  await expect(greeting).toContainText('小禾，')
  const generic = await greeting.innerText()
  await page.locator('#chat-message').fill('我想先开始聊聊。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByTestId('assistant-reply')).toHaveCount(1)
  const delayedResponse = page.waitForResponse(r => r.url().endsWith('/api/companion/opening'))
  release()
  await delayedResponse
  assert.equal(await greeting.innerText(), generic)
  checks.push('Late opening response cannot replace the opening after user starts chatting')
  assert.deepEqual(errors, [])
  await fs.writeFile(`${out}/result.json`, JSON.stringify({ passed: true, checks, errors }, null, 2))
  console.log(`PASS ${checks.length} personalized opening browser scenario groups`)
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` })
  throw error
} finally { await browser.close() }

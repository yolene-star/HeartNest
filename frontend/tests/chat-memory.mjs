import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:18080'
const folder = new URL('../../docs/design/chat-memory-validation/', import.meta.url)
await fs.mkdir(folder, { recursive: true })
async function api(path, method = 'GET', body) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  assert(r.ok, `${method} ${path}: ${r.status}`); return r.json()
}
const settings = await api('/settings')
const prefix = `聊天记忆验收${Date.now()}`
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 785, height: 871 } })
const errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
let replies = 0
async function send(text) {
  if (await page.locator('.composer-settings').evaluate(el => el.open)) await page.locator('.composer-settings summary').click()
  await page.locator('#chat-message').fill(text)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByTestId('assistant-reply').nth(replies++).waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: '发送', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.typing-state'))
}
try {
  await api('/settings', 'PATCH', { onboarding_complete: true, save_enabled: true, memory_enabled: true })
  await page.goto(base)
  await page.locator('.composer-settings summary').click()
  const temporary = page.getByRole('radio', { name: '不保存', exact: true })
  const remember = page.getByRole('radio', { name: '保存到 Agent 记忆库', exact: true })
  assert(await temporary.isChecked(), 'Chat should default to no persistent save')
  assert.equal(await page.locator('.composer').getByText('需要回应', { exact: true }).count(), 0)
  await send(`${prefix}不保存：我今天喜欢沿着湖边散步。`)
  assert(!(await api('/diaries')).items.some(item => item.text.startsWith(prefix)))
  checks.push('temporary chat receives a real reply without persisting')
  await page.locator('.composer-settings').evaluate(el => { el.open = true })
  await remember.check()
  const text = `${prefix}保存：我喜欢在晴天去植物园看花。`
  await send(text)
  await page.getByText('已加入 Agent 记忆库', { exact: true }).waitFor()
  let saved = (await api('/diaries')).items.find(item => item.text === text)
  assert(saved && saved.kind === 'chat' && saved.allow_retrieval)
  assert.equal(saved.response_text, null, 'Original-only save must not persist assistant text')
  assert((await api('/memories/search', 'POST', { query: text })).items.some(item => item.id === saved.id))
  const lastReply = page.getByTestId('assistant-reply').last()
  const emotionSaved = page.waitForResponse(r => r.url().includes(`/diaries/${saved.id}/emotion`) && r.request().method() === 'PATCH')
  await lastReply.locator('.emotion-prompt summary').click()
  await lastReply.getByRole('button', { name: '差不多', exact: true }).click()
  await emotionSaved
  await page.waitForFunction(() => !!document.querySelector('.emotion-confirmed'))
  saved = (await api('/diaries')).items.find(item => item.id === saved.id)
  assert(saved.emotion_confirmed)
  await lastReply.locator('.emotion-confirmed').getByRole('button', { name: '修改', exact: true }).click()
  await lastReply.getByRole('button', { name: '低落', exact: true }).click()
  await page.waitForFunction(async id => (await (await fetch('/api/diaries')).json()).items.find(d => d.id === id)?.emotion.label === '低落', saved.id)
  checks.push('save selection still replies, stores source and is retrievable; corrected emotion persists')
  await api('/settings', 'PATCH', { memory_enabled: false })
  assert.equal((await api('/memories/search', 'POST', { query: text })).items.length, 0)
  await page.reload(); replies = 0
  await page.locator('.composer-settings').evaluate(el => { el.open = true })
  await temporary.check()
  await send(`${prefix}临时：今天也想聊聊天。`)
  await page.getByRole('button', { name: '加入 Agent 记忆库', exact: true }).click()
  await page.getByText('已加入 Agent 记忆库', { exact: true }).waitFor()
  assert.equal((await api('/diaries')).items.filter(item => item.text.startsWith(prefix)).length, 2)
  checks.push('manual opt-in stores original and global retrieval switch remains authoritative')
  await page.locator('.composer-settings').evaluate(el => { el.open = true })
  await remember.check()
  await page.route('**/api/diaries', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, body: 'test save failure' }) : route.continue())
  await send(`${prefix}失败：保存失败也要能收到回应。`)
  await page.getByRole('alert').filter({ hasText: '记忆' }).waitFor()
  assert.equal((await api('/diaries')).items.filter(item => item.text.startsWith(prefix)).length, 2)
  await page.unroute('**/api/diaries')
  await page.getByRole('button', { name: '加入 Agent 记忆库', exact: true }).click()
  await page.getByText('已加入 Agent 记忆库', { exact: true }).last().waitFor()
  checks.push('save failure preserves reply and original; manual retry persists once')
  for (const width of [390, 785, 1440]) {
    await page.setViewportSize({ width, height: 871 })
    await page.locator('#chat-message').scrollIntoViewIfNeeded()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.locator('.composer-settings').evaluate(el => { el.open = true })
    assert(await remember.isVisible())
    assert(await page.locator('.composer button[type=submit]').evaluate(button => { const r = button.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button }), 'Send button must remain unobscured')
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-composer.png`, folder)) })
  }
  await api('/settings', 'PATCH', { save_enabled: false })
  await page.reload(); replies = 0
  await page.locator('.composer-settings').evaluate(el => { el.open = true })
  assert(await remember.isDisabled())
  await send(`${prefix}关闭：关闭保存也能正常聊天。`)
  assert.equal((await api('/diaries')).items.filter(item => item.text.startsWith(prefix)).length, 3)
  checks.push('save disabled still replies; 390/785/1440 layouts fit')
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('results.json', folder), JSON.stringify({ passed: true, checks, errors }, null, 2))
  console.log(`PASS ${checks.length} chat memory scenarios`)
} finally {
  await page.unroute('**/api/diaries').catch(() => {})
  for (const item of (await api('/diaries')).items.filter(item => item.text.startsWith(prefix))) await api(`/diaries/${item.id}`, 'DELETE')
  await api('/settings', 'PATCH', settings)
  await browser.close()
}

import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = process.env.TEST_URL || 'http://127.0.0.1:18080'
assert.equal(new URL(base).port, '18080', 'Only run on the isolated acceptance database')
const out = new URL('../../docs/completion-validation/', import.meta.url)
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const result = { checks: [], errors: [], started_at: new Date().toISOString() }
const ids = []
const profileIds = new Set()
async function api(path, method = 'GET', body) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  assert(r.ok, `${method} ${path}: ${r.status}`)
  return r.json()
}
const original = await api('/settings')
let page
try {
  await api('/settings', 'PATCH', { onboarding_complete: true, save_enabled: true, memory_enabled: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', e => result.errors.push(e.message))
  page.on('response', async response => {
    try {
      if (!response.ok() || response.request().method() !== 'POST') return
      const pathname = new URL(response.url()).pathname
      if (!['/api/profile', '/api/feedback', '/api/diaries'].includes(pathname)) return
      const item = await response.json()
      if (pathname === '/api/profile') profileIds.add(item.id)
      if (pathname === '/api/diaries') ids.push(item.id)
      if (pathname === '/api/feedback' && item.profile_id) profileIds.add(item.profile_id)
    } catch {}
  })
  await page.goto(base)
  await page.getByRole('button', { name: '我的', exact: true }).click()
  await page.getByLabel('偏好内容', { exact: true }).fill('阅读')
  await page.getByRole('button', { name: '添加偏好', exact: true }).click()
  const row = page.locator('.profile-setting-row').filter({ hasText: '阅读' })
  await row.waitFor()
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByLabel('修改偏好内容').fill('图书馆阅读')
  await page.getByRole('button', { name: '保存偏好', exact: true }).click()
  await row.getByText('图书馆阅读', { exact: true }).waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('01-profile-edit.png', out)), fullPage: true })
  result.checks.push('profile create/edit persists')
  await page.getByRole('button', { name: '陪伴', exact: true }).click()
  // Activity catalog remains an API contract; the product entry now discusses activities in chat.
  const catalog = await api('/recommendations', 'POST', { query: '', budget: 0, time: '下午' })
  assert.equal(catalog.items.length, 1)
  assert.match(catalog.items[0].name, /图书馆主题阅读/)
  await api('/feedback', 'POST', { recommendation_id: catalog.items[0].id, action: 'reject', remember_preference: false })
  assert.equal((await api('/profile')).items.filter(p => p.type === '反感').length, 0)
  const feedback = await api('/feedback', 'POST', { recommendation_id: catalog.items[0].id, action: 'reject', remember_preference: true })
  if (feedback.profile_id) profileIds.add(feedback.profile_id)
  assert.equal((await api('/recommendations', 'POST', { query: '', budget: 0, time: '下午' })).items.length, 0)
  result.checks.push('catalog API time/budget filtering and explicit preference feedback; sidebar form retired')
  await page.locator('#chat-message').fill('回归验收：今天很累，想慢慢来。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByTestId('assistant-reply').waitFor({ timeout: 60000 })
  await page.locator('.composer-settings summary').click()
  await page.getByLabel('同时保存心栖回应').check()
  await page.locator('.composer-settings summary').click()
  await page.getByRole('button', { name: '加入 Agent 记忆库', exact: true }).click()
  await page.getByText('已加入 Agent 记忆库', { exact: true }).waitFor()
  const diary = (await api('/diaries')).items.find(d => d.text.startsWith('回归验收：'))
  assert(diary?.response_text)
  ids.push(diary.id)
  await page.getByRole('button', { name: '给我一个小建议', exact: true }).click()
  const advice = page.getByTestId('advice-card').last()
  await advice.waitFor()
  const firstTitle = await advice.locator('h3').textContent()
  await advice.getByRole('button', { name: '换个更轻松的', exact: true }).click()
  await page.waitForFunction(title => [...document.querySelectorAll('[data-testid=advice-card] h3')].at(-1)?.textContent !== title, firstTitle)
  assert.equal(await page.getByTestId('advice-card').first().locator('h3').textContent(), firstTitle)
  await advice.getByRole('button', { name: '依据与适用范围', exact: true }).click()
  assert.match(await advice.locator('.evidence-detail a').getAttribute('href'), /who.int/)
  await page.screenshot({ path: fileURLToPath(new URL('03-advice-alternative.png', out)), fullPage: true })
  result.checks.push('whole exchange save and real source-linked advice alternative')
  await page.getByRole('button', { name: '日记', exact: true }).click()
  await page.getByRole('tab', { name: '日记列表', exact: true }).click()
  await page.locator('.diary-row').filter({ hasText: '回归验收：' }).click()
  await page.getByRole('switch', { name: '允许这篇记录用于记忆检索' }).click()
  await page.waitForFunction(async id => (await (await fetch('/api/diaries')).json()).items.find(d => d.id === id)?.allow_retrieval === false, diary.id)
  assert(!(await api('/memories/search', 'POST', { query: '回归验收' })).items.some(d => d.id === diary.id))
  await page.reload()
  assert.equal((await api('/diaries')).items.find(d => d.id === diary.id).allow_retrieval, false)
  result.checks.push('diary retrieval permission revoked and remains revoked after reload')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await page.getByRole('button', { name: '陪伴', exact: true }).click()
    await page.getByRole('button', { name: '一起找个小活动', exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('.typing-state'))
    await page.getByTestId('assistant-reply').last().waitFor({ timeout: 60000 })
    assert.equal(await page.locator('.activity-filter').count(), 0)
    assert.match(await page.locator('.user-message').last().textContent(), /小活动/)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-activity.png`, out)), fullPage: true })
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-activity-viewport.png`, out)) })
    await page.getByRole('button', { name: '我的', exact: true }).click()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-profile.png`, out)), fullPage: true })
  }
  assert.deepEqual(result.errors, [])
  result.passed = true
} catch (e) {
  if (page) await page.screenshot({ path: fileURLToPath(new URL('failure.png', out)) })
  result.passed = false; result.failure = e.stack; process.exitCode = 1
} finally {
  for (const id of new Set(ids)) await api(`/diaries/${id}`, 'DELETE').catch(() => {})
  for (const id of profileIds) await api(`/profile/${id}`, 'DELETE').catch(() => {})
  await api('/settings', 'PATCH', original)
  await browser.close()
  await fs.writeFile(new URL('results.json', out), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}

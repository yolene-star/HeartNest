import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const base = 'http://127.0.0.1:18081'
const out = '../docs/design/advice-evidence'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1363, height: 871 } })
const errors = [], checks = []
page.on('pageerror', e => errors.push(e.message))
const api = async (path, method = 'GET', data) => {
  const r = await page.request.fetch(`${base}/api${path}`, { method, data })
  assert(r.ok(), `${path}: ${r.status()}`)
  return r.json()
}
const lastCard = () => page.getByTestId('advice-card').last()
const send = async text => {
  const done = page.waitForResponse(r => r.url().endsWith('/api/companion/respond') && r.request().method() === 'POST')
  await page.locator('#chat-message').fill(text)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  assert((await done).ok())
  await expect(page.locator('.typing-state')).toHaveCount(0)
}
try {
  assert.equal((await api('/health')).public_demo, true, 'Only mutate the isolated visitor demo')
  await api('/settings') // Establish one isolated visitor before concurrent page requests.
  await api('/settings', 'PATCH', { onboarding_complete: true, save_enabled: false, memory_enabled: true })
  await page.goto(base)
  await send('我喜欢画画，请给我一个放松建议')
  await expect(lastCard().locator('h3')).toHaveText('随意画一点')
  await expect(lastCard().locator('.evidence-detail')).toHaveCount(0)
  await lastCard().getByRole('button', { name: '依据与适用范围', exact: true }).click()
  await expect(lastCard().locator('.evidence-detail')).toContainText('个人偏好')
  await expect(lastCard().locator('.evidence-detail a')).toHaveCount(0)
  await lastCard().scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/desktop-preference.png` })
  await lastCard().getByRole('button', { name: '先不用', exact: true }).click()
  await expect(lastCard().locator('.advice-feedback')).toContainText('这次先不做')
  assert.equal((await api('/profile')).items.length, 0)
  await send('我喜欢画画，请给我一个放松建议')
  await expect(lastCard().locator('h3')).not.toHaveText('随意画一点')
  checks.push('preference-only basis, collapsed evidence, rejection stays in session without profile')

  await send('我喜欢听音乐，请给我一个放松建议')
  await expect(lastCard().locator('h3')).toHaveText('听一首自己喜欢的音乐')
  await lastCard().getByRole('button', { name: '依据与适用范围', exact: true }).click()
  await expect(lastCard().locator('.evidence-detail')).toContainText('文献与个人偏好')
  await expect(lastCard().locator('.evidence-detail a')).toHaveAttribute('href', 'https://pubmed.ncbi.nlm.nih.gov/31167611/')
  await lastCard().getByRole('checkbox').check()
  await lastCard().getByRole('button', { name: '做了不舒服', exact: true }).click()
  await expect(lastCard().locator('.advice-feedback')).toContainText('先停下')
  const avoided = (await api('/profile')).items
  assert.equal(avoided.length, 1)
  assert.equal(avoided[0].advice_id, 'familiar-music')
  await page.getByRole('button', { name: '我的', exact: true }).click()
  const row = page.locator('.profile-setting-row').filter({ hasText: '听一首自己喜欢的音乐' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '删除', exact: true }).click()
  await expect(row).toHaveCount(0)
  assert.equal((await api('/profile')).items.length, 0)
  await page.getByRole('button', { name: '陪伴', exact: true }).click()
  assert.equal(await page.getByTestId('advice-card').count(), 3)
  checks.push('music literature+preference link, discomfort stops, explicit avoidance appears in My and can be deleted; navigation preserves cards')

  await send('我喜欢音乐，但是最近听音乐停不下来，影响学习')
  await send('给我一个小建议')
  await expect(lastCard().locator('h3')).not.toHaveText('听一首自己喜欢的音乐')
  checks.push('cross-turn loss of control suppresses risky preference recommendations')

  await send('我喜欢喝酒解压，给我一个放松建议')
  await expect(lastCard().locator('h3')).not.toHaveText('听一首自己喜欢的音乐')
  await expect(page.getByTestId('assistant-reply').last()).toContainText('不会推荐')
  const count = await page.getByTestId('advice-card').count()
  await send('不用建议，只想聊聊')
  assert.equal(await page.getByTestId('advice-card').count(), count)
  assert.equal((await api('/diaries')).items.length, 0)
  checks.push('risky coping not promoted, refusal adds no action, no diary save without permission')

  await send('教我一个呼吸练习')
  assert.equal(await page.getByTestId('advice-card').count(), count + 1)
  const beforeDiscomfort = await page.getByTestId('advice-card').count()
  await send('听音乐后不舒服')
  await expect(page.getByTestId('assistant-reply').last()).toContainText('先停下')
  assert.equal(await page.getByTestId('advice-card').count(), beforeDiscomfort)
  checks.push('plain chat exercise request enters controlled library; discomfort text stops without a new action')

  await page.setViewportSize({ width: 390, height: 844 })
  await send('给我一个放松建议')
  await lastCard().getByRole('button', { name: '依据与适用范围', exact: true }).click()
  await lastCard().locator('.evidence-detail').scrollIntoViewIfNeeded()
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: `${out}/mobile-literature.png` })
  await lastCard().locator('.evidence-detail a').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/mobile-source-link.png` })
  assert.deepEqual(errors, [])
  await fs.writeFile(`${out}/result.json`, JSON.stringify({ checks, errors, passed: true }, null, 2))
  console.log(`PASS ${checks.length} advice evidence scenario groups, desktop and mobile; no page errors`)
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` })
  throw error
} finally { await browser.close() }

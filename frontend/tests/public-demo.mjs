import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const base = process.env.PUBLIC_DEMO_URL || 'http://127.0.0.1:18081'
const prefix = base.startsWith('https:') ? 'https' : 'local'
const out = '../docs/design/public-demo'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const a = await browser.newContext({ viewport: { width: 1363, height: 871 } })
const b = await browser.newContext({ viewport: { width: 793, height: 871 } })
const page = await a.newPage(), other = await b.newPage(), errors = [], checks = []
const issuedTokens = new Set()
page.on('response', async response => {
  const cookie = (await response.allHeaders())['set-cookie']
  const match = cookie?.match(/heartnest_demo=([a-f0-9]+)/)
  if (match) issuedTokens.add(match[1])
})
page.on('pageerror', e => errors.push(e.message))
other.on('pageerror', e => errors.push(e.message))
const api = async (context, path, method = 'GET', data) => {
  const response = await context.request.fetch(`${base}/api${path}`, { method, data })
  assert(response.ok(), `${method} ${path}: ${response.status()}`)
  return response.json()
}
try {
  await page.goto(base)
  await expect(page.getByRole('heading', { name: '谁来陪你一会儿？' })).toBeVisible({ timeout: 30000 })
  assert.equal(issuedTokens.size, 1, 'first load must bootstrap exactly one visitor session')
  await page.getByRole('button', { name: '认识 沐沐' }).click()
  await page.locator('#nickname').fill('演示访客甲')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await page.getByRole('button', { name: '完成设置', exact: true }).click()
  await expect(page.locator('.onboarding-panel')).toHaveCount(0)
  await expect(page.locator('.public-demo-notice')).toBeVisible()
  assert.equal((await api(a, '/settings')).nickname, '演示访客甲')
  checks.push('real onboarding and independent cookie-backed settings')

  await page.locator('#chat-message').fill('以后叫我小红')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  const card = page.getByRole('region', { name: '个人资料更新确认' })
  // A section labelled by aria-label is exposed as a region.
  await expect(card.getByRole('button', { name: '确认更新' })).toBeVisible({ timeout: 30000 })
  assert.equal((await api(a, '/settings')).nickname, '演示访客甲')
  await card.getByRole('button', { name: '确认更新' }).click()
  await expect(card).toContainText('已更新到「我的」')
  assert.equal((await api(a, '/settings')).nickname, '小红')
  await expect(page.locator('.welcome-strip')).toContainText('小红')
  checks.push('actual rules response, nickname proposal and explicit confirmation')
  await page.screenshot({ path: `${out}/${prefix}-desktop-chat.png` })

  await page.getByRole('button', { name: '日记', exact: true }).click()
  await page.getByRole('button', { name: '＋ 写日记', exact: true }).click()
  const text = '虚构演示日记：今天在湖边散步，看到了晚霞，心情很轻松。'
  await page.locator('#journal-draft').fill(text)
  await page.getByRole('button', { name: '保存日记', exact: true }).click()
  await expect(page.getByRole('region', { name: '日记详情' })).toContainText(text, { timeout: 30000 })
  const diary = (await api(a, '/diaries')).items.find(item => item.text === text)
  assert(diary)
  await page.screenshot({ path: `${out}/${prefix}-desktop-diary.png` })

  await other.goto(base)
  await expect(other.getByRole('heading', { name: '谁来陪你一会儿？' })).toBeVisible({ timeout: 30000 })
  assert.equal((await api(b, '/settings')).nickname, '')
  assert.deepEqual((await api(b, '/diaries')).items, [])
  assert.deepEqual((await api(b, '/profile')).items, [])
  assert.equal((await b.request.delete(`${base}/api/diaries/${diary.id}`)).status(), 404)
  await api(b, '/settings', 'PATCH', { onboarding_complete: true, nickname: '访客乙' })
  await other.reload()
  await expect(other.locator('#chat-message')).toBeVisible()
  await other.getByRole('button', { name: '打开陪伴工具', exact: true }).click()
  await expect(other.getByRole('dialog', { name: '陪伴工具' })).toBeVisible()
  await other.screenshot({ path: `${out}/${prefix}-narrow-tools.png` })
  await other.getByRole('button', { name: '关闭陪伴工具', exact: true }).click()
  await other.locator('.public-demo-notice summary').click()
  await expect(other.locator('.public-demo-notice')).toContainText('未接入大模型')
  await other.screenshot({ path: `${out}/${prefix}-narrow-notice.png` })
  for (const p of [page, other]) {
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert(await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1))
    const footer = await p.locator('.notebook-page-footer').boundingBox()
    assert(footer.y + footer.height <= 871)
  }
  await other.setViewportSize({ width: 390, height: 844 })
  await expect(other.locator('#chat-message')).toBeVisible()
  const composer = await other.locator('.composer').boundingBox()
  assert(composer.y + composer.height <= 844, 'mobile composer must fit the viewport')
  assert(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await other.screenshot({ path: `${out}/${prefix}-mobile-notice.png` })
  checks.push('two browser contexts isolated; foreign diary deletion rejected; narrow tools and fixed layout')
  await page.getByRole('button', { name: '陪伴', exact: true }).click()
  await expect(page.locator('.user-message').filter({ hasText: '以后叫我小红' })).toHaveCount(1)
  await page.reload()
  await expect(page.locator('#chat-message')).toBeVisible()
  assert.equal((await api(a, '/settings')).nickname, '小红')
  assert((await api(a, '/diaries')).items.some(item => item.id === diary.id))
  assert.deepEqual(errors, [])
  if (base.startsWith('https:')) {
    const cookie = (await a.cookies()).find(item => item.name === 'heartnest_demo')
    assert(cookie.httpOnly && cookie.secure && cookie.sameSite === 'Lax')
    checks.push('real HTTPS, Secure HttpOnly SameSite cookie, browser reload persistence')
  }
  await api(a, `/diaries/${diary.id}`, 'DELETE')
  assert(!(await api(a, '/diaries')).items.some(item => item.id === diary.id))
  checks.push('navigation retains chat; reload retains authorized data; demo diary deletion works; no JS errors')
  await fs.writeFile(`${out}/${prefix}-results.json`, JSON.stringify({ base, checks, errors }, null, 2))
  console.log(JSON.stringify({ base, checks, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: `${out}/${prefix}-failure.png` }).catch(() => {})
  throw error
} finally {
  await browser.close()
}

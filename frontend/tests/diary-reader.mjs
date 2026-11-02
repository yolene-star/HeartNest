import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = 'http://127.0.0.1:18080'
const folder = new URL('../../docs/design/diary-reader/', import.meta.url)
await fs.mkdir(folder, { recursive: true })
async function api(path, method = 'GET', body) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  assert(r.ok, `${method} ${path}: ${r.status}`); return r.json()
}
const original = await api('/settings')
const now = new Date()
const date = new Date(now.getFullYear(), now.getMonth() - 1, 15)
const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-15`
const text = '虚构日记：把普通的一天收好\n\n午后沿着校园的小路走了一会儿，风穿过树叶，阳光落在本子上。\n回去做完了一件拖了很久的小事，心里踏实了些。\n\n今天没有特别大的惊喜，但和朋友一起吃了一顿饭，已经很满足。'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1363, height: 950 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
let id
try {
  await api('/settings', 'PATCH', { onboarding_complete: true, save_enabled: true })
  id = (await api('/diaries', 'POST', { text, emotion_label: '开心', recorded_at: `${key}T12:00:00` })).id
  await page.goto(base)
  await page.getByRole('button', { name: '日记', exact: true }).click()
  await page.getByRole('button', { name: '上个月', exact: true }).click()
  await page.locator(`.calendar-cell[aria-label^="${key}"]`).click()
  for (const width of [390, 781, 1363]) {
    await page.setViewportSize({ width, height: 950 })
    await page.locator('.calendar-diary').filter({ hasText: '虚构日记：把普通的一天收好' }).getByRole('button', { name: '打开这篇日记', exact: true }).click()
    await page.locator('.diary-reader-page').waitFor()
    assert.equal(await page.locator('.diary-list-pane').count(), 0)
    assert.equal(await page.getByRole('tablist', { name: '日记视图' }).count(), 0)
    assert.equal(await page.locator('.journal-composer').count(), 0)
    assert.equal(await page.locator('.entry-original').textContent(), text)
    assert((await page.locator('.diary-reading-heading').textContent()).includes('开心'))
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.equal(await page.locator('.diary-detail-pane').evaluate(el => getComputedStyle(el).overflowY), 'visible', 'Reader uses paper scrolling instead of another internal pane')
    const paper = await page.locator('.diary-detail-pane').boundingBox()
    const back = await page.locator('.diary-reading-back').boundingBox()
    assert(paper.y - (back.y + back.height) < 40, 'Reader must not inherit the sticky detail pane top offset')
    if (width <= 650) assert.equal(await page.evaluate(() => scrollY), 0, 'Opening a diary resets mobile page scrolling')
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-reader.png`, folder)) })
    await page.getByRole('button', { name: '← 返回心情日历', exact: true }).click()
    await page.locator(`.calendar-cell[aria-label^="${key}"][aria-pressed=true]`).waitFor()
    assert((await page.locator('.calendar-toolbar strong').textContent()).includes(`${date.getMonth() + 1} 月`))
  }
  await page.locator('.calendar-diary').filter({ hasText: '虚构日记：把普通的一天收好' }).getByRole('button', { name: '打开这篇日记', exact: true }).click()
  await page.getByRole('button', { name: '编辑记录', exact: true }).click()
  await page.locator('#diary-original').fill(text + '\n编辑后：这份轻松想留得久一点。')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await page.locator('.entry-original').filter({ hasText: '这份轻松' }).waitFor()
  await page.locator('#diary-supplement').fill('后来补充：下次还想去走走。')
  await page.getByRole('button', { name: '添加补充', exact: true }).click()
  await page.locator('.addendum').filter({ hasText: '下次还想去走走' }).waitFor()
  const entry = (await api('/diaries')).items.find(item => item.id === id)
  assert.equal(entry.addenda.length, 1)
  assert.equal(entry.text, text + '\n编辑后：这份轻松想留得久一点。')
  await page.locator('.emotion-entry').getByRole('button', { name: '跳过', exact: true }).click()
  await page.locator('.diary-reading-heading').getByText('这一天的记录', { exact: true }).waitFor()
  assert.equal(await page.locator('.diary-reading-heading .mood-face').count(), 0, 'Skipped emotion must not appear as confirmed')
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '保留', exact: true }).click()
  assert((await api('/diaries')).items.some(item => item.id === id))
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('results.json', folder), JSON.stringify({ passed: true, checks: ['standalone paper reader at 390/781/1363', 'actual text with line breaks preserved', 'back restores previous month and selected date', 'edit and addendum persist', 'skipped mood not falsely confirmed', 'delete cancellation retains record'], errors }, null, 2))
  console.log('PASS standalone diary reader, three widths, return date/month, edit/addendum/emotion/delete-cancel')
} finally {
  if (id) await api(`/diaries/${id}`, 'DELETE')
  await api('/settings', 'PATCH', original)
  await browser.close()
}

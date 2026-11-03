import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = 'http://127.0.0.1:8080'
const folder = new URL('../../docs/design/diary-workspace/', import.meta.url)
await fs.mkdir(folder, { recursive: true })
const snapshot = async () => Object.fromEntries(await Promise.all(['diaries', 'profile'].map(async key => [key, await (await fetch(`${base}/api/${key}`)).json()])))
const before = await snapshot()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1363, height: 871 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto(base)
  await page.getByRole('button', { name: '日记', exact: true }).click()
  const sample = before.diaries.items.find(item => item.emotion_confirmed)
  if (sample) {
    const date = new Date(sample.recorded_at)
    const now = new Date()
    const offset = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth()
    for (let n = 0; n < Math.abs(offset); n++) await page.getByRole('button', { name: offset < 0 ? '上个月' : '下个月', exact: true }).click()
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    await page.locator(`.calendar-cell[aria-label^="${key}"]`).click()
    await page.getByRole('button', { name: '打开这篇日记', exact: true }).first().click()
    await page.locator('.diary-reader-page .entry-original').waitFor()
    assert.equal(await page.locator('.diary-list-pane').count(), 0)
    await page.getByRole('button', { name: '← 返回心情日历', exact: true }).click()
    await page.locator(`.calendar-cell[aria-label^="${key}"][aria-pressed=true]`).waitFor()
  }
  await page.getByRole('tab', { name: '日记列表', exact: true }).click()
  assert.equal(await page.locator('.journal-composer').count(), 0)
  await page.screenshot({ path: fileURLToPath(new URL('default-list.png', folder)) })
  await page.getByRole('button', { name: '＋ 写日记', exact: true }).click()
  assert.equal(await page.locator('.diary-list-pane').count(), 0)
  await page.locator('#journal-draft').fill('这是未保存的虚构界面验收草稿。')
  await page.getByRole('button', { name: '返回日记列表', exact: true }).click()
  await page.getByRole('button', { name: '＋ 写日记', exact: true }).click()
  assert.equal(await page.locator('#journal-draft').inputValue(), '这是未保存的虚构界面验收草稿。')
  await page.screenshot({ path: fileURLToPath(new URL('default-writer.png', folder)) })
  await page.setViewportSize({ width: 390, height: 871 })
  await page.screenshot({ path: fileURLToPath(new URL('default-mobile-writer.png', folder)) })
  await page.getByRole('button', { name: '返回日记列表', exact: true }).click()
  if (before.diaries.items.length) {
    await page.getByRole('button', { name: '打开日记', exact: true }).first().click()
    assert(!(await page.locator('.diary-list-pane').isVisible()))
    await page.getByRole('button', { name: '← 返回所有记录', exact: true }).click()
    assert(await page.locator('.diary-list-pane').isVisible())
  }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('default-results.json', folder), JSON.stringify({ passed: true, diaries: before.diaries.items.length, profiles: before.profile.items.length, errors }, null, 2))
  console.log(`PASS default writer/list/mobile return; ${before.diaries.items.length} diaries and ${before.profile.items.length} profiles unchanged`)
} finally { await browser.close() }

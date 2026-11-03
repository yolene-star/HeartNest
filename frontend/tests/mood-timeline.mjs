import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = 'http://127.0.0.1:18080'
const out = new URL('../../docs/completion-validation/', import.meta.url)
const ids = []
let browser
const result = { passed: false, errors: [] }
async function api(path, method = 'GET', body) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  assert(r.ok, `${path}: ${r.status}`); return r.json()
}
const original = await api('/settings')
try {
  await api('/settings', 'PATCH', { onboarding_complete: true, save_enabled: true })
  for (const [offset, label] of [[0, '积极'], [1, '疲惫'], [2, '平稳']]) {
    const date = new Date(); date.setDate(date.getDate() - offset)
    const stamp = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
    const item = await api('/diaries', 'POST', { text: `时间图回归-${label}`, emotion_label: label, recorded_at: `${stamp}T10:00:00` })
    ids.push(item.id)
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', e => result.errors.push(e.message))
  await page.goto(base)
  await page.getByRole('button', { name: '回顾', exact: true }).click()
  const graph = page.getByTestId('mood-timeline')
  await graph.waitFor({ timeout: 5000 })
  assert.equal(await graph.locator('.mood-time-day').count(), 7)
  assert.equal(await graph.getByText('未记录', { exact: true }).count(), 4)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await graph.scrollIntoViewIfNeeded()
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-timeline.png`, out)), fullPage: true })
  }
  await graph.getByRole('button', { name: /开心.*1.*打开记录/ }).click()
  await page.locator('.entry-original').filter({ hasText: '时间图回归-积极' }).waitFor()
  assert.deepEqual(result.errors, [])
  result.passed = true
  result.checks = ['seven chronological days; missing days stay empty; aliases normalized; opens exact diary; mobile and desktop fit']
} catch (e) { result.failure = e.stack; process.exitCode = 1 }
finally {
  for (const id of ids) await api(`/diaries/${id}`, 'DELETE')
  await api('/settings', 'PATCH', original)
  await browser?.close()
  await fs.mkdir(out, { recursive: true })
  await fs.writeFile(new URL('timeline-results.json', out), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}

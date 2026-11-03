import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = 'http://127.0.0.1:18080'
const out = new URL('../../docs/completion-validation/', import.meta.url)
const ids = []
const result = { passed: false }
let browser
async function api(path, method = 'GET', body) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  assert(r.ok, `${path}: ${r.status}`); return r.json()
}
const original = await api('/settings')
try {
  await api('/settings', 'PATCH', { onboarding_complete: true, save_enabled: true })
  for (const text of ['切换隔离验收-A', '切换隔离验收-B']) ids.push((await api('/diaries', 'POST', { text, emotion_label: '平静' })).id)
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(base)
  await page.getByRole('button', { name: '日记', exact: true }).click()
  await page.getByRole('tab', { name: '日记列表', exact: true }).click()
  await page.locator('.diary-row').filter({ hasText: '切换隔离验收-A' }).click()
  await page.locator('#diary-supplement').fill('只属于 A 的未保存补充')
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('alertdialog').waitFor()
  await page.locator('.diary-row').filter({ hasText: '切换隔离验收-B' }).click()
  assert.equal(await page.getByRole('alertdialog').count(), 0, 'Delete confirmation for A must not target B after selection changes')
  assert.equal(await page.locator('#diary-supplement').inputValue(), '', 'Unsent supplement for A must not transfer to B')
  assert((await api('/diaries')).items.some(d => d.id === ids[0]))
  assert((await api('/diaries')).items.some(d => d.id === ids[1]))
  await page.screenshot({ path: fileURLToPath(new URL('diary-selection.png', out)), fullPage: true })
  result.passed = true
} catch (e) { result.failure = e.stack; process.exitCode = 1 }
finally {
  for (const id of ids) await api(`/diaries/${id}`, 'DELETE')
  await api('/settings', 'PATCH', original)
  await browser?.close()
  await fs.writeFile(new URL('diary-selection-results.json', out), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}

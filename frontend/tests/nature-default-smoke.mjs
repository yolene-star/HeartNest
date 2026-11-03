import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const base = 'http://127.0.0.1:8080'
const folder = new URL(process.env.TEST_OUTPUT_DIR ? `../../${process.env.TEST_OUTPUT_DIR}/` : '../../docs/design/product-validation/', import.meta.url)
await fs.mkdir(folder, { recursive: true })
const before = JSON.parse(await fs.readFile(new URL('default-before.json', folder), 'utf8'))
const after = {}
for (const path of ['diaries', 'profile']) {
  const response = await fetch(`${base}/api/${path}`)
  assert(response.ok)
  after[path] = (await response.json()).items.map(item => item.id).sort()
}
assert.deepEqual(after, before, 'Default data must survive frontend deployment')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(base)
  await page.locator('.primary-nav').waitFor()
  assert.equal(await page.locator('.primary-nav button').count(), 4)
  await page.locator('.hero-pet img').waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('default-home.png', folder)) })
  for (const name of ['日记', '回顾', '我的', '陪伴']) {
    await page.getByRole('button', { name, exact: true }).click()
    assert(await page.locator('main h1').isVisible())
  }
  assert(await page.getByRole('radio', { name: '不保存', exact: true }).isChecked())
  assert(await page.getByRole('radio', { name: '保存到 Agent 记忆库', exact: true }).isVisible())
  await page.setViewportSize({ width: 785, height: 871 })
  await page.locator('#chat-message').scrollIntoViewIfNeeded()
  assert(await page.locator('.composer button[type=submit]').evaluate(button => { const r = button.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button }), 'Pet must not intercept send button')
  await page.screenshot({ path: fileURLToPath(new URL('default-785-composer.png', folder)) })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.locator('.nav-pet').isVisible())
  assert(!(await page.getByTestId('pet-dock').isVisible()))
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('default-smoke.json', folder), JSON.stringify({ passed: true, diaries: after.diaries.length, profiles: after.profile.length, errors }, null, 2))
  console.log(`PASS default UI smoke; ${after.diaries.length} diaries and ${after.profile.length} profiles preserved`)
} finally { await browser.close() }

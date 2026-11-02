import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = 'http://127.0.0.1:8080'
const folder = new URL('../../docs/design/quiet-scene-validation/', import.meta.url)
await fs.mkdir(folder, { recursive: true })
async function snapshot() {
  const result = {}
  for (const path of ['diaries', 'profile']) {
    const r = await fetch(`${base}/api/${path}`); assert(r.ok)
    result[path] = (await r.json()).items.map(x => x.id).sort()
  }
  return result
}
if (process.argv.includes('--snapshot')) {
  const before = await snapshot()
  await fs.writeFile(new URL('default-before.json', folder), JSON.stringify(before, null, 2))
  console.log(`Snapshot: ${before.diaries.length} diaries, ${before.profile.length} profiles`)
} else {
  const before = JSON.parse(await fs.readFile(new URL('default-before.json', folder), 'utf8'))
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    await page.goto(base)
    await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
    await page.getByTestId('quiet-scene').waitFor()
    await page.waitForFunction(() => document.querySelector('.quiet-background')?.complete)
    assert(!(await page.getByTestId('pet-dock').isVisible()))
    await page.screenshot({ path: fileURLToPath(new URL('default-lake.png', folder)) })
    await page.getByRole('button', { name: '想聊聊', exact: true }).click()
    assert(await page.locator('#chat-message').isVisible())
    await page.getByRole('button', { name: '返回陪伴', exact: true }).click()
    for (const name of ['日记', '回顾', '我的', '陪伴']) {
      await page.getByRole('button', { name, exact: true }).click()
      assert(await page.locator('main h1').isVisible())
    }
    assert.deepEqual(await snapshot(), before)
    assert.deepEqual(errors, [])
    await fs.writeFile(new URL('default-smoke.json', folder), JSON.stringify({ passed: true, diaries: before.diaries.length, profiles: before.profile.length, errors }, null, 2))
    console.log(`PASS default quiet scene and four pages; ${before.diaries.length} diaries and ${before.profile.length} profiles preserved`)
  } finally { await browser.close() }
}

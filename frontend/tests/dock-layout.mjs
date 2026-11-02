import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const base = 'http://127.0.0.1:18080'
const out = new URL('../../docs/completion-validation/', import.meta.url)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const result = { passed: false }
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  await page.goto(base)
  await page.locator('#chat-message').fill('今天想放松一下。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByTestId('assistant-reply').waitFor()
  await page.getByRole('button', { name: '给我一个小建议', exact: true }).click()
  const card = page.getByTestId('advice-card')
  await card.waitFor()
  for (const width of [1366, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await card.getByRole('button', { name: '试一下', exact: true }).scrollIntoViewIfNeeded()
    const dock = await page.getByTestId('pet-dock').boundingBox()
    const activity = await card.boundingBox()
    const overlaps = dock.x < activity.x + activity.width && dock.x + dock.width > activity.x && dock.y < activity.y + activity.height && dock.y + dock.height > activity.y
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-dock-layout.png`, out)) })
    assert(!overlaps, `${width}px default pet dock must not cover the activity feedback card`)
  }
  result.passed = true
} catch (e) { result.failure = e.stack; process.exitCode = 1 }
finally { await browser.close(); await fs.writeFile(new URL('dock-layout-results.json', out), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2)) }


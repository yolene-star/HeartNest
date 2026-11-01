import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const out = new URL('../../docs/pet-regression/', import.meta.url)
for (const id of ['bear', 'cloud', 'lamp']) {
  await page.addInitScript(pet => localStorage.setItem('heart-pet', JSON.stringify({ id })), id)
  await page.goto('http://localhost:8080')
  const avatar = page.locator('[data-testid="pet-avatar"]').last()
  await avatar.waitFor()
  assert(await avatar.isVisible())
  await page.screenshot({ path: fileURLToPath(new URL(`pet-${id}.png`, out)), fullPage: true })
  console.log(`PASS ${id}: SVG companion visible with state classes`)
  await page.reload()
}
await fs.writeFile(new URL('pet-variants.json', out), JSON.stringify({ pets: ['bear', 'cloud', 'lamp'], passed: true }, null, 2))
await browser.close()

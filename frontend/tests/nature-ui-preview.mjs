import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const target = new URL('../../docs/design/nature-ui-preview.html', import.meta.url)
const output = new URL('../../docs/design/screenshots/', import.meta.url)
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const result = { scope: 'standalone-design-preview-only', checks: [], errors: [] }
try {
  const page = await browser.newPage()
  page.on('pageerror', error => result.errors.push(error.message))
  await page.goto(target.href)
  assert(await page.locator('img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), 'Pet image loading')
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 })
    for (const [id, name] of [['companion', '陪伴'], ['diary', '日记'], ['review', '回顾'], ['profile', '我的']]) {
      await page.locator('.nav').getByRole('button', { name, exact: true }).click()
      assert(await page.locator(`#${id}`).isVisible())
      assert.equal(await page.locator('.nav').getByRole('button', { name, exact: true }).getAttribute('aria-current'), 'page')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${id} overflow`)
      if (width === 390) {
        assert(!(await page.locator('.dock').isVisible()), 'Floating pet must not cover mobile controls')
        assert(await page.locator('.nav-pet').isVisible(), 'Mobile pet stays in navigation')
      }
      await page.mouse.move(0, 0)
      if (width === 390 || width === 1440) await page.screenshot({ path: fileURLToPath(new URL(`${width}-${id}.png`, output)), fullPage: width !== 390, animations: 'disabled' })
      result.checks.push(`${width}px ${id}: visible, no overflow`)
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.nav').getByRole('button', { name: '日记', exact: true }).click()
  await page.getByRole('button', { name: '11月11日，平稳', exact: true }).click()
  assert.equal(await page.locator('#day-detail h2').textContent(), '平稳')
  await page.locator('#day-detail').scrollIntoViewIfNeeded()
  await page.screenshot({ path: fileURLToPath(new URL('390-diary-detail.png', output)), animations: 'disabled' })
  await page.getByRole('button', { name: '11月2日，无记录', exact: true }).click()
  assert((await page.locator('#day-detail').textContent()).includes('还没有记录'))
  await page.getByRole('tab', { name: '日记列表', exact: true }).click()
  await page.locator('#diary-list button').first().click()
  assert.equal(await page.getByRole('tab', { name: '心情日历' }).getAttribute('aria-selected'), 'true')
  await page.getByRole('button', { name: '编辑与补充', exact: true }).click()
  assert(await page.locator('#write-dialog').isVisible())
  assert((await page.locator('#journal-text').inputValue()).includes('今天的心情很轻'))
  await page.getByRole('button', { name: '关闭日记预览' }).click()
  await page.locator('.nav').getByRole('button', { name: '我的', exact: true }).click()
  const memory = page.getByRole('switch', { name: '允许查找旧日记' })
  await memory.click()
  assert.equal(await memory.getAttribute('aria-checked'), 'true')
  result.checks.push('calendar selection, empty state, list-to-detail, edit dialog and preview switch work')
  assert.deepEqual(result.errors, [])
  result.checks.push('no browser JavaScript errors; all existing pet images load')
  result.passed = true
  console.log(`PASS ${result.checks.length} design preview checks`)
} catch (error) { result.passed = false; result.failure = error.stack; throw error }
finally {
  await fs.writeFile(new URL('preview-validation.json', output), JSON.stringify(result, null, 2))
  await browser.close()
}

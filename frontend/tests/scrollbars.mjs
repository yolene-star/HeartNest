import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = process.env.SCROLLBAR_TEST_URL || 'http://127.0.0.1:18081'
const out = '../docs/design/scrollbars'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] })
const page = await browser.newPage({ viewport: { width: 793, height: 871 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
try {
  assert.equal((await (await page.request.get(`${base}/api/health`)).json()).public_demo, true, 'Only mutate the isolated visitor demo')
  await page.goto(base)
  await page.locator('.onboarding-panel').waitFor()
  await page.request.patch(`${base}/api/settings`, { data: { onboarding_complete: true } })
  await page.reload()
  await expect(page.locator('#chat-message')).toBeVisible()
  await page.getByRole('button', { name: '我的', exact: true }).click()
  const content = page.locator('.notebook-page-content')
  await page.waitForTimeout(1200)
  const color = () => content.evaluate(el => getComputedStyle(el).scrollbarColor)
  assert.equal(await color(), 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)', 'idle scrollbar must be transparent')
  const before = await content.boundingBox()
  await content.hover()
  await page.mouse.wheel(0, 180)
  await expect(content).toHaveClass(/is-scrolling/)
  assert.notEqual(await color(), 'rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)')
  await page.screenshot({ path: `${out}/scrolling.png` })
  await expect(content).not.toHaveClass(/is-scrolling/, { timeout: 3000 })
  assert.deepEqual(await content.boundingBox(), before, 'scrollbar appearance must not shift layout')
  await page.screenshot({ path: `${out}/idle.png` })
  // Cover horizontal overflow, nested containers and native textarea scrolling.
  await page.evaluate(() => {
    const fixture = document.createElement('div')
    fixture.id = 'scroll-fixture'
    fixture.style = 'position:fixed;top:150px;left:240px;width:240px;height:180px;overflow:auto;z-index:100;background:white'
    fixture.innerHTML = '<div style="width:600px;height:600px"><textarea style="width:180px;height:80px">' + 'test line\n'.repeat(80) + '</textarea></div>'
    document.body.append(fixture)
  })
  const fixture = page.locator('#scroll-fixture'), textarea = fixture.locator('textarea')
  await fixture.evaluate(el => { el.scrollLeft = 120; el.scrollTop = 20 })
  await expect(fixture).toHaveClass(/is-scrolling/)
  await textarea.evaluate(el => { el.scrollTop = 150 })
  await expect(textarea).toHaveClass(/is-scrolling/)
  await expect(fixture).not.toHaveClass(/is-scrolling/, { timeout: 3000 })
  await expect(textarea).not.toHaveClass(/is-scrolling/, { timeout: 3000 })
  await fixture.evaluate(el => el.remove())
  await page.getByRole('button', { name: '陪伴', exact: true }).click()
  await page.getByRole('button', { name: '打开陪伴工具', exact: true }).click()
  const drawer = page.locator('.companion-drawer-content')
  await page.setViewportSize({ width: 390, height: 520 })
  await drawer.hover()
  await page.mouse.wheel(0, 180)
  await expect(drawer).toHaveClass(/is-scrolling/)
  await expect(drawer).not.toHaveClass(/is-scrolling/, { timeout: 3000 })
  await page.screenshot({ path: `${out}/mobile-drawer.png` })
  assert.deepEqual(errors, [])
  console.log('PASS idle/active/idle, no layout shift, horizontal/nested/textarea and mobile drawer scrolling')
} finally { await browser.close() }

import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = 'http://127.0.0.1:18081', out = '../docs/design/compact-composer'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage(), errors = [], measurements = []
page.on('pageerror', e => errors.push(e.message))
try {
  assert.equal((await (await page.request.get(`${base}/api/health`)).json()).public_demo, true, 'Only mutate the isolated visitor demo')
  await page.request.get(`${base}/api/settings`)
  await page.request.patch(`${base}/api/settings`, { data: { onboarding_complete: true, save_enabled: true } })
  for (const [width, height] of [[1363, 871], [793, 871], [390, 844], [320, 640]]) {
    await page.setViewportSize({ width, height })
    await page.goto(base)
    const composer = page.locator('.composer'), textarea = page.locator('#chat-message')
    await expect(textarea).toBeVisible()
    const box = await composer.boundingBox()
    measurements.push({ width, height, composerHeight: box.height })
    assert(box.height <= 110, `composer ${width}: ${box.height}px should be <=110px`)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    const send = composer.getByRole('button', { name: '发送', exact: true })
    const activity = composer.getByRole('button', { name: '一起找个小活动', exact: true })
    assert((await send.boundingBox()).height >= 44 && (await activity.boundingBox()).height >= 44)
    await textarea.fill('第一行\n第二行\n第三行\n第四行')
    await expect(textarea).toHaveValue('第一行\n第二行\n第三行\n第四行')
    await page.screenshot({ path: `${out}/${width}-collapsed.png` })
    await composer.locator('summary').click()
    await page.getByLabel('同时保存心栖回应').check()
    await composer.locator('summary').click()
    await expect(textarea).toHaveValue('第一行\n第二行\n第三行\n第四行')
    assert.equal((await composer.boundingBox()).height, box.height)
    await textarea.fill('虚拟验收：今天想慢慢聊聊。')
    await send.click()
    await expect(page.getByTestId('assistant-reply')).toHaveCount(1)
    await activity.click()
    await expect(page.locator('.user-message')).toHaveCount(2)
    await expect(page.getByTestId('assistant-reply')).toHaveCount(2)
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(`${out}/result.json`, JSON.stringify({ passed: true, measurements, errors }, null, 2))
  console.log('PASS compact composer, 44px buttons, multiline draft, folded settings and send/activity paths at four widths')
} finally { await browser.close() }

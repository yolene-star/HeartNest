import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080'
const folder = new URL('../../docs/design/emotion-disclosure/', import.meta.url)
await fs.mkdir(folder, { recursive: true })
const before = await (await fetch(`${base}/api/diaries`)).json()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.route('**/api/companion/respond', route => route.fulfill({ json: {
  reply: '嗯，那就好。不用急着做什么，就这样待一会儿也可以。',
  reply_source: 'rules', understanding_source: 'rules',
  emotion_suggestion: { label: '平稳', confidence: 0.7 },
} }))
async function send() {
  await page.locator('#chat-message').fill('我现在觉得很平静，想安静待一会儿。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.locator('.emotion-prompt').last().waitFor()
}
try {
  await page.goto(base)
  for (const width of [390, 785, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.reload()
    await send()
    const prompt = page.locator('.emotion-prompt').last()
    const summary = prompt.locator('summary')
    await summary.waitFor()
    assert.equal(await prompt.getAttribute('open'), null, 'Secondary analysis starts collapsed')
    assert(!(await prompt.getByRole('button', { name: '差不多', exact: true }).isVisible()))
    assert((await prompt.boundingBox()).height <= 48, 'Collapsed analysis must fit a compact row')
    await summary.scrollIntoViewIfNeeded()
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-collapsed.png`, folder)) })
    await summary.focus()
    await page.keyboard.press('Enter')
    await prompt.getByRole('button', { name: '换一个', exact: true }).click()
    await prompt.getByRole('button', { name: '开心', exact: true }).click()
    await page.locator('.emotion-confirmed').last().waitFor()
    await page.locator('.emotion-confirmed').last().getByRole('button', { name: '修改', exact: true }).click()
    await page.getByRole('button', { name: '先跳过', exact: true }).last().click()
    await page.getByRole('button', { name: '重新选择', exact: true }).last().click()
    const restored = page.locator('.emotion-prompt').last()
    if (!(await restored.getAttribute('open') !== null)) await restored.locator('summary').click()
    await restored.getByRole('button', { name: '差不多', exact: true }).click()
    await page.locator('.emotion-confirmed').last().waitFor()
    assert(await page.locator('.emotion-confirmed').last().innerText().then(t => t.includes('平稳')))
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }
  await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
  await page.getByRole('button', { name: '想聊聊', exact: true }).click()
  await send()
  await page.locator('.emotion-prompt').last().locator('summary').click()
  await page.screenshot({ path: fileURLToPath(new URL('lake-expanded.png', folder)) })
  assert.deepEqual(await (await fetch(`${base}/api/diaries`)).json(), before, 'Temporary chat must not persist')
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('results.json', folder), JSON.stringify({ passed: true, widths: [390, 785, 1440], checks: ['compact default', 'keyboard disclosure', 'confirm/edit/skip/reselect', 'shared lake chat', 'no persistent changes'], errors }, null, 2))
  console.log('PASS compact mood disclosure at 390/785/1440, all actions and shared lake chat; no diary changes')
} finally { await browser.close() }

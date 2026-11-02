import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const base = 'http://127.0.0.1:8080'
async function records() {
  return Promise.all(['/diaries', '/profile'].map(async path => {
    const r = await fetch(`${base}/api${path}`)
    assert(r.ok)
    return r.json()
  }))
}
const before = await records()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto(base)
  assert.equal(await page.locator('#chat-message').getAttribute('maxlength'), '4000')
  let calls = 0
  await page.route('**/api/companion/respond', route => ++calls === 1 ? route.fulfill({ status: 503, body: 'controlled test failure' }) : route.continue())
  await page.locator('#chat-message').fill('这是一条虚构演示消息：今天慢慢收拾了桌面，看起来清爽了，想和你分享一下。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '重试回应', exact: true }).click()
  await page.getByTestId('assistant-reply').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.user-turn').count(), 1)
  assert.equal(await page.getByTestId('assistant-reply').count(), 1)
  assert.equal(await page.getByTestId('failed-request').count(), 0)
  const source = page.getByTestId('reply-provenance')
  await source.locator('summary').click()
  await source.scrollIntoViewIfNeeded()
  await page.screenshot({ path: fileURLToPath(new URL('../../docs/design/conversation-reliability/default-conversation.png', import.meta.url)) })
  assert.deepEqual(await records(), before)
  assert.deepEqual(errors, [])
  console.log('PASS default Docker: controlled failure -> actual API retry, one round, source details, stored records preserved')
} finally { await browser.close() }

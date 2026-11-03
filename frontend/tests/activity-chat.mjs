import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = process.env.TEST_URL || 'http://127.0.0.1:8080'
const folder = new URL('../../docs/design/activity-chat/', import.meta.url)
await fs.mkdir(folder, { recursive: true })
const snapshot = async () => Promise.all(['diaries', 'profile'].map(async key => (await fetch(`${base}/api/${key}`)).json()))
const before = await snapshot()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage()
const requests = [], errors = []
page.on('pageerror', e => errors.push(e.message))
await page.route('**/api/companion/respond', async route => {
  const body = route.request().postDataJSON(); requests.push(body)
  await new Promise(resolve => setTimeout(resolve, 250))
  if (body.text.includes('重试验收') && requests.filter(r => r.text === body.text).length === 1) return route.fulfill({ status: 503, body: 'test unavailable' })
  await route.fulfill({ json: { reply: body.text.includes('下午') ? '那我们可以一起考虑下午的安排。你更想安静一点，还是出门走走？' : '好呀，你现在更想安静待着，还是出去透透气？', memories: [], reply_source: 'llm', emotion_suggestion: null } })
})
try {
  for (const width of [1363, 390]) {
    await page.setViewportSize({ width, height: 871 })
    await page.goto(base)
    const entry = page.locator('.composer').getByRole('button', { name: '一起找个小活动', exact: true })
    await entry.waitFor()
    assert.equal(await page.locator('.companion-aside .activity-suggestions').count(), 0)
    assert.equal(await page.locator('.activity-filter').count(), 0)
    await page.locator('#chat-message').fill('还没写完的草稿')
    await entry.click()
    await page.getByTestId('assistant-reply').waitFor()
    await page.waitForFunction(() => !document.querySelector('.typing-state'))
    if (width > 1100) assert(await page.locator('.composer').evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.product-main').getBoundingClientRect().bottom), 'Replies must not scroll the outer paper away from the composer')
    assert.equal(await page.locator('.user-message').count(), 1)
    assert.match(await page.locator('.user-message').textContent(), /小活动/)
    assert.equal(await page.locator('#chat-message').inputValue(), '还没写完的草稿')
    assert.equal(requests.at(-1).want_advice, false, 'Shortcut starts discussion rather than forcing an advice card')
    await page.locator('#chat-message').fill('我只有下午半小时，预算是零元。')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await page.getByTestId('assistant-reply').nth(1).waitFor()
    await page.waitForFunction(() => !document.querySelector('.typing-state'))
    assert(requests.at(-1).conversation.some(turn => turn.role === 'user' && turn.content.includes('小活动')))
    assert.equal(await page.locator('#chat-message').inputValue(), '')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-conversation.png`, folder)) })
  }
  await page.locator('#chat-message').fill('重试验收：继续讨论活动')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByTestId('failed-request').waitFor()
  await page.getByRole('button', { name: '重试回应', exact: true }).click()
  await page.getByTestId('assistant-reply').nth(2).waitFor()
  assert.equal(await page.locator('.user-message').filter({ hasText: '重试验收' }).count(), 1)
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('results.json', folder), JSON.stringify({ passed: true, mode: 'mocked reply for deterministic UI validation, not live model quality', checks: ['shortcut sends a normal chat turn', 'sidebar filter removed', 'draft preserved', 'follow-up carries conversation', 'no-save default preserves data', 'retry without duplicate user turn', 'desktop and mobile screenshots'], errors }, null, 2))
  console.log('PASS conversational activity shortcut, follow-up context, draft, retry, responsive and no-save')
} finally { await browser.close() }

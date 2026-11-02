import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const base = 'http://127.0.0.1:8080'
async function records() {
  return Promise.all(['/diaries', '/profile'].map(async path => {
    const response = await fetch(`${base}/api${path}`)
    assert(response.ok)
    return response.json()
  }))
}
const before = await records()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(base)
  await page.locator('#chat-message').fill('未发送的内容，进出湖边后继续写。')
  await page.getByRole('button', { name: '想放松一下', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '现在更想怎么缓一缓？' })
  await dialog.waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('../../docs/design/relaxation-validation/default-choices.png', import.meta.url)) })
  await dialog.getByRole('button', { name: /去湖边坐坐/ }).click()
  await page.getByTestId('quiet-scene').waitFor()
  await page.getByRole('button', { name: '返回陪伴', exact: true }).click()
  assert.equal(await page.locator('#chat-message').inputValue(), '未发送的内容，进出湖边后继续写。')
  assert.deepEqual(await records(), before)
  console.log('PASS default Docker relaxation entry, lake roundtrip, draft and stored records preserved')
} finally { await browser.close() }

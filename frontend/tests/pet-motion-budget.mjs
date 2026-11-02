import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = 'http://127.0.0.1:8080'
const folder = new URL('../../docs/design/pet-motion-validation/', import.meta.url)
await fs.mkdir(folder, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
const visibleGifs = () => page.locator('.sprite-pet img[src*=".gif"]:visible').count()
const before = await (await fetch(`${base}/api/diaries`)).json()
try {
  const settings = await (await fetch(`${base}/api/settings`)).json()
  for (const pet of ['otter', 'bear', 'rabbit', 'cat', 'dog']) {
    await page.route('**/api/settings', route => route.request().method() === 'GET' ? route.fulfill({ json: { ...settings, pet_id: pet } }) : route.continue())
    await page.goto(base)
    const hero = page.locator('.hero-pet img')
    await hero.waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('.sprite-pet img')].every(img => img.complete && img.naturalWidth > 0))
    assert((await hero.getAttribute('src')).endsWith('/idle-0.png'))
    assert.equal(await page.locator('.conversation-empty .sprite-pet').count(), 0)
    assert.equal(await visibleGifs(), 1, 'Only floating pet should animate on the main page')
    const sample = () => hero.evaluate(img => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      const rect = img.getBoundingClientRect()
      return { pixels: canvas.toDataURL(), x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })
    const first = await sample()
    await page.waitForTimeout(350)
    const second = await sample()
    assert(first.pixels === second.pixels, 'Static hero image pixels must not change over time')
    assert.deepEqual({ ...first, pixels: undefined }, { ...second, pixels: undefined }, 'Static hero position must not move')
    await page.unroute('**/api/settings')
  }
  await page.reload()
  await page.route('**/api/companion/respond', async route => {
    await new Promise(resolve => setTimeout(resolve, 600))
    await route.fulfill({ json: { reply: '那我们就这样安静待一会儿。', emotion_suggestion: { label: '平静' }, reply_source: 'rules' } })
  })
  await page.locator('#chat-message').fill('虚构验收：我想安静待一会儿。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.locator('.pet-dock img[src*="thinking.gif"]').waitFor()
  assert((await page.locator('.hero-pet img').getAttribute('src')).endsWith('/idle-0.png'))
  await page.getByTestId('assistant-reply').waitFor()
  assert((await page.locator('.agent-avatar img').getAttribute('src')).endsWith('/idle-0.png'))
  assert.equal(await visibleGifs(), 1)
  for (const width of [390, 781, 1440]) {
    await page.setViewportSize({ width, height: 871 })
    assert.equal(await visibleGifs(), width <= 650 ? 0 : 1)
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-chat.png`, folder)) })
  }
  const dock = page.getByTestId('pet-dock')
  const start = await dock.boundingBox()
  const bubble = await page.locator('.pet-dock .pet-bubble').boundingBox()
  await page.mouse.move(bubble.x + 15, bubble.y + 15)
  await page.mouse.down(); await page.mouse.move(bubble.x - 35, bubble.y - 25, { steps: 5 }); await page.mouse.up()
  assert((await dock.boundingBox()).x < start.x, 'Floating pet remains draggable')
  await page.getByRole('button', { name: '更换陪伴伙伴', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  assert.equal(await page.locator('.pet-selection img[src*=".gif"]').count(), 0)
  await page.getByRole('button', { name: '关闭选择', exact: true }).click()
  await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
  await page.getByTestId('quiet-scene').waitFor()
  assert.equal(await visibleGifs(), 1, 'Lakeside keeps its single scene companion')
  await page.getByRole('button', { name: '返回陪伴', exact: true }).click()
  assert.equal(await visibleGifs(), 1)
  assert.deepEqual(await (await fetch(`${base}/api/diaries`)).json(), before)
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('results.json', folder), JSON.stringify({ passed: true, pets: 5, checks: ['static hero pixel comparison', 'empty pet removed', 'only dock animates', 'thinking keeps hero still', 'static message/nav/picker avatars', 'dock draggable', 'single lake companion', 'no diary changes'], errors }, null, 2))
  console.log('PASS five pets, only floating pet animates, static image stability, drag/picker/chat/lake round trip')
} finally { await browser.close() }

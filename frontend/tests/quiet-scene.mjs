import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = process.env.TEST_URL || 'http://127.0.0.1:18080'
assert.equal(new URL(base).port, '18080', 'Use the isolated acceptance instance')
const output = new URL('../../docs/design/quiet-scene-validation/', import.meta.url)
await fs.mkdir(output, { recursive: true })
async function api(path, method = 'GET', body) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  assert(r.ok, `${method} ${path}: ${r.status}`)
  return r.json()
}
const settings = await api('/settings')
const before = (await api('/diaries')).items.map(x => x.id).sort()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.addInitScript(() => {
  const Original = window.AudioContext || window.webkitAudioContext
  window.__quietAudioContexts = []
  if (Original) window.AudioContext = class extends Original {
    constructor(...args) { super(...args); window.__quietAudioContexts.push(this) }
  }
})
const errors = [], checks = []
page.on('pageerror', e => errors.push(e.message))
try {
  await api('/settings', 'PATCH', { onboarding_complete: true, pet_id: 'otter', save_enabled: true })
  await page.goto(base)
  await page.locator('#chat-message').fill('还没发出的草稿')
  await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
  const scene = page.getByTestId('quiet-scene')
  await scene.waitFor()
  assert(!(await page.getByTestId('pet-dock').isVisible()))
  assert(!(await page.locator('.primary-nav').isVisible()))
  await page.waitForFunction(() => { const image = document.querySelector('.quiet-background'); return image?.complete && image.naturalWidth > 1000 })
  const sound = page.getByRole('button', { name: '环境声音', exact: true })
  assert.equal(await sound.getAttribute('aria-pressed'), 'false')
  await sound.click()
  await page.getByRole('button', { name: '关闭环境声音', exact: true }).waitFor()
  assert(await page.evaluate(() => window.__quietAudioContexts.at(-1)?.state === 'running'))
  await page.getByRole('button', { name: '关闭环境声音', exact: true }).click()
  await page.waitForFunction(() => window.__quietAudioContexts.at(-1)?.state === 'closed')
  checks.push('real supplied landscape, single companion, silent entry and functional audio toggle')
  await page.getByRole('button', { name: '减少动态', exact: true }).click()
  assert.match(await scene.locator('.quiet-pet img').getAttribute('src'), /\.png/)
  await page.getByRole('button', { name: '陪沐沐坐一会儿' }).click()
  await scene.getByRole('status').filter({ hasText: '在这里' }).waitFor()
  await page.getByRole('button', { name: '换个地方', exact: true }).click()
  await page.getByRole('dialog', { name: '找个地方待会儿' }).waitFor()
  await page.getByRole('button', { name: '湖边发呆，当前场景' }).click()
  await page.getByRole('button', { name: '想聊聊', exact: true }).click()
  assert.equal(await page.locator('#chat-message').inputValue(), '还没发出的草稿')
  await page.locator('#chat-message').fill('在湖边休息一会儿，感觉安静了一些。')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByTestId('assistant-reply').waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: '收起聊天', exact: true }).click()
  await page.getByRole('button', { name: '返回陪伴', exact: true }).click()
  await page.getByTestId('assistant-reply').waitFor()
  assert.deepEqual((await api('/diaries')).items.map(x => x.id).sort(), before)
  checks.push('static motion, pet interaction, scene picker, shared draft and conversation; no automatic save')
  for (const width of [390, 785, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.equal(Math.round((await scene.boundingBox()).width), width, 'Scenery must span the full viewport')
    const pet = await scene.locator('.quiet-pet').boundingBox()
    const toolbar = await scene.locator('.quiet-toolbar').boundingBox()
    assert(pet.x >= 0 && pet.x + pet.width <= width && pet.y + pet.height < toolbar.y)
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-lake.png`, output)) })
    await page.getByRole('button', { name: '想聊聊', exact: true }).click()
    await page.locator('#chat-message').scrollIntoViewIfNeeded()
    assert(await page.locator('.composer button[type=submit]').evaluate(button => { const r = button.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button }))
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-chat.png`, output)) })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '返回陪伴', exact: true }).click()
  }
  checks.push('390/785/1440 scenery and chat fit, pet clear of controls, Escape closes chat')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
  assert.match(await scene.locator('.quiet-pet img').getAttribute('src'), /\.png/)
  await page.getByRole('button', { name: '环境声音', exact: true }).click()
  await page.getByRole('button', { name: '返回陪伴', exact: true }).click()
  await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '环境声音', exact: true }).getAttribute('aria-pressed'), 'false')
  checks.push('system reduced motion and audio stops when leaving')
  await page.getByRole('button', { name: '返回陪伴', exact: true }).click()
  await api('/settings', 'PATCH', { pet_id: 'rabbit' })
  await page.reload()
  await page.getByRole('button', { name: '陪我待会儿', exact: true }).click()
  assert.match(await scene.locator('.quiet-pet img').getAttribute('src'), /\/rabbit\//)
  checks.push('scene uses the selected companion')
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('results.json', output), JSON.stringify({ passed: true, checks, errors }, null, 2))
  console.log(`PASS ${checks.length} quiet companionship scenarios`)
} finally {
  await api('/settings', 'PATCH', settings)
  await browser.close()
}

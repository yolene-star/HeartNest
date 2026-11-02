import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = process.env.TEST_URL || 'http://localhost:8080'
const output = new URL('../../docs/product-regression/', import.meta.url)
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await page.addInitScript(() => {
  localStorage.removeItem('heart-pet')
  localStorage.removeItem('heart-pet-position')
  localStorage.removeItem('heart-onboarding')
})
const errors = []
page.on('pageerror', error => errors.push(error.message))
let createdId
let saveOnlyId
let diaryResponseId
let diaryResponseText
let originalSettings

try {
  await page.goto(base)
  const settingsResponse = await page.request.get(`${base}/api/settings`)
  assert(settingsResponse.ok(), 'settings endpoint is unavailable')
  originalSettings = await settingsResponse.json()
  await page.request.patch(`${base}/api/settings`, { data: { save_enabled: true, memory_enabled: true, onboarding_complete: false } })
  await page.reload()

  await page.locator('.pet-selection').filter({ hasText: '沐沐' }).first().click()
  await page.getByRole('button', { name: '认识 沐沐' }).click()
  await page.getByRole('textbox', { name: '我该怎么称呼你？' }).fill('回环用户')
  await page.getByRole('button', { name: '继续' }).click()
  await page.getByRole('button', { name: '看当时情况' }).click()
  await page.getByRole('checkbox', { name: '允许心栖在聊天时查找旧日记' }).check()
  await page.getByRole('button', { name: '完成设置' }).click()
  await page.getByRole('navigation').getByRole('button', { name: '设置' }).click()
  await page.getByRole('button', { name: '更换伙伴' }).click()
  await page.screenshot({ path: fileURLToPath(new URL('04-pet-picker.png', output)), fullPage: false })
  await page.getByRole('button', { name: /选择 沐沐/ }).click()
  for (const [name, folder] of [['团团', 'bear'], ['绵绵', 'rabbit'], ['绒绒', 'cat'], ['豆豆', 'dog']]) {
    await page.getByRole('button', { name: '更换伙伴' }).click()
    await page.getByRole('button', { name: new RegExp(`选择 ${name}`) }).click()
    const petImage = page.locator(`[data-testid="${folder}-sprite"] img`).first()
    await petImage.waitFor()
    assert.match(await petImage.getAttribute('src'), new RegExp(`/pets/${folder}/idle(?:-|\\.gif)`))
    assert.equal(await petImage.evaluate(image => image.complete && image.naturalWidth > 0), true, `${name} sprite did not load`)
  }
  await page.getByRole('button', { name: '更换伙伴' }).click()
  await page.getByRole('button', { name: /选择 沐沐/ }).click()
  await page.getByRole('navigation').getByRole('button', { name: '陪伴' }).click()
  await page.screenshot({ path: fileURLToPath(new URL('01-companion-home.png', output)), fullPage: true })
  await page.getByRole('navigation').getByRole('button', { name: '日历' }).click()
  await page.getByRole('heading', { name: '心情日历' }).waitFor()
  assert.equal(await page.locator('.calendar-grid').count(), 1)
  await page.screenshot({ path: fileURLToPath(new URL('05-mood-calendar.png', output)), fullPage: false })

  await page.getByRole('navigation').getByRole('button', { name: '日记' }).click()
  await page.getByLabel('写一篇新的日记').fill('今天想把这段感受慢慢写下来。回归日记回应 EC-20261101')
  await page.getByRole('radio', { name: '需要回应' }).check()
  await page.getByRole('button', { name: '先听听心栖回应' }).click()
  const diaryPreview = page.getByTestId('diary-response-preview')
  await diaryPreview.waitFor()
  assert.ok((await diaryPreview.textContent()).trim().length > 20, 'diary response preview was empty')
  await page.screenshot({ path: fileURLToPath(new URL('01c-diary-response.png', output)), fullPage: false })
  const diaryResponse = page.waitForResponse(response => response.url().endsWith('/api/diaries') && response.request().method() === 'POST')
  await diaryPreview.getByRole('button', { name: '保存这篇日记' }).click()
  const diaryResponseBody = await (await diaryResponse).json()
  diaryResponseId = diaryResponseBody.id
  diaryResponseText = diaryResponseBody.response_text
  await page.getByText(/心栖回应/).last().waitFor()
  await page.getByRole('navigation').getByRole('button', { name: '陪伴' }).click()
  await page.getByRole('radio', { name: '需要回应' }).check()
  await page.getByPlaceholder('今天有什么想和我说的？').fill('你还记得回归日记回应 EC-20261101 吗？')
  await page.getByRole('button', { name: '发送' }).click()
  await page.getByText(/心栖当时回应/).first().waitFor()
  assert.match(await page.locator('.memory-citations').textContent(), new RegExp(diaryResponseText.slice(0, 8)))

  await page.getByRole('button', { name: '聊聊', exact: true }).click()
  await page.getByRole('radio', { name: '仅保存' }).check()
  await page.screenshot({ path: fileURLToPath(new URL('01b-send-mode.png', output)), fullPage: false })
  const assistantCountBeforeSaveOnly = await page.getByTestId('assistant-reply').count()
  await page.getByPlaceholder('今天有什么想和我说的？').fill('最近事情堆在一起，我有点慌。回归编号 EC-20261031')
  const saveOnlyResponse = page.waitForResponse(response => response.url().endsWith('/api/diaries') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '发送' }).click()
  saveOnlyId = (await (await saveOnlyResponse).json()).id
  await page.getByText('已保存这段话，不需要回应。').waitFor()
  assert.equal(await page.getByTestId('assistant-reply').count(), assistantCountBeforeSaveOnly, 'save-only mode unexpectedly generated a reply')

  await page.getByRole('radio', { name: '需要回应' }).check()
  await page.getByPlaceholder('今天有什么想和我说的？').fill('最近事情堆在一起，我有点慌。回归编号 EC-20261031-respond')
  await page.getByRole('button', { name: '发送' }).click()
  const firstReply = page.getByTestId('assistant-reply').last()
  await firstReply.waitFor()
  const firstReplyText = await firstReply.textContent()
  assert.ok(firstReplyText.trim().length >= 8, 'LLM reply was unexpectedly empty')
  assert.equal(await page.locator('[data-testid="advice-card"]').count(), 0, 'advice was pushed without consent')

  await page.getByRole('button', { name: '给我一个小建议' }).click()
  const advice = page.locator('[data-testid="advice-card"]')
  await advice.waitFor()
  assert.match(await advice.textContent(), /回到当下/)
  await advice.getByRole('button', { name: '依据与适用范围' }).click()
  assert.match(await advice.textContent(), /World Health Organization/)
  await page.screenshot({ path: fileURLToPath(new URL('02-evidence-based-advice.png', output)), fullPage: false })
  await advice.getByRole('button', { name: '先不用' }).click()
  await advice.getByRole('status').filter({ hasText: '这次先不做' }).waitFor()

  const saveResponse = page.waitForResponse(response => response.url().endsWith('/api/diaries') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '保存我的原话' }).click()
  const created = await (await saveResponse).json()
  createdId = created.id

  await page.getByRole('navigation').getByRole('button', { name: '日记' }).click()
  await page.getByText(/回归编号 EC-20261031/).first().waitFor()
  await page.getByRole('button', { name: '打开日记' }).first().click()
  await page.getByRole('button', { name: '编辑记录' }).click()
  const editedText = '编辑后的回归日记 EC-20261031'
  await page.getByLabel('日记原文').fill(editedText)
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByLabel('后来想补充什么？').fill('后来补充：我和朋友聊过之后轻松了一点。')
  await page.getByRole('button', { name: '添加补充' }).click()
  await page.getByText(/后来补充：我和朋友聊过之后轻松了一点/).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  const addendumButton = page.getByRole('button', { name: '添加补充' })
  await addendumButton.scrollIntoViewIfNeeded()
  const geometry = await page.evaluate(() => {
    const button = document.querySelector('.later-notes button')
    const dock = document.querySelector('[data-testid="pet-dock"]')
    const a = button.getBoundingClientRect(), b = dock.getBoundingClientRect()
    const sprite = dock.querySelector('.sprite-pet')
    const frame = sprite?.querySelector('img')
    const frameBox = frame?.getBoundingClientRect(), spriteBox = sprite?.getBoundingClientRect()
    return { overlap: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, dockClass: dock.className, dockInsideViewport: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, spriteFrameFits: !frameBox || (frameBox.width <= spriteBox.width && frameBox.height <= spriteBox.height) }
  })
  assert.match(geometry.dockClass, /diary-page-dock/)
  assert.equal(geometry.overlap, false, 'mobile pet dock obscures the diary save action')
  assert.equal(geometry.dockInsideViewport, true, 'mobile pet dock is clipped outside the viewport')
  assert.equal(geometry.spriteFrameFits, true, 'mobile pet artwork is clipped by its frame')
  await page.screenshot({ path: fileURLToPath(new URL('03-mobile-diary-detail.png', output)), fullPage: false })

  await page.getByRole('navigation').getByRole('button', { name: '设置' }).click()
  const memoryToggle = page.getByRole('switch', { name: '允许心栖在聊天时查找旧日记' })
  const saveToggle = page.getByRole('switch', { name: '保存我之后写下的内容' })
  assert(await memoryToggle.isVisible())
  assert(await saveToggle.isVisible())
  assert.equal(await memoryToggle.getAttribute('aria-checked'), 'true')
  assert.equal(await saveToggle.getAttribute('aria-checked'), 'true')
  const listenPreference = page.getByRole('button', { name: '先听我说', exact: true })
  await listenPreference.click()
  await expectPressed(listenPreference)
  assert.equal((await (await page.request.get(`${base}/api/settings`)).json()).response_preference, 'listen_first')
  assert.deepEqual(errors, [])
  console.log('PASS onboarding -> chat -> advice feedback -> diary edit/addendum -> mobile dock clearance -> privacy and preference settings')
} finally {
  if (createdId) await page.request.delete(`${base}/api/diaries/${createdId}`)
  if (saveOnlyId) await page.request.delete(`${base}/api/diaries/${saveOnlyId}`)
  if (diaryResponseId) await page.request.delete(`${base}/api/diaries/${diaryResponseId}`)
  if (originalSettings) await page.request.patch(`${base}/api/settings`, { data: originalSettings })
  await browser.close()
}

async function expectPressed(locator) {
  await expect(locator).toHaveAttribute('aria-pressed', 'true')
}


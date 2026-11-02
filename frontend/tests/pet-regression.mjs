import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = process.env.TEST_URL || 'http://localhost:8080'
const output = new URL('../../docs/pet-regression/', import.meta.url)
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await page.addInitScript(() => localStorage.clear())
const errors = []
page.on('pageerror', error => errors.push(error.message))
let createdId
try {
  await page.goto(base)
  await page.getByRole('button').filter({ hasText: '让 沐沐 陪我' }).click()
  const pet = page.locator('.pet-dock .sprite-pet-frame img')
  async function visibleState(state, shot) {
    await page.waitForFunction(expected => {
      const img = document.querySelector('.pet-dock .sprite-pet-frame img')
      if (!img?.src.includes(`/${expected}-`) || !img.complete || !img.naturalWidth) return false
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data.filter((v, i) => i % 4 === 3 && v > 40).length > 1000
    }, state)
    assert(await pet.isVisible())
    const box = await pet.boundingBox()
    const viewport = page.viewportSize()
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height)
    await page.screenshot({ path: fileURLToPath(new URL(`${shot}.png`, output)), fullPage: true })
    console.log(`PASS ${shot}: ${state}, visible pet within viewport`)
  }
  await visibleState('idle', '01-idle')
  const dockBeforeDrag = await page.locator('[data-testid="pet-dock"]').boundingBox()
  await page.locator('[data-testid="pet-dock"]').hover()
  await page.mouse.move(dockBeforeDrag.x + 40, dockBeforeDrag.y + 40)
  await page.mouse.down()
  await page.mouse.move(900, 120)
  await page.mouse.up()
  const dockAfterDrag = await page.locator('[data-testid="pet-dock"]').boundingBox()
  console.log('drag coordinates', { before: dockBeforeDrag, after: dockAfterDrag })
  assert(Math.abs(dockAfterDrag.x - dockBeforeDrag.x) > 80 && Math.abs(dockAfterDrag.y - dockBeforeDrag.y) > 40)
  await page.screenshot({ path: fileURLToPath(new URL('01-dragged.png', output)), fullPage: true })
  console.log('drag screenshot complete')
  if (process.env.DRAG_ONLY) {
    await fs.writeFile(new URL('drag-result.json', output), JSON.stringify({ before: dockBeforeDrag, after: dockAfterDrag, passed: true }, null, 2))
    console.log('PASS drag-only regression')
    await browser.close()
    process.exit(0)
  }
  // Check every deployed frame, including states not currently exposed by the UI.
  const frameCounts = await page.evaluate(async () => {
    const result = {}
    for (const state of ['idle','listening','thinking','comforting','encouraging','resting']) {
      result[state] = []
      for (let i = 0; i < 8; i++) {
        const img = new Image(); img.src = `/pets/mumu/${state}-${i}.png`; await img.decode()
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
        result[state].push(ctx.getImageData(0,0,c.width,c.height).data.filter((v,j)=>j%4===3 && v>40).length)
      }
    }
    return result
  })
  assert(Object.values(frameCounts).flat().every(count => count > 1000), JSON.stringify(frameCounts))
  console.log('frame assets complete')
  await page.locator('.side-item').filter({ hasText: '记录' }).click()
  await page.locator('.write-card textarea').waitFor()
  await page.locator('.write-card textarea').fill('回归测试：今天有点累，希望安静地休息一下。')
  console.log('after first fill')
  await visibleState('listening', '02-typing')
  await page.locator('.write-card textarea').fill('')
  await visibleState('idle', '03-cleared')
  await page.locator('.write-card textarea').fill('自动回归测试记录，测试完成后删除。')
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/diaries', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    await gate
    const response = await route.fetch()
    createdId = (await response.json()).id
    await route.fulfill({ response })
  })
  await page.getByRole('button', { name: '保存这段记录' }).click()
  try { await visibleState('thinking', '04-saving') } finally { release() }
  await visibleState('encouraging', '05-saved')
  await page.locator('.write-card textarea').fill('保存后再次输入')
  await visibleState('listening', '06-type-again')
  await page.locator('.side-item').filter({ hasText: '今日' }).click()
  await visibleState('encouraging', '07-navigate')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.side-item').filter({ hasText: '记录' }).click()
  const saveButton = page.getByRole('button', { name: '保存这段记录' })
  const petBox = await page.locator('.pet-dock').boundingBox()
  const saveBox = await saveButton.boundingBox()
  assert(petBox.x + petBox.width <= saveBox.x || petBox.x >= saveBox.x + saveBox.width ||
    petBox.y + petBox.height <= saveBox.y || petBox.y >= saveBox.y + saveBox.height,
    `mobile pet overlaps save button: pet=${JSON.stringify(petBox)} save=${JSON.stringify(saveBox)}`)
  await saveButton.scrollIntoViewIfNeeded()
  await saveButton.click()
  await page.getByRole('status').waitFor()
  await page.waitForTimeout(450)
  const toastBox = await page.getByRole('status').boundingBox()
  const petAfterSave = await page.locator('.pet-dock').boundingBox()
  const evidenceBox = await page.locator('.evidence-card').boundingBox()
  assert(petAfterSave.x + petAfterSave.width <= toastBox.x || petAfterSave.x >= toastBox.x + toastBox.width ||
    petAfterSave.y + petAfterSave.height <= toastBox.y || petAfterSave.y >= toastBox.y + toastBox.height,
    `mobile pet overlaps save confirmation: pet=${JSON.stringify(petAfterSave)} toast=${JSON.stringify(toastBox)}`)
  assert(toastBox.y + toastBox.height <= evidenceBox.y || toastBox.y >= evidenceBox.y + evidenceBox.height ||
    toastBox.x + toastBox.width <= evidenceBox.x || toastBox.x >= evidenceBox.x + evidenceBox.width,
    `save confirmation overlaps following content: toast=${JSON.stringify(toastBox)} evidence=${JSON.stringify(evidenceBox)}`)
  await page.locator('.write-card textarea').fill('移动端保存后的再次输入')
  await visibleState('listening', '08-mobile-typing')
  await saveButton.scrollIntoViewIfNeeded()
  await page.screenshot({ path: fileURLToPath(new URL('09-mobile-layout.png', output)), fullPage: true })
  assert.deepEqual(errors, [])
  await fs.writeFile(new URL('result.json', output), JSON.stringify({ base, frameCounts, browserErrors: errors, passed: true }, null, 2))
  console.log('PASS complete browser regression loop; 48 deployed frames checked')
} finally {
  if (createdId) {
    const response = await page.request.delete(`${base}/api/diaries/${createdId}`)
    assert(response.ok(), 'Test diary cleanup failed')
  }
  await browser.close()
}

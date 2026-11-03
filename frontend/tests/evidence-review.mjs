import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const videoURL = new URL('../../docs/demo/heartnest-demo.webm', import.meta.url)
  await page.goto(videoURL.href)
  await page.waitForFunction(() => { const v = document.querySelector('video'); return v && Number.isFinite(v.duration) && v.duration > 0 })
  const video = page.locator('video')
  const duration = await video.evaluate(v => { v.pause(); v.controls = false; return v.duration })
  const manifest = JSON.parse(await fs.readFile(new URL('../../docs/demo/recording.json', import.meta.url), 'utf8'))
  assert(manifest.passed && duration > 5, `Recording must decode and its complete operation flow must have passed: ${duration}s`)
  for (const [index, fraction] of [0.15, 0.5, 0.85].entries()) {
    await video.evaluate((v, target) => new Promise(resolve => { v.addEventListener('seeked', resolve, { once: true }); v.currentTime = target }), duration * fraction)
    await video.screenshot({ path: fileURLToPath(new URL(`../../docs/demo/review-${index + 1}.png`, import.meta.url)) })
  }
  await fs.writeFile(new URL('../../docs/demo/video-review.json', import.meta.url), JSON.stringify({ passed: true, duration_seconds: duration, decoded_sample_frames: 3 }, null, 2))
  for (const model of ['LogisticRegression', 'LinearSVC']) {
    const svg = new URL(`../../docs/public-classification/${model}-confusion.svg`, import.meta.url)
    await page.goto(svg.href)
    await page.locator('svg').screenshot({ path: fileURLToPath(new URL(`../../docs/public-classification/${model}-confusion.png`, import.meta.url)) })
  }
  console.log(`PASS: ${duration.toFixed(1)}s video decodes and both confusion matrices render`)
} finally { await browser.close() }

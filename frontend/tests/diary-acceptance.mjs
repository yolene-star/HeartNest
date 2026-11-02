import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../../', import.meta.url))
const live = process.argv.includes('--llm')
const externalBase = process.env.TEST_URL
const output = path.join(root, process.env.TEST_OUTPUT_DIR || (live ? 'docs/diary-acceptance-llm' : 'docs/diary-acceptance'))
const runtime = path.join(root, 'data/runtime/diary-acceptance')
await fs.mkdir(output, { recursive: true })
await fs.mkdir(runtime, { recursive: true })
const diaries = JSON.parse(await fs.readFile(path.join(root, 'data/synthetic_diaries.json'), 'utf8'))
const base = externalBase || 'http://127.0.0.1:18001'
const result = { mode: externalBase ? (live ? 'docker-live-llm' : 'external-api') : 'local-offline-real-api', started_at: new Date().toISOString(), checks: [], samples: [], page_errors: [] }
if (live && !externalBase) throw new Error('Live acceptance requires TEST_URL pointing at an isolated configured instance')
const backend = externalBase ? null : spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '18001'], {
  cwd: path.join(root, 'backend'), windowsHide: true,
  env: { ...process.env, PYTHONPATH: path.join(root, '.deps'), COMPANION_DB: path.join(runtime, `${Date.now()}.sqlite3`), LLM_ENABLED: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let backendLog = ''
backend?.stderr.on('data', data => { backendLog += data })
backend?.stdout.on('data', data => { backendLog += data })
let server, browser
async function api(endpoint, method = 'GET', body) {
  const response = await fetch(`${base}/api${endpoint}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) })
  assert(response.ok, `${method} ${endpoint}: ${response.status}`)
  return response.json()
}
async function check(name, action) {
  try { await action(); result.checks.push({ name, passed: true }); console.log(`PASS ${name}`) }
  catch (error) { result.checks.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`) }
}
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { await api('/health'); break } catch (error) { if (attempt === 79) throw error; await new Promise(resolve => setTimeout(resolve, 250)) }
  }
  assert.equal((await api('/diaries')).items.length, 0, 'Acceptance database must start empty')
  await api('/settings', 'PATCH', { onboarding_complete: true, memory_enabled: true })
  for (const sample of diaries) {
    const analysis = await api('/analyze/emotion', 'POST', { text: sample.text })
    const reply = await api('/companion/respond', 'POST', { text: sample.text })
    const saved = await api('/diaries', 'POST', { text: sample.text, kind: 'diary', mode: 'save', recorded_at: `${sample.date}T18:00:00`, allow_retrieval: sample.allow_retrieval })
    await api(`/diaries/${saved.id}/emotion`, 'PATCH', { label: sample.emotion_label, status: 'confirmed' })
    result.samples.push({ source_id: sample.id, id: saved.id, expected: sample.emotion_label, predicted: analysis.label, analysis_source: analysis.analysis_source, reason: analysis.reason, intent: reply.intent, understanding_source: reply.understanding_source, reply: reply.reply, llm_used: reply.llm_used, date: sample.date })
    console.log(`SAMPLE ${sample.id}: ${analysis.label}, ${analysis.analysis_source}, ${reply.intent}, reply_llm=${reply.llm_used}`)
  }
  await check('8 diary texts and dates preserved', async () => {
    const saved = (await api('/diaries')).items
    for (const sample of diaries) assert(saved.some(item => item.text === sample.text && item.recorded_at.startsWith(sample.date)))
  })
  await check('positive diary recognition', async () => {
    for (const item of result.samples.filter(item => ['开心', '积极'].includes(item.expected))) assert(['开心', '积极'].includes(item.predicted), JSON.stringify(item))
  })
  await check('all diary emotions match reviewed meaning', async () => {
    const normalize = label => ({ '积极': '开心', '平静': '平稳' }[label] || label)
    const mismatches = result.samples.filter(item => normalize(item.expected) !== normalize(item.predicted))
    assert.equal(mismatches.length, 0, `Mismatched samples: ${mismatches.map(item => item.source_id).join(', ')}`)
  })
  await check('diary narration is not treated as a history request', async () => {
    const redirected = result.samples.filter(item => item.intent !== 'share')
    assert.equal(redirected.length, 0, `Unexpected history replies: ${redirected.map(item => item.source_id).join(', ')}`)
  })
  if (live) await check('all analyses and replies actually use llm', async () => {
    assert(result.samples.every(item => item.analysis_source === 'llm' && item.understanding_source === 'llm' && item.llm_used))
  })
  await check('calendar uses confirmed labels', async () => {
    const calendar = await api('/calendar?year=2026&month=11')
    for (const sample of result.samples.filter(item => item.date.startsWith('2026-11'))) assert(calendar.days.some(day => day.date === sample.date && day.emotions.includes(sample.expected)))
  })
  await check('related memory contains source and date', async () => {
    const found = await api('/memories/search', 'POST', { query: '操场水果', top_k: 3 })
    assert(found.items.some(item => item.id === result.samples[6].id && item.text === diaries[6].text && item.recorded_at.startsWith(diaries[6].date)))
  })
  await check('unrelated memory is empty', async () => {
    assert.equal((await api('/memories/search', 'POST', { query: '火星餐厅' })).items.length, 0)
  })
  await check('memory off prevents citations', async () => {
    await api('/settings', 'PATCH', { memory_enabled: false })
    assert.equal((await api('/companion/respond', 'POST', { text: '你还记得之前操场水果吗？' })).memories.length, 0)
    await api('/settings', 'PATCH', { memory_enabled: true })
  })
  if (!externalBase) {
    server = await createServer({ configFile: false, root: path.join(root, 'frontend'), plugins: [react()], server: { host: '127.0.0.1', port: 15173, strictPort: true, proxy: { '/api': base } } })
    await server.listen()
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', error => result.page_errors.push(error.message))
  await page.goto(externalBase || 'http://127.0.0.1:15173')
  if (live) await check('browser can share happiness with llm', async () => {
    await page.locator('#chat-message').fill('以前我会马上担心下一件事，今天展示完成了，我真的很开心，想和你分享。')
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/companion/respond') && response.request().method() === 'POST', { timeout: 60000 })
    await page.getByRole('button', { name: '发送', exact: true }).click()
    const response = await (await responsePromise).json()
    assert.equal(response.intent, 'share')
    assert.equal(response.understanding_source, 'llm')
    assert.equal(response.llm_used, true)
    await page.getByText(response.reply, { exact: true }).waitFor()
    result.browser_reply = response.reply
    await page.screenshot({ path: path.join(output, '00-positive-chat.png'), fullPage: true })
  })
  await check('positive calendar and full diary visible', async () => {
    await page.getByRole('button', { name: '日记', exact: true }).click()
    await page.locator('.calendar-toolbar strong').filter({ hasText: '2026 年 11 月' }).waitFor()
    await page.locator('.calendar-cell').filter({ has: page.locator('.calendar-number', { hasText: /^9$/ }) }).click()
    await page.locator('.calendar-diary p').filter({ hasText: diaries[6].text }).waitFor()
    await page.screenshot({ path: path.join(output, '01-positive-calendar.png'), fullPage: true })
  })
  await check('edit and addendum persist after reload', async () => {
    await page.getByRole('button', { name: '日记', exact: true }).click()
    await page.getByRole('tab', { name: '日记列表' }).click()
    await page.getByRole('textbox', { name: '搜索日记' }).fill('今天终于把拖了几天')
    await page.getByRole('button', { name: '打开日记', exact: true }).click()
    await page.getByRole('button', { name: '编辑记录', exact: true }).click()
    const edited = diaries[6].text + '\n验收补充：今天很开心。'
    await page.getByRole('textbox', { name: '日记原文', exact: true }).fill(edited)
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await page.locator('.entry-original').filter({ hasText: edited }).waitFor()
    await page.getByRole('textbox', { name: '后来想补充什么？', exact: true }).fill('验收追加：想把这份快乐留住。')
    await page.getByRole('button', { name: '添加补充', exact: true }).click()
    await page.locator('.addendum').filter({ hasText: '验收追加：想把这份快乐留住。' }).waitFor()
    await page.screenshot({ path: path.join(output, '02-edited-diary.png'), fullPage: true })
    await page.reload()
    const item = (await api('/diaries')).items.find(item => item.id === result.samples[6].id)
    assert.equal(item.text, edited)
    assert.equal(item.addenda.at(-1).text, '验收追加：想把这份快乐留住。')
  })
  await check('mobile calendar fits viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '日记', exact: true }).click()
    await page.locator('.calendar-toolbar strong').waitFor()
    await page.screenshot({ path: path.join(output, '03-mobile-calendar.png'), fullPage: true })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow')
  })
  await check('deleted diary leaves search and calendar', async () => {
    const id = result.samples[6].id
    await api(`/diaries/${id}`, 'DELETE')
    assert(!(await api('/memories/search', 'POST', { query: '操场水果' })).items.some(item => item.id === id))
    assert(!(await api('/calendar?year=2026&month=11')).days.some(day => day.diaries.some(item => item.id === id)))
  })
  await check('no browser exceptions', async () => assert.deepEqual(result.page_errors, []))
} catch (error) { result.fatal = error.stack; console.error(error) }
finally {
  await browser?.close()
  await server?.close()
  backend?.kill()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2))
  await fs.writeFile(path.join(output, 'backend.log'), backendLog)
}
if (result.fatal || result.checks.some(check => !check.passed)) process.exitCode = 1

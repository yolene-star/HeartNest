import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const out='../docs/design/composer-settings',base='http://127.0.0.1:8080'
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage()
const snapshot=async()=>Promise.all(['diaries','profile'].map(async k=>(await fetch(`${base}/api/${k}`)).json()))
const before=await snapshot(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/api/companion/respond',route=>route.fulfill({json:{reply:'我在听，可以慢慢说。',reply_source:'llm',memories:[]}}))
try{
 for(const [width,height] of [[1363,871],[793,871],[390,871],[1363,650]]){
  await page.setViewportSize({width,height});await page.goto(base)
  const settings=page.locator('.composer-settings'),summary=settings.locator('summary')
  await summary.waitFor()
  assert.equal(await settings.evaluate(el=>el.open),false)
  assert.equal(await page.getByLabel('同时保存心栖回应').isVisible(),false)
  assert.match(await summary.textContent(),/不保存/)
  assert((await page.locator('.composer').boundingBox()).height<180,'Default composer should be compact')
  await page.locator('#chat-message').fill('虚构界面测试，未发送草稿')
  await page.screenshot({path:`${out}/${width}-${height}-collapsed.png`})
  await summary.click()
  await page.getByLabel('同时保存心栖回应').check()
  await page.getByRole('radio',{name:'保存到 Agent 记忆库',exact:true}).check()
  await summary.click()
  assert.match(await summary.textContent(),/原话和回应/)
  assert.equal(await page.locator('#chat-message').inputValue(),'虚构界面测试，未发送草稿')
  await summary.click()
  assert(await page.getByLabel('同时保存心栖回应').isChecked())
  assert(await page.getByRole('radio',{name:'保存到 Agent 记忆库',exact:true}).isChecked())
  await page.getByRole('radio',{name:'不保存',exact:true}).check()
  await page.screenshot({path:`${out}/${width}-${height}-expanded.png`})
  await summary.click()
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await page.getByTestId('assistant-reply').waitFor()
  await page.waitForFunction(()=>!document.querySelector('.typing-state'))
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 }
 assert.deepEqual(await snapshot(),before);assert.deepEqual(errors,[])
 await fs.writeFile(`${out}/results.json`,JSON.stringify({passed:true,checks:['collapsed by default','compact composer at four viewports','expand/change/collapse retains settings and draft','summary shows active save choice','no-save chat still replies without persisting'],errors},null,2))
 console.log('PASS folded chat settings, save choice summary, draft and no-save behavior at four viewports')
}finally{await browser.close()}

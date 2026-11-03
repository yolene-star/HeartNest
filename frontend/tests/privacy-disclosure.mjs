import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base='http://127.0.0.1:18081',out='../docs/design/privacy-disclosure'
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),errors=[],checks=[]
page.on('pageerror',e=>errors.push(e.message))
try {
  assert.equal((await (await page.request.get(`${base}/api/health`)).json()).public_demo, true, 'Only mutate the isolated visitor demo')
 await page.request.get(`${base}/api/settings`)
 await page.request.patch(`${base}/api/settings`,{data:{onboarding_complete:true}})
 for(const [width,height] of [[1363,871],[568,871],[390,844]]){
  await page.setViewportSize({width,height});await page.goto(base)
  await page.getByRole('button',{name:'我的',exact:true}).click()
  const disclosure=page.locator('.privacy-boundaries')
  await expect(disclosure).toBeVisible()
  assert.equal(await disclosure.getAttribute('open'),null)
  await disclosure.locator('summary').click()
  await expect(disclosure).toContainText('不保存聊天，不等于不使用云端模型')
  await expect(disclosure).toContainText('单独确认资料和提交反馈仍会保存对应内容')
  await expect(disclosure).toContainText('不会清除已出现在当前聊天里的引用')
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  const overflow=await disclosure.evaluate(el=>[el,...el.querySelectorAll('summary,p')].some(n=>n.scrollWidth>n.clientWidth+1))
  assert.equal(overflow,false)
  await disclosure.scrollIntoViewIfNeeded()
  await page.screenshot({path:`${out}/${width}-expanded.png`})
  await disclosure.locator('summary').click()
  await expect(disclosure.locator('p').first()).toBeHidden()
  checks.push({width,height,foldedByDefault:true,expandedTextFits:true})
 }
 assert.deepEqual(errors,[])
 await fs.writeFile(`${out}/results.json`,JSON.stringify({passed:true,checks,errors},null,2))
 console.log('PASS privacy disclosure default folded, expanded copy, collapse and no overflow at three widths')
}finally{await browser.close()}

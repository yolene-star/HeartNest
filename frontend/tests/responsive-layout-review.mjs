import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base='http://127.0.0.1:18081',out='../docs/design/responsive-layout-review'
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),errors=[],checks=[]
page.on('pageerror',e=>errors.push(e.message))
try{
  assert.equal((await (await page.request.get(`${base}/api/health`)).json()).public_demo, true, 'Only mutate the isolated visitor demo')
 await page.request.get(`${base}/api/settings`)
 await page.request.patch(`${base}/api/settings`,{data:{onboarding_complete:true}})
 for(const [width,height] of [[568,871],[1640,900],[1920,1080],[2560,1440],[1363,871],[793,871],[1363,650],[793,650],[390,844],[320,640]]){
  await page.setViewportSize({width,height});await page.goto(base)
  await expect(page.locator('#chat-message')).toBeVisible()
  const main=await page.locator('.notebook-page-content').boundingBox(),view=await page.locator('.companion-view').boundingBox()
  const gap=main.x+main.width-view.x-view.width
  await page.screenshot({path:`${out}/${width}-${height}-before-or-result.png`})
  assert(gap<=8,`${width}: content leaves ${gap}px unused on the right`)
  const hero=await page.locator('.welcome-strip').boundingBox(),title=await page.locator('.welcome-strip h1').boundingBox()
  if(width<=650){
   const buttons=await page.locator('.welcome-actions button').all()
   let previous=null
   for(const button of buttons){
    const box=await button.boundingBox()
    if(previous) assert(box.x-previous.x-previous.width<=14,`${width}: welcome actions must stay grouped`)
    previous=box
   }
  }
  for(const button of await page.locator('.welcome-actions button').all()){
   const box=await button.boundingBox()
   assert(box.x>=hero.x&&box.x+box.width<=hero.x+hero.width&&box.y+box.height<=hero.y+hero.height,`${width}: welcome action must fit the hero`)
   assert(box.x>=title.x+title.width || box.x+box.width<=title.x || box.y>=title.y+title.height || box.y+box.height<=title.y,`${width}: welcome action must not overlap title`)
  }
  const notice=page.locator('.public-demo-notice')
  await notice.locator('summary').click()
  const text=await notice.locator('p').boundingBox(),noticeBox=await notice.boundingBox()
  assert(text.width>=noticeBox.width-10,`${width}: expanded notice should follow paper width`)
  await page.screenshot({path:`${out}/${width}-${height}-notice.png`})
  await notice.locator('summary').click()
  const settings=page.locator('.composer-settings')
  await settings.locator('summary').click()
  await page.getByRole('radio',{name:'保存到 Agent 记忆库',exact:true}).check()
  await page.getByLabel('同时保存心栖回应').check()
  await expect(page.getByRole('region',{name:'聊天保存设置'})).toBeVisible()
  await page.screenshot({path:`${out}/${width}-${height}-settings-open.png`})
  await settings.locator('summary').click()
  const clipped=await settings.locator('summary').evaluate(el=>[el,...el.querySelectorAll('span')].filter(node=>node.scrollWidth>node.clientWidth+1).map(node=>({text:node.textContent,width:node.clientWidth,scroll:node.scrollWidth})))
  assert.deepEqual(clipped,[],`${width}: folded setting text must not be clipped`)
  await page.screenshot({path:`${out}/${width}-${height}-settings-collapsed.png`})
  // Restore no-save before testing actual chat paths.
  await settings.locator('summary').click();await page.getByRole('radio',{name:'不保存',exact:true}).check();await settings.locator('summary').click()
  await page.locator('#chat-message').fill('虚构布局验收：今天有些疲惫。')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  const reply=page.getByTestId('assistant-reply').last()
  await expect(reply).toBeVisible()
  await reply.locator('.reply-provenance summary').click()
  await reply.locator('.emotion-prompt summary').click()
  await expect(reply.locator('.emotion-prompt-body')).toBeVisible()
  await page.screenshot({path:`${out}/${width}-${height}-reply-details.png`})
  await page.locator('#chat-message').fill('从今天开始你要叫我小禾')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  const proposal=page.getByRole('region',{name:'个人资料更新确认'}).last()
  await expect(proposal).toBeVisible()
  await proposal.locator('summary').click()
  const overflows=await proposal.evaluate(el=>[el,...el.querySelectorAll('summary,p,blockquote')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.tagName))
  assert.deepEqual(overflows,[],`${width}: expanded profile source text must fit`)
  await page.screenshot({path:`${out}/${width}-${height}-profile-source.png`})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow')
  for(const name of ['日记','回顾','我的']){
   await page.getByRole('button',{name,exact:true}).click()
   const footer=await page.locator('.notebook-page-footer').boundingBox()
   assert(footer.y+footer.height<=height,`${name} footer must remain visible`)
  }
  checks.push({width,height,rightGap:gap,foldedTextClipped:false})
 }
 assert.deepEqual(errors,[])
 await fs.writeFile(`${out}/results.json`,JSON.stringify({passed:true,checks,errors},null,2))
 console.log('PASS paper-width content, grouped welcome controls, expanded/folded text, settings, reply details and all-page footers at ten viewports')
}finally{await browser.close()}

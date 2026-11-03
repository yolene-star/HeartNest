import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base='http://127.0.0.1:18081',out='../docs/design/chat-avatars'
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),checks=[],errors=[]
page.on('pageerror',e=>errors.push(e.message))
async function avatar(turn){
 await turn.scrollIntoViewIfNeeded()
 const frame=turn.locator('.agent-avatar')
 await expect(frame).toBeVisible()
 assert(await frame.locator('img').evaluate(async img=>{await img.decode();return img.naturalWidth>0}))
 const box=await frame.boundingBox(),content=await turn.locator('.agent-content').boundingBox()
 assert(box.width>=32&&box.height>=32,'avatar must not shrink')
 assert(content.x>=box.x+box.width,'text must not overlap avatar')
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
}
try{
  assert.equal((await (await page.request.get(`${base}/api/health`)).json()).public_demo, true, 'Only mutate the isolated visitor demo')
 await page.request.get(`${base}/api/settings`)
 await page.request.patch(`${base}/api/settings`,{data:{onboarding_complete:true,pet_id:'otter'}})
 for(const width of [390,320,568,793,1363]){
  await page.setViewportSize({width,height:871})
  for(const quiet of [false,true]){
   await page.goto(base)
   if(quiet){await page.getByRole('button',{name:'陪我待会儿',exact:true}).click();await page.getByRole('button',{name:'想聊聊',exact:true}).click()}
   await avatar(page.getByTestId('companion-greeting'))
   for(const kind of ['reply','safety','memory','advice']){
    let release,reached
    const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>reached=resolve)
    await page.route('**/api/companion/respond',async route=>{
     reached();await gate
     if(kind==='reply')return route.continue()
     const extra=kind==='safety'?{safety:true}:kind==='memory'?{intent:'recall',memories:[{id:'synthetic',text:'虚构回忆：周末在图书馆看书',recorded_at:'2026-11-02T12:00:00+08:00'}]}:{suggestion:{id:'synthetic',title:'虚构建议卡片',step:'这是头像展示的接口模拟，不是效果测试。'}}
     await route.fulfill({json:{reply:'虚构头像验收回复。',memories:[],...extra}})
    })
    await page.locator('#chat-message').fill('虚构头像验收：今天普通但安心。')
    await page.getByRole('button',{name:'发送',exact:true}).click();await ready
    try{await avatar(page.locator('.pending-turn'))}finally{release()}
    await expect(page.locator('.typing-state')).toHaveCount(0)
    await avatar(page.getByTestId('assistant-reply').last())
    await page.unroute('**/api/companion/respond')
   }
   await page.route('**/api/companion/respond',route=>route.fulfill({status:503,body:'synthetic failure'}))
   await page.locator('#chat-message').fill('虚构失败重试验收')
   await page.getByRole('button',{name:'发送',exact:true}).click()
   await expect(page.getByTestId('failed-request')).toBeVisible()
   await avatar(page.locator('.failed-turn'))
   await page.unroute('**/api/companion/respond')
   await page.getByRole('button',{name:'重试回应',exact:true}).click()
   await expect(page.getByTestId('failed-request')).toHaveCount(0)
   await avatar(page.getByTestId('assistant-reply').last())
   await page.screenshot({path:`${out}/${width}-${quiet?'lake':'chat'}.png`})
   checks.push({width,quiet,states:['greeting','pending','reply','safety','memory','advice','failure','retry']})
  }
 }
 for(const pet_id of ['otter','bear','rabbit','lamp','cat','dog']){
  await page.request.patch(`${base}/api/settings`,{data:{pet_id}})
  await page.goto(base)
  await avatar(page.getByTestId('companion-greeting'))
 }
 assert.deepEqual(errors,[])
 await fs.writeFile(`${out}/results.json`,JSON.stringify({passed:true,checks,pets:6,errors,synthetic_response_branches:['safety','memory','advice','failure']},null,2))
 console.log('PASS avatars in five widths, normal/lake chat, eight states, retry and all six pets')
}finally{await browser.close()}

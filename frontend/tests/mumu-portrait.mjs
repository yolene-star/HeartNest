import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base='http://127.0.0.1:18081',out='../docs/design/mumu-portrait'
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
try{
  assert.equal((await (await page.request.get(`${base}/api/health`)).json()).public_demo, true, 'Only mutate the isolated visitor demo')
 await page.request.get(`${base}/api/settings`)
 await page.request.patch(`${base}/api/settings`,{data:{onboarding_complete:true,pet_id:'otter'}})
 for(const width of [1363,793,390]){
  await page.setViewportSize({width,height:871});await page.goto(base)
  const avatar=page.getByTestId('companion-greeting').locator('.agent-avatar')
  if(width>650){
   await expect(avatar.locator('.mumu-portrait')).toBeVisible()
   const geometry=await avatar.locator('img').evaluate(async img=>{
    await img.decode();const bounds=img.getBoundingClientRect(),frame=img.parentElement.getBoundingClientRect()
    // Known complete head landmarks in the original idle-0 image: crown, ears and chin.
    const points=[[96,20],[44,64],[160,58],[106,104]].map(([x,y])=>({x:bounds.left+x/192*bounds.width-frame.left,y:bounds.top+y/171*bounds.height-frame.top}))
    return {width:frame.width,height:frame.height,headWidth:(160-44)/192*bounds.width,points}
   })
   assert(geometry.headWidth>=geometry.width*.8,'Head should fill at least 80% of avatar width')
   for(const p of geometry.points){
    const radius=geometry.width/2
    assert(Math.hypot(p.x-geometry.width/2,p.y-geometry.height/2)<radius,'Complete head must fit inside circular avatar')
   }
  }else{
   await expect(page.locator('.nav-pet .mumu-portrait')).toBeVisible()
  }
  await expect(page.locator('.hero-pet .sprite-pet')).toHaveCount(1)
  assert.equal(await page.locator('.hero-pet .mumu-portrait,.pet-dock .mumu-portrait').count(),0)
  await page.screenshot({path:`${out}/${width}-portrait.png`})
 }
 await page.setViewportSize({width:1363,height:871})
 await page.locator('#chat-message').fill('虚构验收：你好沐沐。')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await expect(page.getByTestId('assistant-reply').locator('.mumu-portrait')).toBeVisible()
 assert.deepEqual(errors,[])
 console.log('PASS enlarged complete Mumu head in chat/navigation, full-body hero/dock unchanged, reply and three responsive screenshots')
}finally{await browser.close()}

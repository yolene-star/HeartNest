import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base='http://127.0.0.1:8080',out='../docs/design/pet-position'
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage()
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const dock=page.getByTestId('pet-dock')
const point=async()=>{const r=await dock.boundingBox();return {x:Math.round(r.x),y:Math.round(r.y)}}
async function drag(selector,dx,dy){
 const r=await page.locator(selector).boundingBox()
 await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down()
 await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:8});await page.mouse.up()
}
try{
 for(const width of [1363,793]){
  await page.setViewportSize({width,height:871});await page.goto(base);await dock.waitFor()
  const original=await point()
  for(const name of ['日记','回顾','我的','陪伴']){
   await page.getByRole('button',{name,exact:true}).click()
   assert.deepEqual(await point(),original,`Position must persist entering ${name}`)
  }
  for(const [i,name] of ['日记','回顾','我的','陪伴'].entries()){
   await page.getByRole('button',{name,exact:true}).click()
   // Put the dock in a safe known area using an actual drag, then move the avatar itself.
   const start=await point()
   await drag('.pet-dock-avatar',300-start.x,300-start.y)
   const first=await point()
   assert(Math.abs(first.x-300)<=1&&Math.abs(first.y-300)<=1,`${name}: avatar must be draggable`)
   await drag('.pet-dock-avatar',25,20)
   assert.deepEqual(await point(),{x:first.x+25,y:first.y+20})
   assert.equal(await page.getByRole('button',{name,exact:true}).getAttribute('aria-current'),'page','Dragging must not activate avatar navigation')
   await page.screenshot({path:`${out}/${width}-${i}.png`})
   const saved=await point();await page.reload();await dock.waitFor()
   assert.deepEqual(await point(),saved,'Position survives reload')
  }
 }
 await page.getByRole('button',{name:'我的',exact:true}).click()
 await page.locator('.pet-dock-avatar').click()
 assert.equal(await page.getByRole('button',{name:'陪伴',exact:true}).getAttribute('aria-current'),'page','Click after drag still works')
 await page.getByRole('button',{name:'更换陪伴伙伴',exact:true}).click()
 await page.getByRole('dialog').waitFor()
 await page.keyboard.press('Escape')
 await page.reload();await dock.waitFor()
 await drag('.pet-bubble',5000,5000)
 await page.setViewportSize({width:700,height:650})
 await page.waitForTimeout(200)
 const bounds=await dock.boundingBox()
 assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=701&&bounds.y+bounds.height<=651,'Resize keeps pet inside viewport')
 assert.deepEqual(errors,[])
 await fs.writeFile(`${out}/results.json`,JSON.stringify({passed:true,checks:['initial position stable across four pages','avatar drag on all four pages at 1363/793','drag does not navigate','reload persists position','next click opens chat','picker opens','drag and resize clamp inside viewport'],errors},null,2))
 console.log('PASS all-page pet dragging, stable navigation/reload position, click behavior and resize bounds')
}finally{await browser.close()}

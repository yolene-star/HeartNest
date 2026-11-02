import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base='http://127.0.0.1:8080', out='../docs/design/companion-drawer'
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage()
const snapshot=async()=>Promise.all(['diaries','profile'].map(async k=>(await fetch(`${base}/api/${k}`)).json()))
const before=await snapshot(), errors=[], requests=[]
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/api/companion/respond',route=>{requests.push(route.request().postDataJSON());return route.fulfill({json:{reply:'好呀，我们可以慢慢想。',reply_source:'llm',memories:[]}})})
try {
 for(const width of [793,390,1100]){
  await page.setViewportSize({width,height:871});await page.goto(base)
  const entry=page.getByRole('button',{name:'打开陪伴工具',exact:true})
  await entry.waitFor()
  await page.locator('#chat-message').fill('还没有发送的草稿')
  await entry.click()
  const dialog=page.getByRole('dialog',{name:'陪伴工具',exact:true})
  await dialog.waitFor()
  assert.equal(await entry.getAttribute('aria-expanded'),'true')
  assert.equal(await page.locator('.companion-grid>.companion-aside').isVisible(),false)
  await page.screenshot({path:`${out}/${width}-open.png`})
  for(let n=0;n<12;n++){
   await page.keyboard.press('Tab')
   assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'Focus stays in modal drawer')
  }
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'})
  assert(await entry.evaluate(el=>el===document.activeElement))
  assert.equal(await page.locator('#chat-message').inputValue(),'还没有发送的草稿')
  await entry.click();await page.mouse.click(5,100);await dialog.waitFor({state:'hidden'})
  await entry.click()
  await dialog.getByRole('button',{name:'一起找个小活动',exact:true}).click()
  await dialog.waitFor({state:'hidden'})
  await page.getByTestId('assistant-reply').waitFor()
  assert.match(requests.at(-1).text,/小活动/)
  assert.equal(await page.locator('#chat-message').inputValue(),'还没有发送的草稿')
  await entry.click();await dialog.getByRole('button',{name:'关闭陪伴工具',exact:true}).click()
  await entry.click();await page.setViewportSize({width:1363,height:871})
  await dialog.waitFor({state:'hidden'})
  assert(await page.locator('.companion-grid>.companion-aside').isVisible())
 }
 await page.setViewportSize({width:793,height:871});await page.goto(base)
 await page.getByRole('button',{name:'打开陪伴工具',exact:true}).click()
 await page.getByRole('dialog',{name:'陪伴工具',exact:true}).getByRole('button',{name:'想放松一下',exact:true}).click()
 await page.getByRole('dialog',{name:'现在更想怎么缓一缓？',exact:true}).waitFor()
 await page.getByRole('button',{name:'暂时不选',exact:true}).click()
 await page.getByRole('button',{name:'打开陪伴工具',exact:true}).click()
 await page.getByRole('dialog',{name:'陪伴工具',exact:true}).getByRole('button',{name:'陪我待会儿',exact:true}).click()
 await page.getByTestId('quiet-scene').waitFor()
 await page.getByRole('button',{name:'返回陪伴',exact:true}).click()
 await page.getByRole('button',{name:'打开陪伴工具',exact:true}).click()
 await page.getByRole('dialog',{name:'陪伴工具',exact:true}).getByRole('button',{name:'打开我的日记',exact:true}).click()
 await page.locator('.diary-workspace').waitFor()
 assert.equal(await page.locator('dialog[open]').count(),0)
 assert.deepEqual(await snapshot(),before);assert.deepEqual(errors,[])
 await fs.writeFile(`${out}/results.json`,JSON.stringify({passed:true,checks:['793/390/1100 bookmark opens right drawer','focus trap and Escape focus return','backdrop and close button','activity shortcut sends normal chat and keeps draft','wide resize restores sidebar','diary navigation','default records unchanged'],errors},null,2))
 console.log('PASS companion bookmark drawer, focus, dismissal, shortcuts, resizing, diary navigation and data preservation')
}finally{await browser.close()}

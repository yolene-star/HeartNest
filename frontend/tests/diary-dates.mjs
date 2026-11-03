import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base='http://127.0.0.1:18080',out='../docs/design/diary-dates'
await fs.mkdir(out,{recursive:true})
const api=async(path,method='GET',body)=>fetch(`${base}/api${path}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
const settings=await (await api('/settings')).json(),ids=[]
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const offset=days=>new Date(Date.parse(`${today}T12:00:00Z`)+days*86400000).toISOString().slice(0,10)
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage()
const errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await api('/settings','PATCH',{onboarding_complete:true,save_enabled:true})
 for(const recorded_at of [offset(1),`${offset(1)}T00:00:00+08:00`,'invalid-date']){
  const response=await api('/diaries','POST',{text:'虚构日期校验记录',recorded_at})
  const data=await response.json();if(data.id)ids.push(data.id)
  assert.equal(response.status,422,'Future/invalid dates must be rejected by the server')
 }
 for(const recorded_at of [today,offset(-1)]){
  const response=await api('/diaries','POST',{text:'虚构日期校验记录',recorded_at,emotion_label:'平静'})
  const data=await response.json();assert.equal(response.status,200);ids.push(data.id)
  const patch=await api(`/diaries/${data.id}`,'PATCH',{recorded_at:offset(1),text:'不能写入的修改'})
  assert.equal(patch.status,422)
  assert.equal((await (await api('/diaries')).json()).items.find(x=>x.id===data.id).text,'虚构日期校验记录')
 }
 for(const width of [1363,390]){
  await page.setViewportSize({width,height:871});await page.goto(base)
  await page.getByRole('button',{name:'日记',exact:true}).click()
  const current=page.locator(`.calendar-cell[aria-label^="${today}"]`)
  await current.waitFor();assert(await current.isEnabled());await current.click()
  const future=page.locator(`.calendar-cell[aria-label^="${offset(1)}"]`)
  if(await future.count())assert(await future.isDisabled())
  await page.screenshot({path:`${out}/${width}-current-month.png`})
  await page.getByRole('button',{name:'下个月',exact:true}).click()
  await page.waitForFunction(()=>!document.querySelector('.calendar-panel')?.getAttribute('aria-busy')?.includes('true'))
  const cells=page.locator('.calendar-cell');assert(await cells.count()>0)
  assert(await cells.evaluateAll(items=>items.every(el=>el.disabled)))
  assert.equal(await page.locator('.calendar-detail').getByRole('button',{name:'写一篇日记',exact:true}).count(),0)
  await page.getByText('未来的日子，等到了再记录。',{exact:true}).waitFor()
  await page.screenshot({path:`${out}/${width}-future-month.png`})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 }
 assert.deepEqual(errors,[])
 await fs.writeFile(`${out}/results.json`,JSON.stringify({passed:true,today,timeZone:'Asia/Shanghai',checks:['future and malformed creation returns 422','today and yesterday accepted','future patch rejected without partial text update','future calendar cells disabled at desktop/mobile','future month cannot start diary from detail'],errors},null,2))
 console.log('PASS diary date guards, today/past, atomic patch rejection, calendar desktop/mobile')
}finally{
 for(const id of ids)await api(`/diaries/${id}`,'DELETE')
 await api('/settings','PATCH',settings);await browser.close()
}

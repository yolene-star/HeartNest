import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = 'http://127.0.0.1:18080', out = '../docs/design/conversation-continuity'
await fs.mkdir(out, { recursive: true })
const api = async (path, method='GET', body) => {
  const r=await fetch(`${base}/api${path}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
  assert(r.ok,`${path}: ${r.status}`); return r.json()
}
const original=await api('/settings'), before=await api('/diaries')
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1363,height:871}}), errors=[], checks=[]
page.on('pageerror',e=>errors.push(e.message))
try {
  await api('/settings','PATCH',{onboarding_complete:true})
  await page.route('**/api/companion/respond',route=>route.fulfill({json:{reply:'我在这里，慢慢说就好。',memories:[],reply_source:'rules'}}))
  await page.goto(base)
  const send=async text=>{await page.locator('#chat-message').fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.typing-state'))}
  await send('连续会话测试：今天想慢慢聊一会儿。')
  await page.locator('#chat-message').fill('还没发送的草稿')
  for(const name of ['日记','回顾','我的']) {
    await page.getByRole('button',{name,exact:true}).click()
    await page.getByRole('button',{name:'陪伴',exact:true}).click()
    assert.equal(await page.locator('.user-message').filter({hasText:'连续会话测试'}).count(),1,'Navigating must retain existing conversation')
    assert.equal(await page.locator('#chat-message').inputValue(),'还没发送的草稿')
  }
  checks.push('conversation, reply and draft survive all navigation destinations')
  const log=page.locator('.conversation-scroll')
  await page.getByRole('button',{name:'打开我的日记',exact:true}).click()
  await page.getByRole('button',{name:'陪伴',exact:true}).click()
  await page.getByRole('button',{name:'想放松一下',exact:true}).click()
  await page.getByRole('button',{name:'继续聊聊',exact:true}).click()
  await page.getByRole('button',{name:'陪我待会儿',exact:true}).click()
  await page.getByRole('button',{name:'想聊聊',exact:true}).click()
  await page.getByRole('button',{name:'返回陪伴',exact:true}).click()
  assert.equal(await page.locator('.user-message').filter({hasText:'连续会话测试'}).count(),1)
  await log.evaluate(el=>el.scrollTo({top:el.scrollHeight,behavior:'instant'}))
  await page.screenshot({path:`${out}/desktop-history.png`})
  checks.push('relaxation and quiet entry/exit keep conversation without adding operational notices')
  await page.setViewportSize({width:793,height:871})
  await page.getByRole('button',{name:'打开陪伴工具'}).click()
  await page.getByRole('dialog',{name:'陪伴工具'}).getByRole('button',{name:'想放松一下',exact:true}).click()
  await page.getByRole('button',{name:'暂时不选',exact:true}).click()
  await page.getByRole('button',{name:'一起找个小活动',exact:true}).click()
  await page.waitForFunction(()=>!document.querySelector('.typing-state'))
  assert.equal(await page.locator('.user-message').count(),2)
  await page.getByRole('button',{name:'给我一个小建议',exact:true}).click()
  await page.waitForFunction(()=>!document.querySelector('.typing-state'))
  await log.evaluate(el=>el.scrollTo({top:el.scrollHeight,behavior:'instant'}))
  await page.screenshot({path:`${out}/narrow-history.png`})
  checks.push('drawer actions stay silent; activity and advice shortcuts insert user requests')
  await page.unroute('**/api/companion/respond')
  await page.getByRole('button',{name:'给我一个小建议',exact:true}).click()
  let advice=page.getByTestId('advice-card').last()
  await advice.waitFor()
  const title=await advice.locator('h3').textContent()
  await advice.getByRole('button',{name:'换个更轻松的',exact:true}).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=advice-card]').length === 2)
  assert.equal(await page.getByTestId('advice-card').first().locator('h3').textContent(),title)
  advice=page.getByTestId('advice-card').last()
  await page.locator('.user-message').filter({hasText:'换一个更轻松的'}).waitFor()
  await page.getByRole('button',{name:'我的',exact:true}).click()
  await page.getByRole('button',{name:'陪伴',exact:true}).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=advice-card]').length === 2)
  assert.equal(await page.getByTestId('advice-card').first().locator('h3').textContent(),title)
  advice=page.getByTestId('advice-card').last()
  await advice.getByRole('button',{name:'先不用',exact:true}).click()
  await advice.getByText('这次先不做，没关系。',{exact:true}).waitFor()
  checks.push('alternative advice preserves original title/steps and rejection remains after navigation')
  let release, reached
  const pending = new Promise(resolve=>{reached=resolve})
  const responseGate=new Promise(resolve=>{release=resolve})
  await page.route('**/api/companion/respond', async route=>{
    reached(); await responseGate
    await route.fulfill({json:{reply:'中途切页的回应也还在。',memories:[]}})
  })
  await page.locator('#chat-message').fill('等待回复时也可以看日记')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await pending
  await page.getByRole('button',{name:'日记',exact:true}).click()
  release()
  await page.waitForFunction(()=>!document.querySelector('.typing-state'))
  await page.getByRole('button',{name:'陪伴',exact:true}).click()
  await log.getByText('中途切页的回应也还在。',{exact:true}).waitFor()
  checks.push('reply arriving while another page is open remains in original conversation')
  assert.deepEqual(await api('/diaries'),before,'interaction logs must not become diaries')
  assert.equal(await page.locator('.save-only-confirmation').count(),0)
  assert.deepEqual(errors,[])
  await fs.writeFile(`${out}/results.json`,JSON.stringify({passed:true,checks,errors},null,2))
  console.log('PASS',checks)
} catch(e) {
  await page.screenshot({path:`${out}/last-failure.png`})
  throw e
} finally {await api('/settings','PATCH',original);await browser.close()}

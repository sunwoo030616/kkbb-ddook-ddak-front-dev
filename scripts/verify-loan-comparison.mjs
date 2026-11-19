// Fresh scripts.screen_review_fixture, Vite and Chrome required.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:375,height:1200}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const state=()=>fetch('http://127.0.0.1:8877/fixture/state').then(r=>r.json());
let session,holdSave=false,saveHeld=false,holdDelete=false,deleteHeld=false;
let saveResolve;const saveAck=new Promise(resolve=>saveResolve=resolve);
let deleteResolve;const deleteAck=new Promise(resolve=>deleteResolve=resolve);
page.on('response',async response=>{
  if(response.url().includes('/jobs/')&&response.status()===200){const body=await response.json();if(body.result?.session_id)session=body.result.session_id;}
});
const list=()=>fetch('http://127.0.0.1:8877/canvas/sessions/'+session+'/scenarios').then(r=>r.json());
await page.route('**/api/canvas/v2/sessions/*/scenarios',async route=>{
  if(route.request().method()!=='POST'||!holdSave||saveHeld){await route.continue();return;}
  saveHeld=true;const response=await route.fetch();saveResolve();await new Promise(resolve=>setTimeout(resolve,6000));await route.fulfill({response}).catch(()=>{});
});
await page.route('**/api/canvas/v2/sessions/*/scenarios/*',async route=>{
  if(route.request().method()!=='DELETE'||!holdDelete||deleteHeld){await route.continue();return;}
  deleteHeld=true;const response=await route.fetch();deleteResolve();await new Promise(resolve=>setTimeout(resolve,6000));await route.fulfill({response}).catch(()=>{});
});
const fill=async(label,months,rate='4.5',principal='10000000')=>{
  await page.getByRole('spinbutton',{name:'대출 원금 (원)'}).fill(principal);
  await page.getByRole('spinbutton',{name:'연 금리 (%)'}).fill(rate);
  await page.getByRole('spinbutton',{name:'상환 개월 수'}).fill(String(months));
  await page.getByRole('textbox',{name:'비교 조건 이름'}).fill(label);
};
const save=async(label,months,rate,principal)=>{await fill(label,months,rate,principal);await page.getByRole('button',{name:'이 조건을 비교에 저장'}).click();await page.getByRole('article',{name:label,exact:true}).waitFor();};
const idle=()=>page.waitForFunction(()=>!JSON.parse(sessionStorage.getItem('kkbb.workspace.v1')).value.pending);
await mkdir('reports/loan-comparison',{recursive:true});
try{
  await page.goto('http://127.0.0.1:5173');await page.getByRole('textbox',{name:'금융 상황 입력'}).fill('대출 상환표를 보여줘');
  await page.getByRole('button',{name:'메시지 전송'}).click();await page.getByRole('spinbutton',{name:'대출 원금 (원)'}).waitFor();
  await save('12개월',12);
  holdSave=true;await fill('24개월',24);await page.getByRole('button',{name:'이 조건을 비교에 저장'}).click();await saveAck;
  await page.reload();await page.getByRole('article',{name:'24개월',exact:true}).waitFor();await idle();
  const two=await list();assert.equal(two.items.length,2);assert.equal(two.same_principal,true);
  assert.ok(two.items[0].lowest_total_interest_won);assert.ok(two.items[1].lowest_regular_payment_won);
  assert.equal((await state()).model_calls,1);assert.equal((await state()).revisions[0],1);
  await page.getByRole('region',{name:'대출 조건 비교'}).screenshot({path:'reports/loan-comparison/mobile-comparison.png'});
  await save('다른 원금',24,'4.5','20000000');
  await page.getByText('원금이 달라 총이자·월 납입액 순위를 표시하지 않아요.',{exact:true}).waitFor();
  const mismatch=await list();assert.equal(mismatch.same_principal,false);assert.ok(mismatch.items.every(item=>!item.lowest_total_interest_won&&!item.lowest_regular_payment_won));
  await page.getByRole('button',{name:'다른 원금 삭제',exact:true}).click();await page.getByRole('article',{name:'다른 원금',exact:true}).waitFor({state:'hidden'});
  await save('무이자',12,'0');assert.equal((await list()).items[2].calculation.values.total_interest_won,'0');
  await save('36개월',36);
  assert.equal(await page.getByRole('button',{name:'이 조건을 비교에 저장'}).isDisabled(),true);
  await page.getByRole('button',{name:'12개월 삭제',exact:true}).click();await page.getByRole('article',{name:'12개월',exact:true}).waitFor({state:'hidden'});
  assert.equal((await list()).items[0].label,'24개월');assert.equal(await page.getByRole('button',{name:'이 조건을 비교에 저장'}).isEnabled(),true);
  await save('추가 조건',18,'3.5');
  await page.reload();await page.getByRole('article',{name:'추가 조건',exact:true}).waitFor();await idle();
  assert.equal((await list()).items.length,4);assert.equal(await page.getByRole('textbox',{name:'비교 조건 이름'}).inputValue(),'추가 조건');
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'reports/loan-comparison/desktop-comparison.png',fullPage:true});
  holdDelete=true;await page.getByRole('button',{name:'추가 조건 삭제',exact:true}).click();await deleteAck;
  await page.reload();await idle();await page.getByRole('region',{name:'대출 조건 비교'}).waitFor();
  assert.equal((await list()).items.length,3);assert.equal(await page.getByRole('article',{name:'추가 조건',exact:true}).count(),0);
  assert.equal((await state()).model_calls,1);assert.equal((await state()).revisions[0],1);assert.deepEqual(errors,[]);
  const report={scope:'real React/Python/SQLite and existing Decimal calculator; only initial screen model is scripted',checks:['save inputs without changing canvas','12 vs 24 month payment and interest tradeoff','lost save acknowledgement retried with same key, no duplicate scenario','comparison and drafts restored after reload','different principals suppress rankings','zero interest case','four item cap and freed slot after delete','baseline recalculated after delete','lost delete acknowledgement safely retried','no additional model calls or canvas revisions','mobile and desktop capture','no browser errors'],two_scenario_summary:two.items.map(({label,calculation,difference_from_first})=>({label,input:calculation.input,values:{regular_payment_won:calculation.values.regular_payment_won,total_interest_won:calculation.values.total_interest_won,total_payment_won:calculation.values.total_payment_won},difference_from_first})),state:await state()};
  await writeFile('reports/loan-comparison/browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}

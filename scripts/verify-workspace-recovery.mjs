// Fresh fixture: REVIEW_FIXTURE_DELAY=2 python -m scripts.screen_review_fixture
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:375,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const state=()=>fetch('http://127.0.0.1:8877/fixture/state').then(r=>r.json());
const send=async text=>{await page.getByRole('textbox',{name:'금융 상황 입력'}).fill(text);await page.getByRole('button',{name:'메시지 전송'}).click();};
const journal=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('kkbb.workspace.v1')).value);
const ready=()=>page.getByRole('textbox',{name:'금융 상황 입력'}).waitFor();
let submissions=0,lookups=0,held=false,holdCommit=false,commitHeld=false;
let ackResolve;const ack=new Promise(resolve=>ackResolve=resolve);
let commitResolve;const commitAck=new Promise(resolve=>commitResolve=resolve);
page.on('request',r=>{if(r.url().endsWith('/jobs')&&r.method()==='POST')submissions++;if(r.url().includes('/requests/'))lookups++;});
await page.route('**/api/canvas/v2/jobs',async route=>{
  if(held){await route.continue();return;}held=true;
  const response=await route.fetch();ackResolve();
  await new Promise(resolve=>setTimeout(resolve,6000));
  await route.fulfill({response}).catch(()=>{});
});
await page.route('**/api/canvas/v2/proposals/*/commit',async route=>{
  if(!holdCommit||commitHeld){await route.continue();return;}commitHeld=true;
  const response=await route.fetch();commitResolve();await new Promise(resolve=>setTimeout(resolve,6000));
  await route.fulfill({response}).catch(()=>{});
});
await mkdir('reports/workspace-recovery',{recursive:true});
try{
  await page.goto('http://127.0.0.1:5173');await ready();
  await send('대출 상환표를 보여줘');await ack;
  assert.ok((await journal()).pending.body.client_request_id);assert.equal((await journal()).pending.job_id,undefined);
  await page.reload();
  const principal=page.getByRole('spinbutton',{name:'대출 원금 (원)'});await principal.waitFor();
  await page.waitForFunction(()=>!JSON.parse(sessionStorage.getItem('kkbb.workspace.v1')).value.pending);
  assert.equal((await state()).model_calls,1);assert.equal(submissions,1);assert.ok(lookups>=1);
  await principal.fill('12500000');await page.getByRole('textbox',{name:'금융 상황 입력'}).fill('아직 전송하지 않은 메모');
  await page.reload();await page.getByText('저장된 작업을 이어서 불러왔어요.',{exact:true}).waitFor();
  assert.equal(await principal.inputValue(),'12500000');assert.equal(await page.getByRole('textbox',{name:'금융 상황 입력'}).inputValue(),'아직 전송하지 않은 메모');
  await send('달러 환전 기능도 추가해줘');
  await page.waitForFunction(()=>!!JSON.parse(sessionStorage.getItem('kkbb.workspace.v1')).value.pending?.job_id);
  await page.reload();await page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor();
  assert.equal((await state()).model_calls,2);assert.equal(submissions,2);assert.equal((await state()).revisions[0],1);
  await page.reload();await page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor();
  assert.equal((await state()).model_calls,2);
  await page.getByRole('button',{name:'기존 화면 유지',exact:true}).click();
  await page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor({state:'hidden'});
  assert.equal(await principal.inputValue(),'12500000');
  await send('달러 환전 기능도 추가해줘');await page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor();
  holdCommit=true;await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();await commitAck;
  assert.equal((await journal()).pending.kind,'decision');assert.equal((await state()).revisions[0],2);
  await page.reload();await page.getByText('저장된 작업을 이어서 불러왔어요.',{exact:true}).waitFor();
  await page.locator('[data-widget="travel_card_charge_widget"]').waitFor();
  assert.equal((await state()).revisions[0],2);assert.equal((await state()).model_calls,3);assert.equal(await principal.inputValue(),'12500000');
  assert.equal(await page.getByText('확인한 변경 내용을 반영했어요.',{exact:true}).count(),1);
  await page.screenshot({path:'reports/workspace-recovery/mobile-resumed.png',fullPage:true});
  assert.deepEqual(errors,[]);
  const report={scope:'real browser and Python API, delayed deterministic model; acknowledgements deliberately withheld',checks:['lost POST acknowledgement resolved by original key without resubmission','reload during generation resumes same job','screen, unsaved form and chat draft survive reload','pending proposal survives reload without applying','lost commit acknowledgement replays same decision with one revision increment','no duplicate assistant confirmation','no browser errors'],submissions,request_lookups:lookups,state:await state()};
  await writeFile('reports/workspace-recovery/browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}

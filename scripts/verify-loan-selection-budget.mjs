// Run with a fresh backend scripts.screen_review_fixture and Vite proxy.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:375,height:812}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const api='http://127.0.0.1:8877';let session;
page.on('response',async response=>{
  if(response.url().includes('/jobs/')&&response.status()===200){const body=await response.json();if(body.result?.session_id)session=body.result.session_id;}
});
const state=()=>fetch(api+'/fixture/state').then(r=>r.json());
const current=()=>fetch(api+'/canvas/sessions/'+session).then(r=>r.json());
const comparison=()=>fetch(api+'/canvas/sessions/'+session+'/scenarios').then(r=>r.json());
const idle=()=>page.waitForFunction(()=>!JSON.parse(sessionStorage.getItem('kkbb.workspace.v1')).value.pending);
const review=()=>page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor();
const gone=()=>page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor({state:'hidden'});
const principal=page.getByRole('spinbutton',{name:'대출 원금 (원)'});
const months=page.getByRole('spinbutton',{name:'상환 개월 수'});
const fill=async(label,n)=>{await principal.fill('10000000');await page.getByRole('spinbutton',{name:'연 금리 (%)'}).fill('4.5');await months.fill(String(n));await page.getByRole('textbox',{name:'비교 조건 이름'}).fill(label);};
let holdBudget=true,budgetHeld=false,holdCommit=false,commitHeld=false;
let budgetResolve;const budgetAck=new Promise(resolve=>budgetResolve=resolve);
let commitResolve;const commitAck=new Promise(resolve=>commitResolve=resolve);
await page.route('**/api/canvas/v2/sessions/*/loan-budget',async route=>{
  if(!holdBudget||budgetHeld){await route.continue();return;}budgetHeld=true;
  const response=await route.fetch();budgetResolve();await new Promise(resolve=>setTimeout(resolve,6000));await route.fulfill({response}).catch(()=>{});
});
await page.route('**/api/canvas/v2/proposals/*/commit',async route=>{
  if(!holdCommit||commitHeld){await route.continue();return;}commitHeld=true;
  const response=await route.fetch();commitResolve();await new Promise(resolve=>setTimeout(resolve,6000));await route.fulfill({response}).catch(()=>{});
});
await mkdir('reports/loan-selection-budget',{recursive:true});
try {
  await page.goto('http://127.0.0.1:5173');await page.getByRole('textbox',{name:'금융 상황 입력'}).fill('대출 상환표를 보여줘');
  await page.getByRole('button',{name:'메시지 전송'}).click();await principal.waitFor();
  await fill('12개월',12);await page.getByRole('button',{name:'이 조건으로 계산'}).click();await page.getByText('일반 회차 월 납입액',{exact:true}).waitFor();
  const original=await current();assert.equal(original.revision,2);
  await page.getByRole('button',{name:'이 조건을 비교에 저장'}).click();await page.getByRole('article',{name:'12개월',exact:true}).waitFor();
  await fill('24개월',24);await page.getByRole('button',{name:'이 조건을 비교에 저장'}).click();await page.getByRole('article',{name:'24개월',exact:true}).waitFor();
  await page.getByRole('spinbutton',{name:'월 상환 예산 (원)'}).fill('500000');await page.getByRole('button',{name:'월 예산 저장',exact:true}).click();await budgetAck;
  await page.reload();await page.getByRole('article',{name:'24개월',exact:true}).waitFor();await idle();holdBudget=false;
  let summary=await comparison();assert.equal(summary.budget_revision,1);assert.equal(summary.items[0].budget_assessment.within_budget,false);assert.equal(summary.items[1].budget_assessment.within_budget,true);
  assert.equal((await current()).revision,2);
  await page.setViewportSize({width:375,height:2200});await page.getByRole('region',{name:'대출 조건 비교'}).evaluate(node=>{node.scrollIntoView({block:'start'});window.scrollBy(0,-80);});await page.getByRole('region',{name:'대출 조건 비교'}).screenshot({path:'reports/loan-selection-budget/mobile-budget-comparison.png'});await page.setViewportSize({width:375,height:812});
  await principal.fill('9990000');
  await page.getByRole('button',{name:'24개월 적용 미리보기',exact:true}).click();await review();
  assert.equal((await current()).revision,2);assert.equal(await principal.inputValue(),'9990000');
  await page.getByRole('button',{name:'변경 후 미리보기',exact:true}).click();assert.equal(await principal.inputValue(),'10000000');assert.equal(await months.inputValue(),'24');
  await page.setViewportSize({width:375,height:1800});await page.getByRole('region',{name:'화면 변경 확인'}).evaluate(node=>{node.scrollIntoView({block:'start'});window.scrollBy(0,-80);});await page.getByRole('region',{name:'화면 변경 확인'}).screenshot({path:'reports/loan-selection-budget/mobile-apply-review.png'});await page.setViewportSize({width:375,height:812});
  await page.getByRole('button',{name:'기존 화면 유지',exact:true}).click();await gone();assert.equal(await principal.inputValue(),'9990000');assert.equal((await current()).revision,2);
  await page.getByRole('button',{name:'24개월 적용 미리보기',exact:true}).click();await review();await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();await gone();
  assert.equal(await principal.inputValue(),'10000000');assert.equal(await months.inputValue(),'24');
  const applied=await current();assert.equal(applied.revision,3);assert.equal(applied.loan_selection.label,'24개월');
  const saved24=summary.items[1].calculation;assert.deepEqual(applied.widgets.find(w=>w.type==='loan_repayment_schedule_widget').data,saved24);
  assert.equal((await state()).model_calls,1);
  await page.getByRole('button',{name:'저장된 화면 보기',exact:true}).click();await page.getByRole('button',{name:'화면 2 복구',exact:true}).click();await review();await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();await gone();
  assert.equal(await months.inputValue(),'12');assert.equal((await current()).revision,4);assert.equal((await comparison()).budget_won,'500000');
  await page.getByRole('button',{name:'24개월 적용 미리보기',exact:true}).click();await review();holdCommit=true;await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();await commitAck;
  await page.reload();await page.getByRole('article',{name:'24개월',exact:true}).waitFor();await idle();
  assert.equal((await current()).revision,5);assert.equal(await months.inputValue(),'24');assert.equal((await state()).model_calls,1);
  await page.getByRole('spinbutton',{name:'월 상환 예산 (원)'}).fill('436478');await page.getByRole('button',{name:'월 예산 저장',exact:true}).click();await idle();
  summary=await comparison();const rounding=summary.items[1].budget_assessment;assert.equal(rounding.over_budget_months,1);assert.equal(rounding.first_over_budget_month,24);assert.equal(rounding.max_overrun_won,'3');
  await page.getByRole('button',{name:'12개월 적용 미리보기',exact:true}).click();await review();
  const external=await fetch(api+'/canvas/sessions/'+session+'/loan-budget',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_request_id:crypto.randomUUID(),budget_won:'600000',expected_budget_revision:2})});assert.equal(external.status,200);
  await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal((await current()).revision,5);
  await page.getByRole('button',{name:'최신 화면 불러오기 · 입력값 초기화'}).click();await gone();assert.equal(await page.getByRole('spinbutton',{name:'월 상환 예산 (원)'}).inputValue(),'600000');
  await page.getByRole('button',{name:'예산 지우기',exact:true}).click();await idle();assert.equal((await comparison()).budget_won,null);
  assert.equal((await current()).revision,5);assert.deepEqual(errors,[]);
  const report={scope:'real React, Python API, SQLite and Decimal calculator; only initial screen planner is scripted',checks:['budget save acknowledgement lost and resumed exactly once','whole schedule budget assessment','selection preview uses saved inputs instead of unsaved drafts','cancel preserves drafts and original screen','confirm synchronizes form and exact saved repayment result','history restores earlier calculated conditions','lost apply acknowledgement yields one new revision','last payment rounding exceeds regular-payment budget by 3 won','concurrent budget change blocks stale confirmation','latest recovery refreshes budget','clear budget without changing screen','no additional model calls','mobile captures and no browser errors'],budget_rounding_boundary:rounding,state:await state()};
  await writeFile('reports/loan-selection-budget/browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}

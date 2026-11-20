// Fresh scripts.screen_review_fixture, Vite proxy, Chrome and Playwright required.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:375,height:812}});
const api='http://127.0.0.1:8877';const errors=[];let session,searches=0,holdSearch=true,heldSearch=false,holdSave=true,heldSave=false;
let searchResolve;const searchAck=new Promise(resolve=>searchResolve=resolve);
let saveResolve;const saveAck=new Promise(resolve=>saveResolve=resolve);
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.url().endsWith('/terms')&&request.method()==='POST')searches++;});
page.on('response',async response=>{if(response.url().includes('/jobs/')&&response.status()===200){const body=await response.json();if(body.result?.session_id)session=body.result.session_id;}});
await page.route('**/api/canvas/v2/sessions/*/scenarios/*/terms',async route=>{
  if(!holdSearch||heldSearch){await route.continue();return;}heldSearch=true;
  const response=await route.fetch();searchResolve();await new Promise(resolve=>setTimeout(resolve,6000));await route.fulfill({response}).catch(()=>{});
});
await page.route('**/api/canvas/v2/sessions/*/scenarios/*/terms/save',async route=>{
  if(!holdSave||heldSave){await route.continue();return;}heldSave=true;
  const response=await route.fetch();saveResolve();await new Promise(resolve=>setTimeout(resolve,6000));await route.fulfill({response}).catch(()=>{});
});
const journal=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('kkbb.workspace.v1')).value);
const idle=()=>page.waitForFunction(()=>!JSON.parse(sessionStorage.getItem('kkbb.workspace.v1')).value.pending);
const summary=()=>fetch(api+'/canvas/sessions/'+session+'/scenarios').then(r=>r.json());
const current=()=>fetch(api+'/canvas/sessions/'+session).then(r=>r.json());
const state=()=>fetch(api+'/fixture/state').then(r=>r.json());
const capture=async(name,path)=>{
  await page.setViewportSize({width:375,height:1800});const region=page.getByRole('region',{name});
  await region.evaluate(node=>{node.scrollIntoView({block:'start'});window.scrollBy(0,-80);});
  await region.screenshot({path});await page.setViewportSize({width:375,height:812});
};
await mkdir('reports/loan-terms',{recursive:true});
try{
  await page.goto('http://127.0.0.1:5173');await page.getByRole('textbox',{name:'금융 상황 입력'}).fill('대출 상환표를 보여줘');await page.getByRole('button',{name:'메시지 전송'}).click();
  await page.getByRole('spinbutton',{name:'대출 원금 (원)'}).fill('10000000');await page.getByRole('spinbutton',{name:'연 금리 (%)'}).fill('4.5');await page.getByRole('spinbutton',{name:'상환 개월 수'}).fill('12');
  await page.getByRole('button',{name:'이 조건으로 계산'}).click();await page.getByText('일반 회차 월 납입액',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:'비교 조건 이름'}).fill('기준 조건');await page.getByRole('button',{name:'이 조건을 비교에 저장'}).click();await page.getByRole('article',{name:'기준 조건',exact:true}).waitFor();
  await page.getByRole('spinbutton',{name:'월 상환 예산 (원)'}).fill('500000');await page.getByRole('button',{name:'월 예산 저장',exact:true}).click();await idle();
  await page.getByRole('button',{name:'기준 조건 예산에 맞는 기간 찾기',exact:true}).click();await searchAck;
  assert.equal((await journal()).pending.kind,'termSearch');await page.reload();await page.getByRole('region',{name:'예산 내 상환기간 찾기 결과'}).waitFor();await idle();holdSearch=false;
  const found=(await journal()).termSearch;assert.equal(found.status,'found');assert.equal(found.checked_terms,60);assert.equal((await current()).revision,2);assert.equal((await summary()).items.length,1);
  const shortest=found.candidates.find(candidate=>candidate.reasons.includes('shortest_term'));assert.ok(shortest.budget_assessment.within_budget);
  await capture('예산 내 상환기간 찾기 결과','reports/loan-terms/mobile-found.png');
  const before=searches;await page.reload();await page.getByRole('region',{name:'예산 내 상환기간 찾기 결과'}).waitFor();await idle();assert.equal(searches,before);
  await page.getByRole('button',{name:`${shortest.input.months}개월 찾은 조건 저장`,exact:true}).click();await saveAck;await page.reload();await idle();holdSave=false;
  const label=`${shortest.input.months}개월 · 예산 내 조건`;await page.getByRole('article',{name:label,exact:true}).waitFor();
  assert.equal((await summary()).items.length,2);assert.equal((await current()).revision,2);
  await page.getByRole('button',{name:`${label} 적용 미리보기`,exact:true}).click();await page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor();
  await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();await page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor({state:'hidden'});
  assert.equal(await page.getByRole('spinbutton',{name:'상환 개월 수'}).inputValue(),String(shortest.input.months));assert.equal((await current()).revision,3);
  await page.getByRole('spinbutton',{name:'기간 찾기 최대 개월 수'}).fill('1');await page.getByRole('button',{name:'기준 조건 예산에 맞는 기간 찾기',exact:true}).click();await idle();
  assert.equal((await journal()).termSearch.status,'no_match');await page.getByText('지정한 기간 범위에는 예산 이내인 조건이 없어요.',{exact:true}).waitFor();await capture('예산 내 상환기간 찾기 결과','reports/loan-terms/mobile-no-match.png');
  await page.getByRole('spinbutton',{name:'기간 찾기 최대 개월 수'}).fill('600');await page.getByRole('button',{name:'기준 조건 예산에 맞는 기간 찾기',exact:true}).click();await idle();assert.equal((await journal()).termSearch.checked_terms,600);
  const stale=(await journal()).termSearch;const candidate=stale.candidates.find(x=>x.input.months!==shortest.input.months);
  const external=await fetch(api+'/canvas/sessions/'+session+'/loan-budget',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_request_id:crypto.randomUUID(),budget_won:'600000',expected_budget_revision:1})});assert.equal(external.status,200);
  await page.getByRole('button',{name:`${candidate.input.months}개월 찾은 조건 저장`,exact:true}).click();await page.getByRole('alert').waitFor();await idle();
  assert.equal((await summary()).items.length,2);assert.equal((await journal()).termSearch,null);assert.equal(await page.getByRole('spinbutton',{name:'월 상환 예산 (원)'}).inputValue(),'600000');
  assert.equal((await current()).revision,3);assert.equal((await state()).model_calls,1);assert.deepEqual(errors,[]);
  const report={scope:'real React/Python/SQLite/Decimal calculations; only initial screen model is scripted',checks:['search original principal and rate using stored budget','lost search acknowledgement resumes without model generation','read-only results do not change screen or saved scenarios','cached results restored without recomputing','lost found-term save acknowledgement does not duplicate scenarios','found term enters existing apply preview and synchronizes repayment screen','empty feasible range shows nearest overrun without fake candidates','maximum 600 terms checked','concurrent budget change rejects stale found-term save and refreshes budget','no additional model calls or browser errors'],shortest:shortest.input,checked_terms:found.checked_terms,feasible_terms:found.feasible_terms,search_http_requests:searches,state:await state()};
  await writeFile('reports/loan-terms/browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}

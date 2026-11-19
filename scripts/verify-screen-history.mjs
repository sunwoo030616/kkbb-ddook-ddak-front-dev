// Run against a fresh backend scripts.screen_review_fixture and Vite proxy.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:375,height:812}});
const api='http://127.0.0.1:8877';
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const state=()=>fetch(api+'/fixture/state').then(r=>r.json());
let session;
page.on('response',async response=>{
  if(response.url().includes('/jobs/') && response.status()===200){
    const body=await response.json();if(body.result?.session_id)session=body.result.session_id;
  }
});
const current=()=>fetch(api+'/canvas/sessions/'+session).then(r=>r.json());
const send=async text=>{
  await page.getByRole('textbox',{name:'금융 상황 입력'}).fill(text);
  await page.getByRole('button',{name:'메시지 전송'}).click();
};
const review=()=>page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor();
const gone=()=>page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor({state:'hidden'});
const history=async()=>{
  await page.getByRole('button',{name:'저장된 화면 보기',exact:true}).click();
  await page.getByRole('region',{name:'저장된 화면 이력'}).waitFor();
};
const restore=async revision=>{
  await history();await page.getByRole('button',{name:`화면 ${revision} 복구`,exact:true}).click();await review();
};
await mkdir('reports/screen-history',{recursive:true});
try {
  await page.goto(process.env.REVIEW_UI_URL || 'http://127.0.0.1:5173');
  await send('대출 상환표를 보여줘');
  const principal=page.getByRole('spinbutton',{name:'대출 원금 (원)'});
  await principal.fill('12500000');
  await page.getByRole('spinbutton',{name:'연 금리 (%)'}).fill('4.5');
  await page.getByRole('spinbutton',{name:'상환 개월 수'}).fill('12');
  await page.getByRole('button',{name:'이 조건으로 계산'}).click();
  await page.getByText('일반 회차 월 납입액',{exact:true}).waitFor();
  const calculated=await current();assert.equal(calculated.revision,2);
  await principal.fill('7770000');
  await send('화면을 모두 지워줘');await review();
  await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();await gone();
  assert.equal((await current()).revision,3);
  assert.equal(await page.locator('[data-widget]').count(),0);
  const before=await state();
  await history();
  assert.equal(await page.getByRole('button',{name:'화면 2 복구',exact:true}).isEnabled(),true);
  await page.setViewportSize({width:375,height:1200});
  await page.getByRole('region',{name:'저장된 화면 이력'}).screenshot({path:'reports/screen-history/mobile-history.png'});
  await page.setViewportSize({width:375,height:812});
  await page.getByRole('button',{name:'화면 2 복구',exact:true}).click();await review();
  assert.equal((await current()).revision,3);
  await page.getByRole('button',{name:'변경 후 미리보기',exact:true}).click();
  assert.equal(await principal.inputValue(),'12500000');assert.equal(await principal.isDisabled(),true);
  await page.getByRole('button',{name:'기존 화면 유지',exact:true}).click();await gone();
  assert.equal((await current()).revision,3);
  assert.equal(await page.locator('[data-widget]').count(),0);
  await restore(2);
  await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();await gone();
  await page.getByText('저장된 화면과 입력 조건을 복구했어요. 이어서 수정할 수 있어요.',{exact:true}).waitFor();
  assert.equal(await principal.inputValue(),'12500000');
  const restored=await current();assert.equal(restored.revision,4);
  assert.deepEqual(restored.widgets,calculated.widgets);
  assert.equal((await state()).model_calls,before.model_calls);
  await principal.fill('9990000');
  await restore(1);
  await page.getByRole('button',{name:'기존 화면 유지',exact:true}).click();await gone();
  assert.equal(await principal.inputValue(),'9990000');assert.equal((await current()).revision,4);
  await page.setViewportSize({width:1280,height:900});await history();
  await page.screenshot({path:'reports/screen-history/desktop-restored.png',fullPage:true});
  await page.getByRole('button',{name:'화면 이력 닫기'}).click();
  // Continuing from a restored screen still uses the existing conversational edit flow.
  await send('달러 환전 기능도 추가해줘');await review();
  await page.getByRole('button',{name:'기존 화면 유지',exact:true}).click();await gone();
  assert.equal(await principal.inputValue(),'9990000');
  await restore(3);
  await page.getByRole('button',{name:'변경 후 미리보기',exact:true}).click();
  assert.equal(await page.locator('[data-widget]').count(),0);
  await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();await gone();
  assert.equal((await current()).revision,5);assert.equal(await page.locator('[data-widget]').count(),0);
  assert.deepEqual(errors,[]);
  const result={scope:'real React and Python API, deterministic model fixture; no model quality claim',
    checks:['calculation creates history','clear preserves earlier calculated screen','history list shows recoverable states','recovery preview does not persist',
      'preview shows saved inputs','cancel recovery keeps current empty screen','confirm restores exact inputs and calculated widgets as a new revision',
      'recovery uses zero model calls','cancel another recovery preserves unsaved drafts','continue conversational editing after recovery',
      'redo of an empty screen works','mobile and desktop capture','no browser errors'],state:await state()};
  await writeFile('reports/screen-history/browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}

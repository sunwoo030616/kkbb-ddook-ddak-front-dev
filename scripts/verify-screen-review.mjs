// Requires a fresh scripts.screen_review_fixture server and Vite proxy to port 8877.
// PLAYWRIGHT_MODULE may point to an installed Playwright module when it is not local.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const api='http://127.0.0.1:8877';
const state=async()=>fetch(api+'/fixture/state').then(r=>r.json());
const current=async session=>fetch(api+'/canvas/sessions/'+session).then(r=>r.json());
let session;
page.on('response',async response=>{
  if(response.url().includes('/jobs/') && response.status()===200){
    const body=await response.json();
    if(body.result?.session_id)session=body.result.session_id;
  }
});
const send=async message=>{
  await page.getByRole('textbox',{name:'금융 상황 입력'}).fill(message);
  await page.getByRole('button',{name:'메시지 전송'}).click();
};
const waitReview=async()=>page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor();
await mkdir('reports/screen-review',{recursive:true});
try {
  await page.goto(process.env.REVIEW_UI_URL || 'http://127.0.0.1:5173');
  await send('대출 상환표를 보여줘');
  const input=page.getByRole('spinbutton',{name:'대출 원금 (원)'});
  await input.waitFor(); await input.fill('12500000');
  const first=await current(session); assert.equal(first.revision,1);
  await send('달러 환전 기능도 추가해줘'); await waitReview();
  assert.equal((await current(session)).revision,1);
  assert.equal(await input.inputValue(),'12500000'); assert.equal(await input.isDisabled(),true);
  await page.getByRole('button',{name:'변경 후 미리보기',exact:true}).click();
  await page.locator('[data-widget="travel_card_charge_widget"]').waitFor();
  assert.deepEqual((await current(session)).widgets,first.widgets);
  await page.getByRole('region',{name:'화면 변경 확인'}).screenshot({path:'reports/screen-review/mobile-review.png'});
  await page.getByRole('button',{name:'기존 화면 유지',exact:true}).click();
  await page.getByText('기존 화면과 입력한 값을 그대로 유지했어요.',{exact:true}).waitFor();
  assert.equal(await input.inputValue(),'12500000'); assert.equal(await input.isDisabled(),false);
  assert.deepEqual((await current(session)).widgets,first.widgets);
  await send('달러 환전 기능도 추가해줘');await waitReview();
  const before=await state();
  await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();
  await page.getByText('확인한 변경 내용을 반영했어요.',{exact:true}).waitFor();
  assert.equal((await state()).model_calls,before.model_calls);
  const committed=await current(session);assert.equal(committed.revision,2);
  assert.equal(await input.inputValue(),'12500000');
  assert.ok(committed.widgets.some(w=>w.type==='travel_card_charge_widget'));
  await send('환전은 빼고 대출 화면만 남겨줘'); await waitReview();
  // A second real client changes the persisted screen after this proposal was made.
  const external=await fetch(api+'/canvas/compose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'화면을 모두 지워줘',session_id:session,expected_revision:2})});
  assert.equal(external.status,200);
  await page.getByRole('button',{name:'이 변경 적용',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.equal((await current(session)).revision,3);
  assert.equal(await input.inputValue(),'12500000');
  await page.getByRole('button',{name:'최신 화면 불러오기 · 입력값 초기화'}).click();
  await page.getByRole('heading',{name:'변경 내용을 확인해주세요'}).waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-widget]').count(),0);
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:'reports/screen-review/desktop-recovered.png',fullPage:true});
  assert.deepEqual(errors,[]);
  const report={model:'deterministic fixture, not a model quality benchmark',checks:['preview does not persist','preview renders added widget','cancel retains unsaved input','confirm retains input','confirmation uses no additional model call','concurrent client update returns conflict without overwriting local draft','explicit latest-screen recovery','mobile review and desktop screenshot','no browser page errors'],state:await state()};
  await writeFile('reports/screen-review/browser.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {await browser.close();}

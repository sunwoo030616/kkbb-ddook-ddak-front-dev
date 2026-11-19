import test from 'node:test';
import assert from 'node:assert/strict';
import {CanvasWorkspace} from '../src/lib/canvasWorkspace.js';
import {readSession,writeSession,emptySession,SESSION_KEY,SESSION_TTL} from '../src/lib/canvasSession.js';
import {runComposition,createComposition} from '../src/lib/canvasClient.js';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const screen=(revision=1)=>({status:'composed',session_id:'11111111-1111-4111-8111-111111111111',revision,widgets:[{id:'loan_inputs_widget',type:'loan_inputs_widget'}]});
const proposal=()=>({status:'pending',proposal_id:'22222222-2222-4222-8222-222222222222',proposal_digest:'a'.repeat(64),base_revision:1,expires_at:Date.now()/1000+600,screen:{...screen(2),status:'preview'}});

test('per-tab journal expires, rejects corrupt or foreign-endpoint data and reports storage failure',()=>{
  const s=storage();writeSession({...emptySession(),screen:screen()},s,100);
  assert.equal(readSession(s,101).screen.revision,1);assert.equal(readSession(s,100+SESSION_TTL),null);
  const entry=JSON.parse(s.getItem(SESSION_KEY));entry.endpoint='/other';s.setItem(SESSION_KEY,JSON.stringify(entry));assert.equal(readSession(s,101),null);
  s.setItem(SESSION_KEY,'{broken');assert.equal(readSession(s),null);
  assert.equal(writeSession(emptySession(),{setItem(){throw new Error('quota');}}),false);
});

test('request identity is journaled before sending and restored job polls without resubmission',async()=>{
  const s=storage();let resolve;
  const first=new CanvasWorkspace({storage:s,api:{runComposition:async(ticket,options)=>{
    assert.equal(readSession(s).pending.body.client_request_id,ticket.body.client_request_id);
    options.onJob('known-job');return new Promise(r=>{resolve=r;});
  }}});
  const running=first.submit('대출 상환표');
  assert.equal(readSession(s).pending.job_id,'known-job');first.disconnect();
  const second=new CanvasWorkspace({storage:s,api:{runComposition:async(ticket,options)=>{
    assert.equal(options.resume,true);assert.equal(ticket.job_id,'known-job');return screen();
  },loadCurrentScreen:async()=>screen()}});
  await second.recover();resolve(screen());await running;
  assert.equal(second.state.screen.revision,1);assert.equal(second.state.pending,null);
  assert.equal(second.state.messages.filter(x=>x.role==='user').length,1);
  assert.equal(second.state.messages.filter(x=>x.role==='assistant').length,1);
});

test('lost submission acknowledgement is resolved by GET original request key with zero POSTs',async()=>{
  const original=globalThis.fetch;const calls=[];const ticket=createComposition('대출');
  try{
    globalThis.fetch=async(url,options)=>{calls.push([url,options?.method]);return {ok:true,json:async()=>({job_id:'found',status:'completed',result:screen()})};};
    assert.equal((await runComposition(ticket,{resume:true})).revision,1);
    assert.deepEqual(calls,[['/api/canvas/v2/requests/'+ticket.body.client_request_id,undefined]]);
  }finally{globalThis.fetch=original;}
});

test('missing job never silently regenerates; network failures retain recovery ticket',async()=>{
  const s=storage();const workspace=new CanvasWorkspace({storage:s,api:{runComposition:async()=>{throw new TypeError('offline');}}});
  await workspace.submit('대출');assert.ok(workspace.state.pending);assert.equal(workspace.state.connectionLost,true);
  const original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;return {ok:false,status:404,json:async()=>({detail:'missing'})};};
    await assert.rejects(runComposition(workspace.state.pending,{resume:true}),e=>e.terminal&&e.status===404);
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});

test('screen, unsaved form and chat draft survive refresh; pending proposal remains uncommitted',async()=>{
  const s=storage();const p=proposal();writeSession({...emptySession(),screen:screen(),proposal:p,inputValues:{loan_inputs_widget:{principal_won:'12500000'}},draft:'아직 전송하지 않은 글'},s);
  const workspace=new CanvasWorkspace({storage:s,api:{loadCurrentScreen:async()=>screen()}});await workspace.recover();
  assert.equal(workspace.state.inputValues.loan_inputs_widget.principal_won,'12500000');
  assert.equal(workspace.state.draft,'아직 전송하지 않은 글');assert.equal(workspace.state.proposal.proposal_id,p.proposal_id);
  assert.equal(workspace.state.screen.revision,1);
});

test('lost confirmation response retries the same approval and writes its result once',async()=>{
  const s=storage();const p=proposal();writeSession({...emptySession(),screen:screen(),proposal:p,pending:{kind:'decision',decision:'commit',proposal:p}},s);
  let calls=0;const workspace=new CanvasWorkspace({storage:s,api:{decideProposal:async(value,decision)=>{
    calls++;assert.equal(value.proposal_id,p.proposal_id);assert.equal(decision,'commit');return {...screen(2),proposal_reused:true};
  },loadCurrentScreen:async()=>screen(2)}});
  await workspace.recover();assert.equal(calls,1);assert.equal(workspace.state.screen.revision,2);
  assert.equal(workspace.state.pending,null);assert.equal(workspace.state.proposal,null);
  assert.equal(workspace.state.messages.length,1);
});

test('newer server screen invalidates stale proposal and local financial drafts',async()=>{
  const s=storage();writeSession({...emptySession(),screen:screen(),proposal:proposal(),inputValues:{loan_inputs_widget:{principal_won:'99'}}},s);
  const workspace=new CanvasWorkspace({storage:s,api:{loadCurrentScreen:async()=>screen(3)}});await workspace.recover();
  assert.equal(workspace.state.screen.revision,3);assert.equal(workspace.state.proposal,null);assert.deepEqual(workspace.state.inputValues,{});
});

test('expired server session requires explicit reset and cannot create new work on reload',async()=>{
  const s=storage();writeSession({...emptySession(),screen:screen()},s);
  const workspace=new CanvasWorkspace({storage:s,api:{loadCurrentScreen:async()=>{throw Object.assign(new Error('expired'),{status:410});}}});
  await workspace.recover();assert.equal(workspace.state.needsRefresh,true);assert.equal(workspace.locked(),true);
  workspace.reset();assert.equal(workspace.state.screen,null);assert.equal(workspace.locked(),false);assert.equal(readSession(s).screen,null);
});

test('interrupted scenario save recovers the same key and restores the comparison board',async()=>{
  const s=storage();const ticket={kind:'scenarioSave',session:screen().session_id,body:{client_request_id:'original-save',label:'12개월',calculation:{months:12}}};
  writeSession({...emptySession(),screen:screen(),pending:ticket},s);
  const result={items:[{id:'one',label:'12개월'}]};let calls=0;
  const workspace=new CanvasWorkspace({storage:s,api:{saveLoanScenario:async(session,body)=>{calls++;assert.equal(body.client_request_id,'original-save');return result;},
    loadCurrentScreen:async()=>screen(),loadLoanScenarios:async()=>result}});
  await workspace.recover();assert.equal(calls,1);assert.equal(workspace.state.pending,null);
  assert.equal(workspace.state.comparisonOpen,true);assert.deepEqual(workspace.state.comparison,result);
});

test('scenario delete is journaled before request and comparison persists as an open board after reload',async()=>{
  const s=storage();const result={items:[]};
  const workspace=new CanvasWorkspace({storage:s,api:{deleteLoanScenario:async(session,id)=>{
    assert.equal(readSession(s).pending.id,id);return result;
  }}});
  workspace.update({screen:screen(),comparisonOpen:true});await workspace.deleteScenario('old');
  assert.equal(workspace.state.pending,null);assert.deepEqual(workspace.state.comparison.items,[]);
  const resumed=new CanvasWorkspace({storage:s,api:{loadCurrentScreen:async()=>screen(),loadLoanScenarios:async()=>result}});
  await resumed.recover();assert.equal(resumed.state.comparisonOpen,true);assert.deepEqual(resumed.state.comparison.items,[]);
});

test('browser checkpoint omits model traces and duplicate composition request bodies',()=>{
  const s=storage();const ticket=createComposition('요청 원문',screen());
  writeSession({...emptySession(),screen:{...screen(),trace:[{model_output:'raw output'}]},pending:ticket},s);
  const saved=readSession(s);
  assert.equal(saved.screen.trace,undefined);assert.equal(saved.pending.body.request,undefined);
  assert.equal(saved.pending.message,undefined);assert.equal(saved.pending.body.client_request_id,ticket.body.client_request_id);
});

test('expired job exposes latest-screen recovery instead of silently creating a replacement',async()=>{
  const s=storage();writeSession({...emptySession(),screen:screen(),pending:createComposition('수정',screen())},s);
  const workspace=new CanvasWorkspace({storage:s,api:{runComposition:async()=>{throw Object.assign(new Error('missing'),{status:404,terminal:true});},loadCurrentScreen:async()=>screen(2)}});
  await workspace.recover();assert.equal(workspace.state.screen.revision,1);assert.equal(workspace.state.pending,null);assert.equal(workspace.state.needsRefresh,true);
  await workspace.refresh();assert.equal(workspace.state.screen.revision,2);assert.equal(workspace.state.needsRefresh,false);
});

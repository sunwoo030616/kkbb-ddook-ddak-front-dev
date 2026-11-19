import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptScreen, requestBody, SUPPORTED_WIDGETS, composeScreen, retainInputValues, isLegacyEndpoint, composeLegacy } from '../src/lib/canvasClient.js';

test('follow-up requests keep session revision and declare renderer capabilities', () => {
  const body = requestBody('보험은 빼줘', { session_id: 'session', revision: 3 });
  assert.equal(body.session_id, 'session');assert.equal(body.expected_revision, 3);
  assert.deepEqual(body.supported_widgets, SUPPORTED_WIDGETS);
  assert.equal(body.retrieval_mode, 'multi');assert.equal(body.review_mode, 'off');
  assert.equal(body.intent_mode, 'auto');
  assert.equal(body.evidence_mode, 'once');
});
test('clarification does not wipe an existing screen or its form state', () => {
  const old = { session_id:'one',revision:1,widgets:[{id:'a',type:'loan_inputs_widget'}] };
  assert.equal(acceptScreen(old, { status:'clarify',widgets:[] }), old);
});
test('stale and different-session results cannot replace the current screen', () => {
  const old = { session_id:'one',revision:3,widgets:[] };
  for (const incoming of [{status:'composed',session_id:'one',revision:2,widgets:[]},
                           {status:'composed',session_id:'other',revision:4,widgets:[]}]) {
    assert.throws(() => acceptScreen(old,incoming));
  }
});
test('unsupported components are surfaced instead of silently vanishing', () => {
  assert.throws(() => acceptScreen(null,{status:'composed',widgets:[{type:'arbitrary_script'}]}));
});


test('a transient polling failure retries the same job without resubmitting generation', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const result = { status: 'composed', widgets: [] };
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, method: options?.method || 'GET' });
      if (options?.method === 'POST') return { ok: true, json: async () => ({ job_id: 'existing-job' }) };
      if (calls.length === 2) throw new TypeError('temporary connection reset');
      return { ok: true, json: async () => ({ status: 'completed', stage: 'completed', result }) };
    };
    assert.deepEqual(await composeScreen('대출 상환표를 보여줘'), result);
    assert.equal(calls.filter(c => c.method === 'POST').length, 1);
    assert.deepEqual(calls.slice(1).map(c => c.url), ['/api/canvas/v2/jobs/existing-job', '/api/canvas/v2/jobs/existing-job']);
  } finally { globalThis.fetch = originalFetch; }
});


test('confirmed empty screen clears widgets and removed financial drafts', () => {
  const previous = { session_id: 'one', revision: 1, widgets: [{ id: 'loan_inputs_widget', type: 'loan_inputs_widget' }] };
  const cleared = acceptScreen(previous, { status: 'composed', session_id: 'one', revision: 2, widgets: [] });
  assert.deepEqual(cleared.widgets, []);
  assert.deepEqual(retainInputValues({ loan_inputs_widget: { loan_principal_won: '1000' } }, cleared), {});
});

test('removing one widget preserves the drafts of retained financial inputs', () => {
  const retained = { principal: '1000' };
  const values = { loan_inputs_widget: retained, funding_inputs_widget: { amount: '2000' } };
  assert.deepEqual(retainInputValues(values, { widgets: [{ id: 'loan_inputs_widget' }] }), { loan_inputs_widget: retained });
  assert.equal(retainInputValues(values, { widgets: [{ id: 'loan_inputs_widget' }] }).loan_inputs_widget, retained);
});

test('configured v1 deployments keep their existing endpoint and message contract', async () => {
  assert.equal(isLegacyEndpoint('https://example.com/api/canvas'), true);
  assert.equal(isLegacyEndpoint('/api/canvas/v2'), false);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://example.com/api/canvas');
      assert.deepEqual(JSON.parse(options.body), { message: '여행 준비' });
      return { ok: true, json: async () => ({ widgets: [{ type: 'travel_insurance_widget' }] }) };
    };
    const result = await composeLegacy('https://example.com/api/canvas', '여행 준비', null);
    assert.equal(acceptScreen(null, result).widgets[0].type, 'travel_insurance_widget');
  } finally { globalThis.fetch = originalFetch; }
});

test('preview requests use the queue without accepting the proposed screen', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      if (options?.method === 'POST') {
        assert.equal(JSON.parse(options.body).operation, 'preview');
        return { ok:true, json:async () => ({job_id:'review'}) };
      }
      return {ok:true,json:async () => ({status:'completed',result:{status:'pending'}})};
    };
    const previous={session_id:'one',revision:1,widgets:[]};
    const result=await composeScreen('추가해줘',previous,null,()=>{},'preview');
    assert.equal(acceptScreen(previous,result),previous);
  } finally {globalThis.fetch=original;}
});

test('proposal validates base, session, next revision and allowed widgets', async () => {
  const {validateProposal}=await import('../src/lib/canvasClient.js');
  const previous={session_id:'one',revision:1};
  const proposal={status:'pending',proposal_id:'11111111-1111-4111-8111-111111111111',proposal_digest:'a'.repeat(64),base_revision:1,expires_at:100,
    screen:{status:'preview',session_id:'one',revision:2,widgets:[]}};
  assert.equal(validateProposal(previous,proposal),proposal);
  for (const invalid of [{...proposal,base_revision:0},{...proposal,proposal_digest:'x'},
    {...proposal,screen:{...proposal.screen,session_id:'two'}},
    {...proposal,screen:{...proposal.screen,widgets:[{type:'script'}]}}]) assert.throws(()=>validateProposal(previous,invalid));
});

test('confirmation sends only the approval token and can retry the same decision', async () => {
  const {decideProposal}=await import('../src/lib/canvasClient.js');
  const original=globalThis.fetch;
  const proposal={proposal_id:'11111111-1111-4111-8111-111111111111',proposal_digest:'a'.repeat(64),base_revision:1,screen:{widgets:[{secret:'never sent'}]}};
  let calls=0;
  try {
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'/api/canvas/v2/proposals/'+proposal.proposal_id+'/commit');
      assert.deepEqual(JSON.parse(options.body),{proposal_digest:proposal.proposal_digest,expected_revision:1});calls++;
      return {ok:true,json:async()=>({status:'composed',revision:2})};
    };
    assert.deepEqual(await decideProposal(proposal,'commit'),await decideProposal(proposal,'commit'));
    assert.equal(calls,2);
  } finally {globalThis.fetch=original;}
});

test('queued conflicts retain HTTP status for explicit recovery', async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>({ok:true,json:async()=>options?.method==='POST'?{job_id:'one'}:{status:'failed',error:{status:409,message:'conflict'}}});
    await assert.rejects(composeScreen('추가'),error=>error.status===409);
  }finally{globalThis.fetch=original;}
});

test('explicit refresh accepts the current revision but rejects older or foreign sessions', async()=>{
  const {acceptRefreshedScreen}=await import('../src/lib/canvasClient.js');
  const old={status:'composed',session_id:'one',revision:2,widgets:[]};
  assert.equal(acceptRefreshedScreen(old,old),old);
  assert.throws(()=>acceptRefreshedScreen(old,{...old,revision:1}));
  assert.throws(()=>acceptRefreshedScreen(old,{...old,session_id:'two'}));
});

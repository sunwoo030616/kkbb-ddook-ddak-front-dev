export const SUPPORTED_WIDGETS = [
  'travel_card_charge_widget', 'overseas_qr_payment_widget', 'travel_insurance_widget',
  'group_account_status', 'expense_report_widget', 'group_card_safety_widget',
  'card_freeze_all', 'atm_smart_withdrawal', 'id_reissue_status_widget',
  'funding_inputs_widget', 'funding_comparison_widget', 'loan_inputs_widget',
  'loan_repayment_schedule_widget', 'deposit_protection_widget', 'card_recovery_widget', 'autopay_relink_widget',
];

export function requestBody(message, screen, calculation) {
  const body = { message, expected_revision: screen?.revision ?? 0, supported_widgets: SUPPORTED_WIDGETS,
    retrieval_mode: 'multi', review_mode: 'off', intent_mode: 'auto', evidence_mode: 'once' };
  if (screen?.session_id) body.session_id = screen.session_id;
  if (calculation) body.calculation = calculation;
  return body;
}

export function acceptScreen(previous, incoming) {
  if (incoming.status !== 'composed') return previous;
  if (!Array.isArray(incoming.widgets) || incoming.widgets.some(w => !SUPPORTED_WIDGETS.includes(w.type))) {
    throw new Error('화면 구성 형식을 확인하지 못했어요. 기존 화면을 유지할게요.');
  }
  if (previous && (incoming.session_id !== previous.session_id || incoming.revision <= previous.revision)) {
    throw new Error('이전 화면 응답이 도착했어요. 현재 화면을 유지할게요.');
  }
  return incoming;
}

export function retainInputValues(values, screen) {
  const active = new Set((screen?.widgets || []).map(widget => widget.id));
  return Object.fromEntries(Object.entries(values).filter(([id]) => active.has(id)));
}

export function isLegacyEndpoint(base) {
  return /\/api\/canvas\/?$/.test(new URL(base, 'http://localhost').pathname);
}

export async function composeLegacy(base, message, previous, signal) {
  const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }), signal });
  if (!response.ok) throw new Error('금융 화면을 연결하지 못했어요. 기존 화면을 유지할게요.');
  const data = await response.json();
  return { status: 'composed', session_id: previous?.session_id || crypto.randomUUID(),
    revision: (previous?.revision ?? 0) + 1, widgets: data.widgets,
    greeting: data.greeting || '요청한 금융 기능을 준비했어요.' };
}


export function createComposition(message, screen, calculation, operation = 'compose') {
  return { kind: 'compose', created_at: Date.now(), message,
    body: { request: requestBody(message, screen, calculation), client_request_id: crypto.randomUUID(),
      ...(operation === 'preview' ? { operation } : {}) } };
}

async function readJob(response) {
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error([404, 409, 410].includes(response.status)
    ? '작업이 변경되었거나 보관 기간이 지났어요. 현재 화면을 확인해주세요.'
    : typeof value.detail === 'string' ? value.detail : value.error || '연결이 끊겼어요. 작업 다시 연결을 눌러주세요.'),
    { status: response.status, terminal: response.status < 500 });
  return value;
}

export async function runComposition(ticket, { resume = false, signal, onProgress = () => {}, onJob = () => {} } = {}) {
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000);
  const base = apiBase();
  if (isLegacyEndpoint(base)) {
    if (resume || ticket.body.operation === 'preview') throw Object.assign(new Error('이 연결에서는 작업 이어받기를 지원하지 않아요.'), { terminal: true });
    return composeLegacy(base, ticket.message, ticket.body.request.session_id ? { session_id: ticket.body.request.session_id, revision: ticket.body.request.expected_revision } : null, signal);
  }
  let jobId = ticket.job_id;
  let job;
  if (resume && !jobId) {
    // A lost POST acknowledgement is resolved by its original key. Never create a
    // new job on reload, even when the original request cannot be found.
    job = await readJob(await fetch(base + '/requests/' + ticket.body.client_request_id, { signal }));
    jobId = job.job_id; onJob(jobId);
  } else if (!jobId) {
    let response;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { response = await fetch(base + '/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ticket.body), signal }); break; }
      catch (error) { if (attempt || signal.aborted) throw error; }
    }
    const submitted = await readJob(response); jobId = submitted.job_id; onJob(jobId);
  }
  while (!signal.aborted) {
    if (!job) {
      let response;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try { response = await fetch(base + '/jobs/' + jobId, { signal }); break; }
        catch (error) { if (attempt === 2 || signal.aborted) throw error; }
      }
      job = await readJob(response);
    }
    onProgress(job.stage);
    if (job.status === 'completed') return job.result;
    if (job.status === 'failed') throw Object.assign(new Error(job.error?.message || '작업이 중단됐어요. 현재 화면에서 다시 요청해주세요.'), { status: job.error?.status, terminal: true });
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 600);
      signal.addEventListener('abort', abort, { once: true });
    });
    job = null;
  }
  throw new Error('연결이 끊겼어요. 작업 다시 연결을 눌러주세요.');
}

export async function composeScreen(message, screen, calculation, onProgress = () => {}, operation = 'compose') {
  return runComposition(createComposition(message, screen, calculation, operation), { onProgress });
}


const apiBase = () => (import.meta.env?.VITE_CHAT_API_URL || '/api/canvas/v2').replace(/\/$/, '');
export const supportsScreenReview = () => !isLegacyEndpoint(apiBase());

export function validateProposal(previous, proposal) {
  const screen = proposal?.screen;
  if (proposal?.status !== 'pending' || !/^[a-f0-9-]{36}$/.test(proposal.proposal_id)
      || !/^[a-f0-9]{64}$/.test(proposal.proposal_digest)
      || proposal.base_revision !== (previous?.revision ?? 0) || screen?.status !== 'preview'
      || !Number.isFinite(proposal.expires_at) || !screen.session_id
      || screen.revision !== proposal.base_revision + 1
      || (previous && screen.session_id !== previous.session_id)
      || !Array.isArray(screen.widgets) || screen.widgets.some(w => !SUPPORTED_WIDGETS.includes(w.type))) {
    throw new Error('변경안을 확인하지 못했어요. 기존 화면을 유지할게요.');
  }
  return proposal;
}

async function screenRequest(path, body, method) {
  const response = await fetch(apiBase() + path, {
    method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error([409, 410].includes(response.status)
    ? '화면이 변경되었거나 변경안이 만료됐어요. 최신 화면을 불러와주세요.'
    : '화면을 연결하지 못했어요. 같은 버튼으로 다시 시도할 수 있어요.'), { status: response.status, terminal: response.status < 500 });
  return result;
}

export function decideProposal(proposal, decision) {
  if (!['commit', 'cancel'].includes(decision) || !/^[a-f0-9-]{36}$/.test(proposal?.proposal_id)) throw new Error('올바르지 않은 변경안이에요.');
  return screenRequest('/proposals/' + proposal.proposal_id + '/' + decision,
    { proposal_digest: proposal.proposal_digest, expected_revision: proposal.base_revision });
}
export const loadCurrentScreen = session => screenRequest('/sessions/' + encodeURIComponent(session));
export function acceptRefreshedScreen(previous, incoming) {
  if (incoming.status !== 'composed' || !previous || incoming.session_id !== previous.session_id
      || incoming.revision < previous.revision) throw new Error('최신 화면을 확인하지 못했어요.');
  return acceptScreen(null, incoming);
}

export const loadScreenHistory = session => screenRequest('/sessions/' + encodeURIComponent(session) + '/history');
export function restoreScreen(screen, targetRevision) {
  if (!Number.isInteger(targetRevision) || targetRevision < 1) throw new Error('복구할 화면을 선택해주세요.');
  return screenRequest('/sessions/' + encodeURIComponent(screen.session_id) + '/restore',
    { target_revision: targetRevision, expected_revision: screen.revision });
}

export const loadLoanScenarios = session => screenRequest('/sessions/' + encodeURIComponent(session) + '/scenarios');
export const saveLoanScenario = (session,body) => screenRequest('/sessions/' + encodeURIComponent(session) + '/scenarios',body);
export const deleteLoanScenario = (session,id) => screenRequest('/sessions/' + encodeURIComponent(session) + '/scenarios/' + encodeURIComponent(id),null,'DELETE');

export const setLoanBudget = (session,body) => screenRequest('/sessions/' + encodeURIComponent(session) + '/loan-budget',body);
export const applyLoanScenario = (screen,id) => screenRequest('/sessions/' + encodeURIComponent(screen.session_id) + '/scenarios/' + encodeURIComponent(id) + '/apply',{expected_revision:screen.revision});

// Per-tab, short-lived recovery. Financial drafts never enter persistent localStorage.
export const SESSION_TTL = 30 * 60 * 1000;
export const SESSION_KEY = 'kkbb.workspace.v1';
export const emptySession = () => ({ screen:null, messages:[], inputValues:{}, proposal:null, pending:null, draft:'', comparisonOpen:false, budgetDraft:'', budgetDirty:false });
const endpoint = () => import.meta.env?.VITE_CHAT_API_URL || '/api/canvas/v2';
export function readSession(storage, now = Date.now()) {
  try {
    const raw = (storage || globalThis.sessionStorage).getItem(SESSION_KEY);
    if (!raw || raw.length > 900000) return null;
    const record = JSON.parse(raw);
    if (record.version !== 1 || record.endpoint !== endpoint() || !Number.isFinite(record.expires_at) || record.expires_at <= now
        || !Array.isArray(record.value?.messages) || typeof record.value.draft !== 'string'
        || typeof record.value.inputValues !== 'object' || !record.value.inputValues || Array.isArray(record.value.inputValues)) return null;
    return record.value;
  } catch { return null; }
}
export function writeSession(value, storage, now = Date.now()) {
  try {
    const clean = { ...value, messages:value.messages.slice(-40), draft:value.draft.slice(0,1200) };
    if(clean.screen) { clean.screen={...clean.screen};delete clean.screen.trace;delete clean.screen.latency_ms; }
    if(clean.pending?.kind==='compose') {
      // Reload only needs the original identity. Do not keep a second request body
      // or diagnostic model traces in the browser checkpoint.
      clean.pending={...clean.pending,body:{client_request_id:clean.pending.body.client_request_id,operation:clean.pending.body.operation}};
      delete clean.pending.message;
    }
    if(clean.pending?.kind==='restore')clean.pending={...clean.pending,screen:{session_id:clean.pending.screen.session_id,revision:clean.pending.screen.revision}};
    const encoded = JSON.stringify({ version:1, endpoint:endpoint(), expires_at:now+SESSION_TTL, value:clean });
    if (encoded.length > 900000) return false;
    (storage || globalThis.sessionStorage).setItem(SESSION_KEY,encoded); return true;
  } catch { return false; }
}
export function clearSession(storage) {
  try { (storage || globalThis.sessionStorage).removeItem(SESSION_KEY); } catch { /* unavailable storage */ }
}

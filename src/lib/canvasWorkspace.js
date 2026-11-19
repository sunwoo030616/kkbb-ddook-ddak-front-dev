import { acceptScreen, acceptRefreshedScreen, createComposition, runComposition, validateProposal,
  retainInputValues, supportsScreenReview, decideProposal, loadCurrentScreen, loadScreenHistory, restoreScreen, loadLoanScenarios, saveLoanScenario, deleteLoanScenario } from './canvasClient.js';
import { readSession, writeSession, clearSession, emptySession } from './canvasSession.js';

export class CanvasWorkspace {
  constructor({ storage, api = {}, now = Date.now } = {}) {
    this.storage=storage;this.now=now;
    this.api={runComposition,decideProposal,loadCurrentScreen,loadScreenHistory,restoreScreen,loadLoanScenarios,saveLoanScenario,deleteLoanScenario,...api};
    const saved=readSession(storage,now());
    this.state={...emptySession(),...saved,isLoading:!!saved,stage:'context',error:'',notice:'',needsRefresh:false,
      history:null,comparison:null,showPreview:false,connectionLost:false,storageFailed:false};
    this.listeners=new Set();this.epoch=0;this.controller=null;this.saved=!!saved;
  }
  subscribe = listener => { this.listeners.add(listener);return () => this.listeners.delete(listener); };
  snapshot = () => this.state;
  update = patch => {
    this.state={...this.state,...patch};
    const {screen,messages,inputValues,proposal,pending,draft,comparisonOpen}=this.state;
    const ok=writeSession({screen,messages,inputValues,proposal,pending,draft,comparisonOpen},this.storage,this.now());
    this.state={...this.state,storageFailed:!ok};
    this.listeners.forEach(listener=>listener());
  };
  connect = () => { if(this.saved)this.recover(); };
  disconnect = () => { this.epoch++;this.controller?.abort(); };
  locked = () => this.state.isLoading || !!this.state.pending || !!this.state.proposal || this.state.needsRefresh || this.state.connectionLost;
  draft = value => this.update({draft:value.slice(0,1200)});
  values = (id,values) => this.update({inputValues:{...this.state.inputValues,[id]:values}});
  message = text => ({id:crypto.randomUUID(),role:'assistant',text});
  applyResult = (result,ticket) => {
    const s=this.state;
    if(['scenarioSave','scenarioDelete'].includes(ticket.kind)) {
      if(!Array.isArray(result.items))throw new Error('저장된 비교 조건을 확인하지 못했어요.');
      this.update({pending:null,comparison:result,comparisonOpen:true});return;
    }
    if(ticket.kind==='decision' && ticket.decision==='cancel') {
      if(result.status!=='cancelled')throw new Error('취소 결과를 확인하지 못했어요.');
      this.update({pending:null,proposal:null,showPreview:false,messages:[...s.messages,this.message('기존 화면과 입력한 값을 그대로 유지했어요.')]});return;
    }
    if(result.status==='pending') {
      this.update({pending:null,proposal:validateProposal(s.screen,result),showPreview:false});return;
    }
    if(result.status==='composed') {
      const screen=acceptScreen(s.screen,result);
      const restoring=ticket.kind==='decision' && ticket.proposal.screen.restored_from_revision;
      this.update({screen,pending:null,proposal:null,history:null,showPreview:false,
        inputValues:restoring?{}:retainInputValues(s.inputValues,screen),
        messages:[...s.messages,this.message(restoring?'저장된 화면과 입력 조건을 복구했어요. 이어서 수정할 수 있어요.':ticket.kind==='decision'?'확인한 변경 내용을 반영했어요.':result.greeting || '금융 화면을 준비했어요.')]});return;
    }
    if(ticket.kind==='decision')throw new Error('적용 결과를 확인하지 못했어요.');
    this.update({pending:null,messages:[...s.messages,this.message(result.greeting || '필요한 금융 조건을 알려주세요.')]});
  };
  reconcile = async () => {
    const before=this.state.screen;
    if(!before || !supportsScreenReview())return null;
    const latest=await this.api.loadCurrentScreen(before.session_id);
    acceptRefreshedScreen(before,latest);return latest;
  };
  reconcileResult = latest => {
    if(!latest)return;
    const newer=latest.revision>this.state.screen.revision;
    let proposal=this.state.proposal;
    if(proposal && (proposal.base_revision!==latest.revision || proposal.expires_at*1000<=this.now()))proposal=null;
    this.update({screen:latest,proposal,inputValues:newer?{}:this.state.inputValues,
      notice:newer?'다른 요청에서 저장한 최신 화면을 불러왔어요.':this.state.proposal && !proposal?'기존 변경안이 만료되거나 화면이 바뀌어 닫았어요.':'저장된 작업을 이어서 불러왔어요.'});
  };
  perform = async (ticket,resume=false,reconcile=false) => {
    const epoch=++this.epoch;this.controller?.abort();this.controller=new AbortController();
    this.update({isLoading:true,error:'',connectionLost:false,stage:ticket?.kind==='decision'?'committing':'context'});
    try {
      if(ticket) {
        const result=ticket.kind==='compose'
          ?await this.api.runComposition(ticket,{resume,signal:this.controller.signal,
            onProgress:stage=>{if(epoch===this.epoch)this.update({stage});},
            onJob:job_id=>{if(epoch===this.epoch)this.update({pending:{...this.state.pending,job_id}});}})
          :ticket.kind==='decision'?await this.api.decideProposal(ticket.proposal,ticket.decision)
          :ticket.kind==='scenarioSave'?await this.api.saveLoanScenario(ticket.session,ticket.body)
          :ticket.kind==='scenarioDelete'?await this.api.deleteLoanScenario(ticket.session,ticket.id)
          :await this.api.restoreScreen(ticket.screen,ticket.target);
        if(epoch!==this.epoch)return false;
        this.applyResult(result,ticket);
      }
      if(reconcile) {
        const latest=await this.reconcile();if(epoch!==this.epoch)return false;
        this.reconcileResult(latest);
        if(this.state.comparisonOpen && this.state.screen) {
          const comparison=await this.api.loadLoanScenarios(this.state.screen.session_id);
          if(epoch!==this.epoch)return false;this.update({comparison});
        }
      }
      return true;
    } catch(error) {
      if(epoch!==this.epoch)return false;
      const expired=[404,410].includes(error.status);
      this.update({error:error instanceof TypeError || ['AbortError','TimeoutError'].includes(error.name) ? '연결이 끊겼어요. 작업 다시 연결을 눌러주세요.' : error.message || '작업을 연결하지 못했어요.',
        pending:error.terminal?null:this.state.pending,
        proposal:expired?null:this.state.proposal,
        needsRefresh:[404,409,410].includes(error.status),connectionLost:!error.terminal && ![409,410].includes(error.status)});
      return false;
    } finally { if(epoch===this.epoch)this.update({isLoading:false}); }
  };
  recover = () => this.perform(this.state.pending,true,true);
  submit = async (message,calculation) => {
    if(this.locked())return false;
    const s=this.state;const ticket=createComposition(message,s.screen,calculation,s.screen&&!calculation&&supportsScreenReview()?'preview':'compose');
    // One synchronous journal write happens BEFORE the first submission can reach the server.
    this.update({pending:ticket,draft:'',history:null,messages:[...s.messages,{id:ticket.body.client_request_id,role:'user',text:message}]});
    return this.perform(ticket);
  };
  decide = decision => {
    if(this.state.isLoading || !this.state.proposal || this.state.needsRefresh)return;
    const ticket={kind:'decision',decision,proposal:this.state.proposal,created_at:this.now()};
    this.update({pending:ticket});return this.perform(ticket);
  };
  refresh = async () => {
    if(this.state.isLoading)return;
    const epoch=++this.epoch;this.update({isLoading:true,error:'',stage:'context'});
    try {
      const latest=await this.reconcile();if(epoch!==this.epoch)return;
      this.update({screen:latest || this.state.screen,inputValues:{},pending:null,proposal:null,history:null,needsRefresh:false,connectionLost:false});
    } catch(error) { if(epoch===this.epoch)this.update({error:error.message}); }
    finally {if(epoch===this.epoch)this.update({isLoading:false});}
  };
  toggleHistory = async () => {
    if(this.locked())return;
    if(this.state.history){this.update({history:null});return;}
    const epoch=++this.epoch;this.update({isLoading:true,error:'',stage:'context'});
    try {const history=await this.api.loadScreenHistory(this.state.screen.session_id);if(epoch===this.epoch)this.update({history});}
    catch(error){if(epoch===this.epoch)this.update({error:error.message});}
    finally{if(epoch===this.epoch)this.update({isLoading:false});}
  };
  beginRestore = target => {
    if(this.locked())return;
    const ticket={kind:'restore',screen:this.state.screen,target,created_at:this.now()};
    this.update({pending:ticket,history:null});return this.perform(ticket);
  };
  toggleComparison = async () => {
    if(this.locked())return;
    if(this.state.comparisonOpen){this.update({comparisonOpen:false});return;}
    const epoch=++this.epoch;this.update({isLoading:true,error:'',stage:'context'});
    try {
      const comparison=await this.api.loadLoanScenarios(this.state.screen.session_id);
      if(epoch===this.epoch)this.update({comparison,comparisonOpen:true});
    } catch(error){if(epoch===this.epoch)this.update({error:error.message});}
    finally{if(epoch===this.epoch)this.update({isLoading:false});}
  };
  saveScenario = (calculation,label) => {
    if(this.locked())return;
    const ticket={kind:'scenarioSave',session:this.state.screen.session_id,created_at:this.now(),
      body:{client_request_id:crypto.randomUUID(),label,calculation}};
    this.update({pending:ticket});return this.perform(ticket);
  };
  deleteScenario = id => {
    if(this.locked())return;
    const ticket={kind:'scenarioDelete',session:this.state.screen.session_id,id,created_at:this.now()};
    this.update({pending:ticket});return this.perform(ticket);
  };
  preview = () => this.update({showPreview:!this.state.showPreview});
  reset = () => {
    this.disconnect();clearSession(this.storage);this.saved=false;
    this.update({...emptySession(),isLoading:false,error:'',notice:'',needsRefresh:false,connectionLost:false,history:null,comparison:null,showPreview:false});
  };
}

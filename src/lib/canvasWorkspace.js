import { acceptScreen, acceptRefreshedScreen, createComposition, runComposition, validateProposal,
  retainInputValues, supportsScreenReview, decideProposal, loadCurrentScreen, loadScreenHistory, restoreScreen, loadLoanScenarios, saveLoanScenario, deleteLoanScenario, setLoanBudget, applyLoanScenario, searchLoanTerms, saveFoundLoanTerm } from './canvasClient.js';
import { readSession, writeSession, clearSession, emptySession } from './canvasSession.js';

export class CanvasWorkspace {
  constructor({ storage, api = {}, now = Date.now } = {}) {
    this.storage=storage;this.now=now;
    this.api={runComposition,decideProposal,loadCurrentScreen,loadScreenHistory,restoreScreen,loadLoanScenarios,saveLoanScenario,deleteLoanScenario,setLoanBudget,applyLoanScenario,searchLoanTerms,saveFoundLoanTerm,...api};
    const saved=readSession(storage,now());
    this.state={...emptySession(),...saved,isLoading:!!saved,stage:'context',error:'',notice:'',needsRefresh:false,
      history:null,comparison:null,showPreview:false,connectionLost:false,storageFailed:false};
    this.listeners=new Set();this.epoch=0;this.controller=null;this.saved=!!saved;this.termFlight=null;
  }
  subscribe = listener => { this.listeners.add(listener);return () => this.listeners.delete(listener); };
  snapshot = () => this.state;
  update = patch => {
    this.state={...this.state,...patch};
    const {screen,messages,inputValues,proposal,pending,draft,comparisonOpen,budgetDraft,budgetDirty,termMaxMonths,termSearch}=this.state;
    const ok=writeSession({screen,messages,inputValues,proposal,pending,draft,comparisonOpen,budgetDraft,budgetDirty,termMaxMonths,termSearch},this.storage,this.now());
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
    if(ticket.kind==='termSearch') {
      if(!['found','no_match'].includes(result.status) || !Array.isArray(result.candidates))throw new Error('기간 계산 결과를 확인하지 못했어요.');
      this.update({pending:null,termSearch:result,comparisonOpen:true});return;
    }
    if(['scenarioSave','scenarioDelete','budgetSave','termSave'].includes(ticket.kind)) {
      if(!Array.isArray(result.items))throw new Error('저장된 비교 조건을 확인하지 못했어요.');
      this.update({pending:null,comparison:result,comparisonOpen:true,termSearch:ticket.kind==='budgetSave'?null:this.validTermSearch(result),...(ticket.kind==='budgetSave'?{budgetDraft:result.budget_won ?? '',budgetDirty:false}:this.budgetFields(result))});return;
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
      const selection=ticket.kind==='decision' && !restoring && ticket.proposal.screen.loan_selection;
      const inputs=retainInputValues(s.inputValues,screen);
      if(selection)inputs.loan_inputs_widget={...selection.input,scenario_label:selection.label};
      this.update({screen,pending:null,proposal:null,history:null,showPreview:false,
        inputValues:restoring?{}:inputs,
        messages:[...s.messages,this.message(restoring?'저장된 화면과 입력 조건을 복구했어요. 이어서 수정할 수 있어요.':selection?'선택한 대출 조건을 입력과 상환표에 반영했어요.':ticket.kind==='decision'?'확인한 변경 내용을 반영했어요.':result.greeting || '금융 화면을 준비했어요.')]});return;
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
    this.update({isLoading:true,error:'',connectionLost:false,stage:ticket?.kind==='decision'?'committing':ticket?.kind==='termSearch'?'loan_terms':'context'});
    try {
      if(ticket) {
        const result=ticket.kind==='compose'
          ?await this.api.runComposition(ticket,{resume,signal:this.controller.signal,
            onProgress:stage=>{if(epoch===this.epoch)this.update({stage});},
            onJob:job_id=>{if(epoch===this.epoch)this.update({pending:{...this.state.pending,job_id}});}})
          :ticket.kind==='decision'?await this.api.decideProposal(ticket.proposal,ticket.decision)
          :ticket.kind==='scenarioSave'?await this.api.saveLoanScenario(ticket.session,ticket.body)
          :ticket.kind==='scenarioDelete'?await this.api.deleteLoanScenario(ticket.session,ticket.id)
          :ticket.kind==='budgetSave'?await this.api.setLoanBudget(ticket.session,ticket.body)
          :ticket.kind==='scenarioApply'?await this.api.applyLoanScenario(ticket.screen,ticket.id)
          :ticket.kind==='termSearch'?await this.runTermSearch(ticket)
          :ticket.kind==='termSave'?await this.api.saveFoundLoanTerm(ticket.session,ticket.id,ticket.body)
          :await this.api.restoreScreen(ticket.screen,ticket.target);
        if(epoch!==this.epoch)return false;
        this.applyResult(result,ticket);
      }
      if(reconcile) {
        const latest=await this.reconcile();if(epoch!==this.epoch)return false;
        this.reconcileResult(latest);
        if(this.state.comparisonOpen && this.state.screen) {
          const comparison=await this.api.loadLoanScenarios(this.state.screen.session_id);
          if(epoch!==this.epoch)return false;this.update({comparison,termSearch:this.validTermSearch(comparison),...this.budgetFields(comparison)});
        }
      }
      return true;
    } catch(error) {
      if(epoch!==this.epoch)return false;
      if(['budgetSave','termSearch','termSave'].includes(ticket?.kind) && error.status===409) {
        this.update({pending:null,termSearch:null,error:'다른 요청에서 예산이나 원래 조건이 바뀌었어요. 최신 내용을 확인한 뒤 다시 시도해주세요.'});
        try {const comparison=await this.api.loadLoanScenarios(ticket.session);if(epoch===this.epoch)this.update({comparison,...this.budgetFields(comparison)});}
        catch {if(epoch===this.epoch)this.update({connectionLost:true});}
        return false;
      }
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
      let comparison=this.state.comparison;
      if(this.state.comparisonOpen && latest)comparison=await this.api.loadLoanScenarios(latest.session_id);
      if(epoch!==this.epoch)return;
      this.update({screen:latest || this.state.screen,inputValues:{},pending:null,proposal:null,history:null,needsRefresh:false,connectionLost:false,
        ...(comparison?{comparison,termSearch:this.validTermSearch(comparison),...this.budgetFields(comparison)}:{})});
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
      if(epoch===this.epoch)this.update({comparison,comparisonOpen:true,termSearch:this.validTermSearch(comparison),...this.budgetFields(comparison)});
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
  budgetFields = comparison => this.state.budgetDirty?{}:{budgetDraft:comparison.budget_won ?? '',budgetDirty:false};
  budgetDraft = value => this.update({budgetDraft:value,budgetDirty:true,termSearch:null});
  saveBudget = (clear=false) => {
    if(this.locked() || !this.state.comparison)return;
    const ticket={kind:'budgetSave',session:this.state.screen.session_id,created_at:this.now(),
      body:{client_request_id:crypto.randomUUID(),budget_won:clear?null:this.state.budgetDraft.trim() || null,
        expected_budget_revision:this.state.comparison.budget_revision}};
    this.update({pending:ticket});return this.perform(ticket);
  };
  applyScenario = id => {
    if(this.locked())return;
    const ticket={kind:'scenarioApply',screen:{session_id:this.state.screen.session_id,revision:this.state.screen.revision},id,created_at:this.now()};
    this.update({pending:ticket});return this.perform(ticket);
  };
  runTermSearch = ticket => {
    const key=JSON.stringify([ticket.session,ticket.id,ticket.body]);
    if(this.termFlight?.key===key)return this.termFlight.promise;
    const promise=Promise.resolve().then(()=>this.api.searchLoanTerms(ticket.session,ticket.id,ticket.body))
      .finally(()=>{if(this.termFlight?.key===key)this.termFlight=null;});
    this.termFlight={key,promise};return promise;
  };
  validTermSearch = comparison => {
    const result=this.state.termSearch;
    return result && comparison.budget_revision===result.budget_revision && comparison.items.some(item=>item.id===result.source_scenario_id)?result:null;
  };
  termMaxMonths = value => this.update({termMaxMonths:value,termSearch:null});
  findTerms = id => {
    const s=this.state;
    if(this.locked() || s.budgetDirty || s.comparison?.budget_won==null)return;
    const n=Number(s.termMaxMonths);
    if(!Number.isInteger(n)||n<1||n>600){this.update({error:'최대 상환 기간은 1~600개월 사이 정수로 입력해주세요.'});return;}
    const ticket={kind:'termSearch',session:s.screen.session_id,id,created_at:this.now(),
      body:{max_months:n,expected_budget_revision:s.comparison.budget_revision}};
    this.update({pending:ticket,termSearch:null});return this.perform(ticket);
  };
  saveFoundTerm = index => {
    const s=this.state,result=s.termSearch,candidate=result?.candidates[index];
    if(this.locked() || s.budgetDirty || !candidate || !this.validTermSearch(s.comparison))return;
    const ticket={kind:'termSave',session:s.screen.session_id,id:result.source_scenario_id,created_at:this.now(),
      body:{client_request_id:crypto.randomUUID(),label:`${candidate.input.months}개월 · 예산 내 조건`,months:candidate.input.months,
        max_months:result.max_months,source_fingerprint:result.fingerprint,expected_budget_revision:result.budget_revision}};
    this.update({pending:ticket});return this.perform(ticket);
  };
  preview = () => this.update({showPreview:!this.state.showPreview});
  reset = () => {
    this.disconnect();clearSession(this.storage);this.saved=false;
    this.update({...emptySession(),isLoading:false,error:'',notice:'',needsRefresh:false,connectionLost:false,history:null,comparison:null,showPreview:false});
  };
}

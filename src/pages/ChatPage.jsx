import { useEffect, useRef, useState } from 'react';
import { useCanvasWorkspace } from '../lib/useCanvasWorkspace.js';
import Chat from '../components/Chat.jsx';
import ChatOrigin from '../components/common/ChatOrigin.jsx';
import WidgetRenderer from '../components/WidgetRenderer.jsx';
import ScreenHistory from '../components/ScreenHistory.jsx';
import LoanComparison from '../components/LoanComparison.jsx';
import LoanSelectionReview from '../components/LoanSelectionReview.jsx';
import kkaebiFace from '../assets/logo/kkaebi-face.svg';
import { supportsScreenReview } from '../lib/canvasClient.js';

export default function ChatPage() {
  const [state,workspace]=useCanvasWorkspace();
  const {screen,messages,isLoading,error,stage,inputValues,proposal,showPreview,needsRefresh,history,connectionLost,notice,storageFailed,draft,pending,comparison,comparisonOpen,budgetDraft}=state;
  const [isSheetOpen,setIsSheetOpen]=useState(false);
  const reviewRef=useRef(null);
  useEffect(()=>{if(proposal)reviewRef.current?.scrollIntoView({block:'start',behavior:'auto'});},[proposal]);
  const submit=workspace.submit,decide=workspace.decide,refresh=workspace.refresh,toggleHistory=workspace.toggleHistory,beginRestore=workspace.beginRestore;
  const displayed = showPreview && proposal ? proposal.screen : screen;
  const references = showPreview && proposal ? proposal.reference_data : screen?.reference_data;
  const busy = workspace.locked();

  return <div className="flex min-h-[calc(100dvh-104px)] flex-col gap-3 pb-[110px]">
    {!messages.length && !screen && <ChatOrigin onSuggestion={submit} disabled={isLoading} />}
    <section aria-label="대화" className="flex flex-col gap-3">
      {messages.map(message => <div key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[90%] rounded-card rounded-br-none bg-yellow px-4 py-3 text-body-2' : 'flex items-start gap-2 text-body-2 leading-6 text-darkgray'}>
        {message.role === 'assistant' && <img src={kkaebiFace} className="mt-1 h-7 w-7 shrink-0" alt="깨비" />}
        <span>{message.text}</span>
      </div>)}
      {isLoading && <p role="status" className="py-3 text-body-2 text-gray">{({ queued: '요청을 준비하고 있어요…', context: '이전 대화와 이번 상황을 함께 확인하고 있어요…', understanding: '요청한 일과 제외할 조건을 확인하고 있어요…', component_retrieval: '필요한 금융 기능을 찾고 있어요…', planning: '상황에 맞는 화면을 설계하고 있어요…', repair: '화면 구성을 다시 확인하고 있어요…', reviewing: '요청한 기능과 제외 조건을 다시 검토하고 있어요…', refining: '검토 결과를 반영해 화면을 다듬고 있어요…', evidence: '공식 자료에서 필요한 근거를 확인하고 있어요…', binding: '입력값과 금융 기능을 연결하고 있어요…', committing: '화면을 반영하고 있어요…' })[stage] || '화면을 구성하고 있어요…'}</p>}
    </section>
    {notice && <p role="status" className="rounded-card bg-white p-3 text-body-2 text-gray">{notice}</p>}
    {storageFailed && <p role="status" className="rounded-card bg-white p-3 text-body-2 text-gray">이 브라우저에서는 임시 저장을 사용할 수 없어 새로고침 후 작업 복구가 제한돼요.</p>}
    {(connectionLost || (pending && !isLoading)) && <button disabled={isLoading} onClick={workspace.recover} className="rounded-button bg-yellow p-3 text-body-2">작업 다시 연결</button>}
    {error && <p role="alert" className="rounded-card bg-white p-4 text-body-2 text-red-700">{error}</p>}
    {needsRefresh && screen && <button disabled={isLoading} onClick={refresh} className="rounded-button bg-white p-3 text-body-2 underline">최신 화면 불러오기 · 입력값 초기화</button>}
    {screen && supportsScreenReview() && <button disabled={busy} onClick={toggleHistory} aria-expanded={!!history} className="rounded-button bg-white p-3 text-body-2 underline disabled:opacity-50">{history ? '화면 이력 닫기' : '저장된 화면 보기'}</button>}
    {screen && supportsScreenReview() && (screen.widgets.some(widget=>widget.type==='loan_inputs_widget') || comparisonOpen) && <button disabled={busy} onClick={workspace.toggleComparison} aria-expanded={comparisonOpen} className="rounded-button bg-white p-3 text-body-2 underline disabled:opacity-50">{comparisonOpen?'대출 비교 닫기':'저장한 대출 조건 비교'}</button>}
    {comparisonOpen && comparison && <LoanComparison comparison={comparison} onDelete={workspace.deleteScenario} onApply={workspace.applyScenario} budgetDraft={budgetDraft} onBudgetDraft={workspace.budgetDraft} onBudgetSave={workspace.saveBudget} selectedId={screen?.loan_selection?.scenario_id} busy={busy} />}
    {history && <ScreenHistory history={history} onRestore={beginRestore} busy={busy} />}
    {proposal && <section ref={reviewRef} aria-label="화면 변경 확인" className="scroll-mt-20 flex flex-col gap-3 rounded-card border border-yellow bg-white p-4">
      <h2 className="text-title">변경 내용을 확인해주세요</h2>
      {proposal.screen.loan_selection && !proposal.screen.restored_from_revision && <LoanSelectionReview selection={proposal.screen.loan_selection} />}
      {proposal.screen.restored_from_revision && <p className="text-body-2 text-gray">저장된 화면과 입력 조건을 복구해요. 아직 적용하지 않은 입력은 초기화돼요.</p>}
      <p className="text-body-2 text-gray">아직 적용하지 않았어요. 내용을 확인한 뒤 선택해주세요.</p>
      {['added', 'removed', 'updated'].map(key => proposal.changes?.[key]?.length > 0 && <p key={key} className="text-body-2"><strong>{({ added: '추가', removed: '제거', updated: '수정' })[key]}</strong> · {proposal.changes[key].map(item => item.title).join(', ')}</p>)}
      {!!proposal.changes?.context_changed?.length && <p className="text-body-2 text-gray">요청에 맞게 금융 조건도 변경돼요. 미리보기에서 확인해주세요.</p>}
      <button aria-pressed={showPreview} onClick={workspace.preview} className="text-left text-body-2 underline">{showPreview ? '기존 화면 보기' : '변경 후 미리보기'}</button>
      <button disabled={isLoading || needsRefresh || connectionLost || !!pending} onClick={() => decide('commit')} className="rounded-button bg-yellow p-3 text-body-1 disabled:opacity-50">이 변경 적용</button>
      <button disabled={isLoading || needsRefresh || connectionLost || !!pending} onClick={() => decide('cancel')} className="rounded-button border border-gray/20 p-3 text-body-2 disabled:opacity-50">기존 화면 유지</button>
    </section>}
    {showPreview && proposal && <p role="status" className="text-body-2 text-gray">변경 후 미리보기 · 적용 전에는 입력할 수 없어요.</p>}
    <section aria-label="맞춤 금융 화면" className="flex flex-col gap-3">
      {(displayed?.widgets || []).map(widget => <WidgetRenderer key={widget.id || widget.type} widget={widget}
        values={showPreview && (proposal?.screen.restored_from_revision || (proposal?.screen.loan_selection && widget.type==='loan_inputs_widget')) ? {} : inputValues[widget.id] || {}}
        onValuesChange={values => workspace.values(widget.id,values)}
        onSubmit={submit} busy={busy} scenarioCount={comparison?.items.length || 0} onSaveScenario={supportsScreenReview()?workspace.saveScenario:undefined} referenceData={references?.[widget.id]} onSheetOpenChanged={setIsSheetOpen} />)}
    </section>
    <div className={`fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[375px] bg-background/90 px-[10px] pb-[12px] pt-2 ${isSheetOpen ? 'hidden' : ''}`}>
      <Chat draft={draft} onDraftChange={workspace.draft} onSubmit={submit} isLoading={busy} disabledMessage={connectionLost ? '작업을 다시 연결하거나 새 대화를 시작해주세요.' : needsRefresh ? '최신 화면을 불러오거나 새 대화를 시작해주세요.' : proposal ? '변경안을 적용하거나 기존 화면을 유지해주세요.' : undefined} />
      {(screen || pending || connectionLost || messages.length>0) && <button disabled={isLoading || (!!proposal && !needsRefresh && !connectionLost)} onClick={workspace.reset} className="mt-2 w-full text-center text-caption-1 text-gray">새 대화 시작</button>}
    </div>
  </div>;
}

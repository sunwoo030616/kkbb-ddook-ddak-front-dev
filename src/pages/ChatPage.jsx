import { useRef, useState } from 'react';
import Chat from '../components/Chat.jsx';
import ChatOrigin from '../components/common/ChatOrigin.jsx';
import WidgetRenderer from '../components/WidgetRenderer.jsx';
import kkaebiFace from '../assets/logo/kkaebi-face.svg';
import { acceptScreen, composeScreen, retainInputValues, validateProposal, supportsScreenReview, decideProposal, loadCurrentScreen, acceptRefreshedScreen } from '../lib/canvasClient.js';

export default function ChatPage() {
  const [screen, setScreen] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('queued');
  const [inputValues, setInputValues] = useState({});
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const sending = useRef(false);
  const [proposal, setProposal] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const submit = async (message, calculation) => {
    if (sending.current || proposal || needsRefresh) return false;
    sending.current = true; setLoading(true); setError('');
    setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'user', text: message }]);
    try {
      const operation = screen && !calculation && supportsScreenReview() ? 'preview' : 'compose';
      const result = await composeScreen(message, screen, calculation, setStage, operation);
      if (result.status === 'pending') {
        setProposal(validateProposal(screen, result)); setShowPreview(false); return true;
      }
      const accepted = acceptScreen(screen, result);
      if (result.status === 'composed') {
        setScreen(accepted);
        setInputValues(previous => retainInputValues(previous, accepted));
      }
      setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', text: result.greeting || '필요한 금융 화면을 확인하고 있어요.' }]);
      return true;
    } catch (failure) {
      setError(failure.message); setNeedsRefresh([409, 410].includes(failure.status)); return false;
    } finally { sending.current = false; setLoading(false); }
  };

  const decide = async decision => {
    if (sending.current) return;
    sending.current = true; setLoading(true); setError(''); setStage('committing');
    try {
      const result = await decideProposal(proposal, decision);
      if (decision === 'commit') {
        const accepted = acceptScreen(screen, result);
        if (result.status !== 'composed') throw new Error('적용한 화면을 확인하지 못했어요. 다시 시도해주세요.');
        setScreen(accepted); setInputValues(previous => retainInputValues(previous, accepted));
      } else if (result.status !== 'cancelled') throw new Error('취소 결과를 확인하지 못했어요. 다시 시도해주세요.');
      setProposal(null); setShowPreview(false);
      setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', text: decision === 'commit' ? '확인한 변경 내용을 반영했어요.' : '기존 화면과 입력한 값을 그대로 유지했어요.' }]);
    } catch (failure) { setError(failure.message); setNeedsRefresh([409, 410].includes(failure.status)); }
    finally { sending.current = false; setLoading(false); }
  };
  const refresh = async () => {
    if (sending.current || !screen) return;
    sending.current = true; setLoading(true); setStage('context');
    try {
      const latest = acceptRefreshedScreen(screen, await loadCurrentScreen(screen.session_id));
      setScreen(latest); setInputValues({}); setProposal(null); setShowPreview(false); setNeedsRefresh(false); setError('');
    } catch (failure) { setError(failure.message); }
    finally { sending.current = false; setLoading(false); }
  };
  const displayed = showPreview && proposal ? proposal.screen : screen;
  const references = showPreview && proposal ? proposal.reference_data : screen?.reference_data;
  const busy = isLoading || !!proposal || needsRefresh;

  return <div className="flex min-h-[calc(100dvh-104px)] flex-col gap-3 pb-[110px]">
    {!messages.length && !screen && <ChatOrigin onSuggestion={submit} disabled={isLoading} />}
    <section aria-label="대화" className="flex flex-col gap-3">
      {messages.map(message => <div key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[90%] rounded-card rounded-br-none bg-yellow px-4 py-3 text-body-2' : 'flex items-start gap-2 text-body-2 leading-6 text-darkgray'}>
        {message.role === 'assistant' && <img src={kkaebiFace} className="mt-1 h-7 w-7 shrink-0" alt="깨비" />}
        <span>{message.text}</span>
      </div>)}
      {isLoading && <p role="status" className="py-3 text-body-2 text-gray">{({ queued: '요청을 준비하고 있어요…', context: '이전 대화와 이번 상황을 함께 확인하고 있어요…', understanding: '요청한 일과 제외할 조건을 확인하고 있어요…', component_retrieval: '필요한 금융 기능을 찾고 있어요…', planning: '상황에 맞는 화면을 설계하고 있어요…', repair: '화면 구성을 다시 확인하고 있어요…', reviewing: '요청한 기능과 제외 조건을 다시 검토하고 있어요…', refining: '검토 결과를 반영해 화면을 다듬고 있어요…', evidence: '공식 자료에서 필요한 근거를 확인하고 있어요…', binding: '입력값과 금융 기능을 연결하고 있어요…', committing: '화면을 반영하고 있어요…' })[stage] || '화면을 구성하고 있어요…'}</p>}
    </section>
    {error && <p role="alert" className="rounded-card bg-white p-4 text-body-2 text-red-700">{error}</p>}
    {needsRefresh && screen && <button disabled={isLoading} onClick={refresh} className="rounded-button bg-white p-3 text-body-2 underline">최신 화면 불러오기 · 입력값 초기화</button>}
    {proposal && <section aria-label="화면 변경 확인" className="flex flex-col gap-3 rounded-card border border-yellow bg-white p-4">
      <h2 className="text-title">변경 내용을 확인해주세요</h2>
      <p className="text-body-2 text-gray">아직 적용하지 않았어요. 내용을 확인한 뒤 선택해주세요.</p>
      {['added', 'removed', 'updated'].map(key => proposal.changes?.[key]?.length > 0 && <p key={key} className="text-body-2"><strong>{({ added: '추가', removed: '제거', updated: '수정' })[key]}</strong> · {proposal.changes[key].map(item => item.title).join(', ')}</p>)}
      {!!proposal.changes?.context_changed?.length && <p className="text-body-2 text-gray">요청에 맞게 금융 조건도 변경돼요. 미리보기에서 확인해주세요.</p>}
      <button aria-pressed={showPreview} onClick={() => setShowPreview(!showPreview)} className="text-left text-body-2 underline">{showPreview ? '기존 화면 보기' : '변경 후 미리보기'}</button>
      <button disabled={isLoading || needsRefresh} onClick={() => decide('commit')} className="rounded-button bg-yellow p-3 text-body-1 disabled:opacity-50">이 변경 적용</button>
      <button disabled={isLoading || needsRefresh} onClick={() => decide('cancel')} className="rounded-button border border-gray/20 p-3 text-body-2 disabled:opacity-50">기존 화면 유지</button>
    </section>}
    {showPreview && proposal && <p role="status" className="text-body-2 text-gray">변경 후 미리보기 · 적용 전에는 입력할 수 없어요.</p>}
    <section aria-label="맞춤 금융 화면" className="flex flex-col gap-3">
      {(displayed?.widgets || []).map(widget => <WidgetRenderer key={widget.id || widget.type} widget={widget}
        values={inputValues[widget.id] || {}}
        onValuesChange={values => setInputValues(previous => ({ ...previous, [widget.id]: values }))}
        onSubmit={submit} busy={busy} referenceData={references?.[widget.id]} onSheetOpenChanged={setIsSheetOpen} />)}
    </section>
    <div className={`fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[375px] bg-background/90 px-[10px] pb-[12px] pt-2 ${isSheetOpen ? 'hidden' : ''}`}>
      <Chat onSubmit={submit} isLoading={busy} disabledMessage={needsRefresh ? '최신 화면을 불러오거나 새 대화를 시작해주세요.' : proposal ? '변경안을 적용하거나 기존 화면을 유지해주세요.' : undefined} />
      {screen && <button disabled={isLoading || (!!proposal && !needsRefresh)} onClick={() => { setProposal(null); setShowPreview(false); setNeedsRefresh(false); setScreen(null); setMessages([]); setError(''); setInputValues({}); }} className="mt-2 w-full text-center text-caption-1 text-gray">새 대화 시작</button>}
    </div>
  </div>;
}

import LoanBudgetAssessment from './LoanBudgetAssessment.jsx';
const number=value=>Number(value).toLocaleString('ko-KR');
const difference=value=>`${Number(value)>0?'+':''}${number(value)}원`;
export default function LoanComparison({ comparison, onDelete, onApply, budgetDraft, onBudgetDraft, onBudgetSave, selectedId, busy }) {
  return <section aria-label="대출 조건 비교" className="flex flex-col gap-3 rounded-card bg-white p-4">
    <h2 className="text-title">대출 조건 비교 · {comparison.items.length}/4</h2>
    <p className="text-caption-1 leading-5 text-gray">대출 상환 조건에서 금리·기간을 바꿔 최대 4개를 저장할 수 있어요. 첫 번째 조건을 기준으로 차이를 표시해요.</p>
    <form aria-label="월 상환 예산 설정" className="flex flex-col gap-2 rounded-button border border-gray/20 p-3" onSubmit={event=>{event.preventDefault();onBudgetSave();}}>
      <label className="flex flex-col gap-1 text-caption-1 text-gray">월 상환 예산 (원)
        <input aria-label="월 상환 예산 (원)" type="number" min="0" max="1000000000000" step="1" value={budgetDraft} onChange={event=>onBudgetDraft(event.target.value)} disabled={busy} placeholder="예: 500000" className="rounded-button bg-background p-3 text-body-2 text-darkgray" />
      </label>
      <p className="text-caption-1 text-gray">저장한 예산 {comparison.budget_won===null?'없음':`${number(comparison.budget_won)}원`} · 전체 상환 회차 기준</p>
      <button disabled={busy} className="rounded-button bg-yellow p-3 text-body-2 disabled:opacity-50">월 예산 저장</button>
      {comparison.budget_won!==null && <button type="button" disabled={busy} onClick={()=>onBudgetSave(true)} className="p-2 text-caption-1 text-gray underline">예산 지우기</button>}
    </form>
    {!comparison.items.length && <p className="text-body-2 text-gray">아래 대출 조건을 입력하고 ‘이 조건을 비교에 저장’을 눌러주세요.</p>}
    {comparison.items.length>1 && !comparison.same_principal && <p role="status" className="text-body-2 text-gray">원금이 달라 총이자·월 납입액 순위를 표시하지 않아요.</p>}
    {comparison.items.map(item=>{
      const {input,values}=item.calculation;
      return <article key={item.id} aria-label={item.label} className="flex flex-col gap-3 rounded-button border border-gray/20 p-3">
        <h3 className="text-body-1">{item.label}{comparison.baseline_id===item.id?' · 비교 기준':''}</h3>
        <p className="text-caption-1 text-gray">원금 {number(input.principal_won)}원 · 연 {input.annual_rate_percent}% · {input.months}개월</p>
        <dl className="grid grid-cols-2 gap-2 text-body-2">
          <dt>일반 회차 월 납입액</dt><dd className="text-right font-bold">{number(values.regular_payment_won)}원</dd>
          <dt>총이자</dt><dd className="text-right font-bold">{number(values.total_interest_won)}원</dd>
          <dt>총 납입액</dt><dd className="text-right">{number(values.total_payment_won)}원</dd>
        </dl>
        {(item.lowest_regular_payment_won || item.lowest_total_interest_won) && <p className="rounded-button bg-yellow/20 p-2 text-caption-1">{[item.lowest_regular_payment_won?'월 납입액 최소':null,item.lowest_total_interest_won?'총이자 최소':null].filter(Boolean).join(' · ')} · 저장한 동일 원금 조건 기준</p>}
        {comparison.baseline_id!==item.id && item.difference_from_first && <p className="text-caption-1 leading-5 text-gray">첫 조건 대비 월 납입액 {difference(item.difference_from_first.regular_payment_won)} · 총이자 {difference(item.difference_from_first.total_interest_won)}</p>}
        <LoanBudgetAssessment assessment={item.budget_assessment} />
        <button disabled={busy || selectedId===item.id} onClick={()=>onApply(item.id)} aria-label={`${item.label} 적용 미리보기`} className="rounded-button bg-yellow p-3 text-body-2 disabled:opacity-50">{selectedId===item.id?'현재 화면에 적용된 조건':'이 조건으로 적용 미리보기'}</button>
        <button disabled={busy} onClick={()=>onDelete(item.id)} aria-label={`${item.label} 삭제`} className="text-right text-caption-1 text-gray underline disabled:opacity-50">비교에서 삭제</button>
      </article>;
    })}
    {!!comparison.items.length && <p className="text-caption-1 leading-5 text-gray">고정금리·원리금균등 월납을 가정해요. 원 단위 반올림으로 마지막 회차 납입액이 달라질 수 있어요. 수수료·중도상환·금리 변경은 제외해요. 조건 저장 후 최대 30분 또는 대화 만료까지 보관해요.</p>}
  </section>;
}

import LoanBudgetAssessment from './LoanBudgetAssessment.jsx';
const number=value=>Number(value).toLocaleString('ko-KR');
const reasons={shortest_term:'가장 짧은 기간',lowest_total_interest:'총이자 최소',lowest_peak_payment:'최대 회차 납입액 최소'};
export default function LoanTermSearch({ result, comparison, onSave, busy }) {
  return <section aria-label="예산 내 상환기간 찾기 결과" className="flex flex-col gap-3 rounded-card border border-yellow bg-white p-4">
    <h2 className="text-title">예산에 맞는 기간 계산</h2>
    <p className="text-body-2">기준 조건 · {result.source_label}</p>
    <p className="text-caption-1 leading-5 text-gray">원금 {number(result.source_input.principal_won)}원 · 연 {result.source_input.annual_rate_percent}% · 저장한 월 예산 {number(result.budget_won)}원</p>
    <p className="text-caption-1 leading-5 text-gray">1~{result.max_months}개월의 전체 상환표를 계산했고, {result.feasible_terms}개 기간이 마지막 회차까지 예산 이내예요.</p>
    {result.status==='no_match' && <div className="rounded-button bg-background p-3 text-body-2 leading-6">
      <p>지정한 기간 범위에는 예산 이내인 조건이 없어요.</p>
      <p>범위 안에서 가장 낮은 최대 회차 납입액도 {number(result.closest.budget_assessment.peak_payment_won)}원으로, 예산보다 {number(result.closest.budget_assessment.max_overrun_won)}원 높아요.</p>
      <p>월 예산이나 최대 기간을 바꾼 뒤 다시 계산할 수 있어요.</p>
    </div>}
    {result.candidates.map((candidate,index)=>{
      const saved=comparison.items.some(item=>Number(item.calculation.input.principal_won)===Number(candidate.input.principal_won)&&Number(item.calculation.input.annual_rate_percent)===Number(candidate.input.annual_rate_percent)&&item.calculation.input.months===candidate.input.months);
      return <article key={candidate.input.months} aria-label={`${candidate.input.months}개월 계산 조건`} className="flex flex-col gap-2 rounded-button border border-gray/20 p-3">
        <h3 className="text-body-1">{candidate.input.months}개월 · {candidate.reasons.map(reason=>reasons[reason]).join(' · ')}</h3>
        <dl className="grid grid-cols-2 gap-2 text-body-2"><dt>일반 회차 월 납입액</dt><dd className="whitespace-nowrap text-right font-bold">{number(candidate.values.regular_payment_won)}원</dd><dt>총이자</dt><dd className="whitespace-nowrap text-right font-bold">{number(candidate.values.total_interest_won)}원</dd></dl>
        <LoanBudgetAssessment assessment={candidate.budget_assessment} />
        <button disabled={busy||saved||comparison.items.length>=4} onClick={()=>onSave(index)} aria-label={`${candidate.input.months}개월 찾은 조건 저장`} className="rounded-button bg-yellow p-3 text-body-2 disabled:opacity-50">{saved?'이미 비교에 저장된 조건':'이 기간을 비교에 저장'}</button>
      </article>;
    })}
    {comparison.items.length>=4 && <p className="text-caption-1 text-gray">비교 조건이 4개예요. 기존 조건을 삭제하면 찾은 기간을 저장할 수 있어요.</p>}
    <p className="text-caption-1 leading-5 text-gray">입력한 원금·고정금리에서 계산한 조건이에요. 실제 상품의 대출 가능 기간이나 수수료는 포함하지 않아요. 저장 후 기존 비교·적용 미리보기로 이어갈 수 있어요.</p>
  </section>;
}

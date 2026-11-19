import LoanBudgetAssessment from './LoanBudgetAssessment.jsx';
const number=value=>Number(value).toLocaleString('ko-KR');
const signed=value=>`${Number(value)>0?'+':''}${number(value)}원`;
export default function LoanSelectionReview({ selection }) {
  return <div aria-label="대출 조건 적용 전후 비교" className="flex flex-col gap-3 border-b border-gray/20 pb-3">
    <p className="text-body-1">선택한 조건 · {selection.label}</p>
    <p className="text-caption-1 text-gray">원금 {number(selection.input.principal_won)}원 · 연 {selection.input.annual_rate_percent}% · {selection.input.months}개월</p>
    <p className="text-body-2 text-gray">적용하면 대출 입력값과 상환표를 함께 바꿔요. 아직 적용하지 않은 대출 입력은 선택한 조건으로 교체돼요.</p>
    <div className="overflow-x-auto"><table className="w-full text-right text-caption-1"><thead><tr><th className="text-left">항목</th><th>현재 계산</th><th>선택한 조건</th></tr></thead><tbody>
      {[['regular_payment_won','일반 회차 월 납입액'],['total_interest_won','총이자'],['total_payment_won','총 납입액']].map(([key,label])=><tr key={key} className="border-b border-gray/10"><th className="py-2 text-left font-normal">{label}</th><td>{selection.previous_values?`${number(selection.previous_values[key])}원`:'계산 전'}</td><td>{number(selection.values[key])}원</td></tr>)}
    </tbody></table></div>
    {selection.difference_from_current && <p className="text-caption-1 leading-5 text-gray">현재 대비 월 납입액 {signed(selection.difference_from_current.regular_payment_won)} · 총이자 {signed(selection.difference_from_current.total_interest_won)}</p>}
    {selection.previous_values && !selection.same_principal_as_current && <p className="text-caption-1 text-gray">원금이 달라 현재 계산과의 총이자 차이는 직접 비교하지 않아요.</p>}
    <LoanBudgetAssessment assessment={selection.budget_assessment} />
    {!selection.budget_assessment && <p className="text-caption-1 text-gray">월 예산을 설정하면 전체 회차의 예산 초과 여부도 확인할 수 있어요.</p>}
  </div>;
}

const number=value=>Number(value).toLocaleString('ko-KR');
export default function LoanBudgetAssessment({ assessment }) {
  if(!assessment)return null;
  return <div className="flex flex-col gap-1 rounded-button bg-background p-3 text-caption-1 leading-5">
    <strong>{assessment.within_budget?'월 예산 이내':'월 예산 초과'}</strong>
    <p>월 예산 {number(assessment.budget_won)}원 · 최대 회차 납입액 {number(assessment.peak_payment_won)}원</p>
    <p>{assessment.within_budget?`최대 납입 회차에도 ${number(assessment.headroom_won)}원 여유가 있어요.`:`${assessment.over_budget_months}개 회차에서 초과해요. 최대 초과액은 ${number(assessment.max_overrun_won)}원이고, 첫 초과는 ${assessment.first_over_budget_month}회차예요.`}</p>
    <p>마지막 회차 정산을 포함한 전체 상환표 기준이에요.</p>
  </div>;
}

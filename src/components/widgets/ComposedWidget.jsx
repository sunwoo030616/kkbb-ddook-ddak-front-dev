import Title from '../Title.jsx';
import shield from '../../assets/icons/shield.svg';
import { useState } from 'react';

const number = value => Number(value).toLocaleString('ko-KR');
const FIELDS = {
  funding_inputs_widget: [['maturity_interest_net_won','세후 만기 이자 (원)'],['early_interest_net_won','세후 중도해지 이자 (원)'],['loan_principal_won','필요한 대출 원금 (원)'],['annual_loan_rate_percent','연 금리 (%)'],['loan_days','사용 일수'],['extra_loan_cost_won','추가 비용 (없으면 0원)']],
  loan_inputs_widget: [['principal_won','대출 원금 (원)'],['annual_rate_percent','연 금리 (%)'],['months','상환 개월 수']],
};

function InputForm({ widget, values, onValuesChange, onSubmit, busy, onSaveScenario, scenarioCount }) {
  const defaults = widget.data?.values || {};
  const formValues = { ...defaults, ...values };
  const fields = FIELDS[widget.type];
  const calculation = () => {
    const input={...Object.fromEntries(fields.map(([key])=>[key,formValues[key] ?? ''])),kind:widget.type==='loan_inputs_widget'?'amortized_loan':'funding_comparison'};
    for(const key of ['months','loan_days'])if(key in input)input[key]=Number(input[key]);
    return input;
  };
  return <form className="grid grid-cols-1 gap-3" onSubmit={event => {
    event.preventDefault();
    onSubmit(widget.type === 'funding_inputs_widget' ? '현재 화면을 유지하고 입력한 조건으로 예금 유지·해지 비용을 계산해줘' : '현재 화면을 유지하고 입력한 조건으로 대출 월 상환표를 계산해줘', calculation());
  }}>
    {fields.map(([key,label]) => <label key={key} className="flex flex-col gap-1 text-caption-1 text-gray">{label}
      <input aria-label={label} name={key} type="number" min={['principal_won','loan_principal_won','months','loan_days'].includes(key)?1:0} max={key==='months'?600:key==='loan_days'?3650:key.includes('rate')?100:1000000000000} required step={key.includes('rate') ? '0.000001' : '1'}
        value={formValues[key] ?? ''} disabled={busy}
        onChange={event => onValuesChange({ ...formValues, [key]: event.target.value })}
        className="rounded-button border border-gray/20 bg-background p-3 text-body-2 text-darkgray outline-yellow" />
    </label>)}
    <button disabled={busy} className="rounded-button bg-yellow py-3 text-body-1 disabled:opacity-50">이 조건으로 계산</button>
    {widget.type==='loan_inputs_widget' && onSaveScenario && <>
      <label className="flex flex-col gap-1 text-caption-1 text-gray">비교 조건 이름 (선택)
        <input aria-label="비교 조건 이름" maxLength={40} value={formValues.scenario_label || ''} disabled={busy}
          onChange={event=>onValuesChange({...formValues,scenario_label:event.target.value})} className="rounded-button border border-gray/20 bg-background p-3 text-body-2" />
      </label>
      <button type="button" disabled={busy || scenarioCount>=4} onClick={event=>{
        if(event.currentTarget.form.reportValidity())onSaveScenario(calculation(),formValues.scenario_label?.trim() || `${formValues.months}개월 · 연 ${formValues.annual_rate_percent}%`);
      }} className="rounded-button border border-gray/20 p-3 text-body-2 disabled:opacity-50">이 조건을 비교에 저장</button>
      {scenarioCount>=4 && <p className="text-caption-1 text-gray">4개를 저장했어요. 비교에서 조건을 삭제하면 더 저장할 수 있어요.</p>}
    </>}
  </form>;
}

export default function ComposedWidget({ widget, values, onValuesChange, onSubmit, busy, referenceData, onSaveScenario, scenarioCount }) {
  const [expanded, setExpanded] = useState(false);
  const data = widget.data || {}, context = widget.context || {};
  const quote = referenceData?.fx_quote || data.fx_quote;
  const rows = data.values?.schedule;
  const currency = data.currency || context.currency;
  return <section data-widget={widget.type} className="flex flex-col gap-3 rounded-card bg-white px-4 py-5">
    <Title icon={shield} title={widget.title} />
    {FIELDS[widget.type] ? <InputForm {...{ widget, values, onValuesChange, onSubmit, busy, onSaveScenario, scenarioCount }} /> :
      widget.data_origin === 'server_decimal_calculator' ? <>
        {data.values?.interest_difference_won !== undefined && <>
          <p className="text-body-2 text-gray">대출 비용을 뺀 만기 이자와 중도해지 이자의 차이</p>
          <strong className="text-[26px] text-darkgray">{number(data.values.interest_difference_won)}원</strong>
          <p className="text-caption-1 text-gray">입력한 조건의 이자 차이예요. 재투자와 다른 시점의 현금흐름은 포함하지 않아요.</p>
        </>}
        {rows && <>
          <p className="text-caption-1 text-gray">일반 회차 월 납입액</p>
          <strong className="text-[26px]">{number(data.values.regular_payment_won)}원</strong>
          <div className="overflow-x-auto"><table className="w-full text-right text-caption-1"><thead><tr><th className="text-left">회차</th><th>납입액</th><th>남은 원금</th></tr></thead><tbody>
            {(expanded ? rows : rows.slice(0,6)).map(row => <tr key={row.month} className="border-b border-gray/10"><td className="py-2 text-left">{row.month}</td><td>{number(row.payment_won)}</td><td>{number(row.balance_won)}</td></tr>)}
          </tbody></table></div>
          {rows.length > 6 && <button className="text-body-2 text-gray underline" onClick={() => setExpanded(!expanded)}>{expanded ? '간단히 보기' : '전체 상환표 보기'}</button>}
          <p className="text-caption-1 text-gray">총 이자 {number(data.values.total_interest_won)}원</p>
        </>}
      </> : data.evidence ? <>
        {data.evidence.length ? data.evidence.map(hit => <div key={hit.chunk_id} className="flex flex-col gap-2">
          <p className="text-body-2 leading-6 text-darkgray">{hit.text}</p><a className="text-caption-1 text-gray underline" href={hit.url} target="_blank" rel="noreferrer">공식 안내 확인 ↗</a>
        </div>) : <p className="text-body-2 text-gray">현재 기관과 기준일에 맞는 근거를 확인하지 못했어요.</p>}
      </> : widget.state === 'input_required' ? <p className="text-body-2 text-gray">입력 위젯에 조건을 넣으면 계산 결과를 보여드릴게요.</p> : <>
        {context.destination && <p className="text-body-2">목적지 <strong>{context.destination}</strong>{context.trip_days ? ` · ${context.trip_days}일 일정` : ''}</p>}
        {currency && <p className="text-body-2">통화 <strong>{currency}</strong></p>}
        {context.amount && <p className="text-body-2">요청 금액 {number(context.amount.value)} {context.amount.currency}</p>}
        {quote && <div className="flex flex-col gap-2 rounded-button bg-background p-3">
          <p className="text-body-2">참고환율 1 {currency} ≈ {number(quote.krw_per_unit)}원</p>
          {quote.estimated_krw && <strong className="text-title">예상 원화 {number(quote.estimated_krw)}원</strong>}
          <p className="text-caption-1 text-gray">{quote.stale ? '이전 조회 자료 · ' : ''}실제 은행 거래 환율·수수료는 별도로 확인해주세요.</p>
          <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer" className="text-caption-1 text-gray underline">Rates By Exchange Rate API</a>
        </div>}
        {context.group_name && <p className="text-body-2">모임 {context.group_name}</p>}
        <p className="text-caption-1 leading-5 text-gray">{widget.actions?.length ? '본인인증과 금융기관 연결 후 요청을 확인할 수 있어요.' : '필요한 금융 기능을 준비했어요. 계좌·상품 정보는 금융기관 연결 후 확인할 수 있어요.'}</p>
        {widget.actions?.length > 0 && <button disabled className="rounded-button bg-background py-3 text-body-2 text-gray">금융기관 연결 필요</button>}
      </>}
    {widget.knowledge && <aside aria-label="화면 구성의 공식 근거" className="flex flex-col gap-2 border-t border-gray/10 pt-3">
      <p className="text-caption-1 text-gray">공식 자료 검색 · 조회 기준일 {widget.knowledge.as_of}</p>
      {widget.knowledge.evidence.map(hit => <details key={hit.chunk_id} className="text-caption-1 text-gray">
        <summary className="cursor-pointer">{hit.title} · {hit.section}</summary>
        <p className="pt-2">자료 확인일 {hit.verified_at}{hit.content_as_of ? ` · 내용 기준일 ${hit.content_as_of}` : ''}</p>
        <p className="py-2 leading-6">{hit.text}</p>
        <a href={hit.url} target="_blank" rel="noreferrer" className="underline">원문 확인 ↗</a>
      </details>)}
      {widget.knowledge.missing_topics.length > 0 && <p className="text-caption-1 text-gray">요청한 설명의 일부는 현재 기관·기준일의 자료에서 확인하지 못했어요. 실제 상품 조건은 금융기관에서 확인해주세요.</p>}
    </aside>}
  </section>;
}

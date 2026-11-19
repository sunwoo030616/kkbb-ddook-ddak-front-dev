export default function ScreenHistory({ history, onRestore, busy }) {
  return <section aria-label="저장된 화면 이력" className="flex flex-col gap-3 rounded-card bg-white p-4">
    <h2 className="text-title">저장된 화면</h2>
    <p className="text-caption-1 leading-5 text-gray">마지막 저장 후 30분 동안 최근 화면을 최대 10개 보관해요. 저장된 입력 조건과 계산 결과를 함께 복구하며, 적용 전 미리 확인할 수 있어요.</p>
    {!history.items.length && <p className="text-body-2 text-gray">보관된 화면이 없어요.</p>}
    <ol className="flex flex-col gap-3">
      {history.items.map(item => <li key={item.revision} className="flex flex-col gap-2 rounded-button border border-gray/20 p-3">
        <p className="text-body-2"><strong>화면 {item.revision}</strong>{item.is_current ? ' · 현재 화면' : ''}{item.restored_from_revision ? ` · 화면 ${item.restored_from_revision}에서 복구` : ''}</p>
        <p className="text-body-2 text-darkgray">{item.title}</p>
        <p className="text-caption-1 leading-5 text-gray">{item.widgets.map(widget => widget.title).join(' · ') || '기능을 비운 화면'}</p>
        {!item.is_current && <>
          <button disabled={busy || !item.can_restore} onClick={() => onRestore(item.revision)}
            aria-label={`화면 ${item.revision} 복구`} className="rounded-button bg-background p-3 text-body-2 disabled:opacity-50">이 화면으로 복구</button>
          {item.unavailable_reason && <p className="text-caption-1 text-gray">{item.unavailable_reason}</p>}
        </>}
      </li>)}
    </ol>
  </section>;
}

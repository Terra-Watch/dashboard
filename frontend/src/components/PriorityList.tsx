import { useEffect, useRef } from 'react';

type RecordItem={cell_id:number;state:string;rank_percentile:number;band:string;top_drivers:string[]};

export function PriorityList({
  records,
  limit,
  selectedCellId = null,
  onSelect,
}: {
  records: RecordItem[];
  limit: number;
  selectedCellId?: number | null;
  onSelect?: (record: RecordItem) => void;
}) {
  const visible = records.slice(0, limit);
  const selectedRecord = selectedCellId === null ? undefined : records.find(item => item.cell_id === selectedCellId);
  if (selectedRecord && !visible.some(item => item.cell_id === selectedCellId)) visible.push(selectedRecord);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (selectedCellId !== null && visible.some(item => item.cell_id === selectedCellId)) {
      selectedRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedCellId, records, limit]);

  return (
    <section className="priority-list" aria-labelledby="priority-title">
      <div className="section-heading">
        <div><span className="eyebrow">Areas to monitor</span><h2 id="priority-title">Highest-ranked forest areas</h2></div>
        <span className="state-chip">Top {limit}</span>
      </div>
      {visible.length ? (
        <div className="priority-table" role="table">
          <div className="priority-row priority-header" role="row"><span>Order</span><span>Area</span><span>Rank band</span></div>
          {visible.map((item,index) => {
            const selected = item.cell_id === selectedCellId;
            return (
              <button
                ref={selected ? selectedRef : null}
                type="button"
                className={`priority-row${selected ? ' is-selected' : ''}`}
                style={selected ? { background: 'var(--paper)', boxShadow: 'inset 3px 0 var(--canopy)' } : undefined}
                role="row"
                aria-pressed={selected}
                data-testid={`priority-item-${item.cell_id}`}
                key={item.cell_id}
                onClick={() => onSelect?.(item)}
              >
                <span>{records.indexOf(item)+1}</span><span>{item.state}</span>
                <span className={`band band-${item.band.toLowerCase().replace(' ','-')}`}>{item.band}</span>
              </button>
            );
          })}
        </div>
      ) : <div className="empty">No areas are available for this date.</div>}
    </section>
  );
}

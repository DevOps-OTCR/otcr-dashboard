'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import './when2meet.css';
import type { When2MeetGridSpec, When2MeetPollDetail } from '@/lib/api';

function rowBorderModifiers(
  rowIndex: number,
  slotStartMinute: number,
  slotEndMinute: number,
): string {
  const boundaryMin = slotStartMinute + (rowIndex + 1) * 15;
  if (boundaryMin >= slotEndMinute) {
    return ' w2m-row-bd-solid';
  }
  if (boundaryMin % 60 === 0) {
    return ' w2m-row-bd-solid';
  }
  if (boundaryMin % 30 === 0 && boundaryMin % 60 !== 0) {
    return ' w2m-row-bd-dash';
  }
  return '';
}

function findSlotIndexUnderPointer(
  gridEl: HTMLElement | null,
  clientX: number,
  clientY: number,
): number | null {
  if (!gridEl) return null;
  let nodes: HTMLElement[] = [];
  if (typeof document.elementsFromPoint === 'function') {
    nodes = document.elementsFromPoint(clientX, clientY) as HTMLElement[];
  }
  if (nodes.length === 0 && document.elementFromPoint) {
    const only = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (only) nodes = [only];
  }

  for (const el of nodes) {
    if (!gridEl.contains(el)) continue;
    const raw = el.getAttribute('data-slot');
    if (raw === null || raw === '') continue;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

type Props = {
  detail: When2MeetPollDetail;
  headlineFontClassName?: string;
  onCommitAvailability: (slots: number[]) => Promise<void>;
};

export function When2MeetBoard({
  detail,
  headlineFontClassName,
  onCommitAvailability,
}: Props) {
  const { numCols, numRows, totalSlots, slotStartMinute, slotEndMinute, columnLabels, rowStartLabels } =
    detail.grid satisfies When2MeetGridSpec;

  const userGridRef = useRef<HTMLDivElement>(null);

  const selectedRef = useRef<boolean[]>(new Array(totalSlots).fill(false));
  const dragActiveRef = useRef(false);
  const dragModeRef = useRef<'add' | 'remove' | null>(null);

  const [selected, setSelected] = useState<boolean[]>(() => {
    const next = new Array(totalSlots).fill(false);
    for (const s of detail.mySlots) {
      if (s >= 0 && s < totalSlots) next[s] = true;
    }
    selectedRef.current = next;
    return next;
  });

  const [hoveredGroupSlot, setHoveredGroupSlot] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const teamSize = Math.max(detail.teamSize, 1);

  const colorScale = useMemo(() => {
    const items: string[] = [];
    for (let k = 0; k <= teamSize; k += 1) {
      items.push(`rgba(48, 147, 56, ${k / teamSize})`);
    }
    return items;
  }, [teamSize]);

  const availabilityBySlot = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const row of detail.slots) {
      m.set(row.slotIndex, row.names);
    }
    return m;
  }, [detail.slots]);

  const mySlotsKey = detail.mySlots.join(',');

  useEffect(() => {
    if (dragActiveRef.current) return;
    const next = new Array(totalSlots).fill(false);
    for (const s of detail.mySlots) {
      if (s >= 0 && s < totalSlots) next[s] = true;
    }
    selectedRef.current = next;
    setSelected(next);
  }, [detail.poll.id, mySlotsKey, totalSlots]);

  const applyDragMode = useCallback((slotIdx: number, mode: 'add' | 'remove') => {
    setSelected((prev) => {
      if (!prev[slotIdx] && mode === 'add') {
        const next = [...prev];
        next[slotIdx] = true;
        selectedRef.current = next;
        return next;
      }
      if (prev[slotIdx] && mode === 'remove') {
        const next = [...prev];
        next[slotIdx] = false;
        selectedRef.current = next;
        return next;
      }
      return prev;
    });
  }, []);

  const endDragAndSave = useCallback(async () => {
    if (!dragActiveRef.current) return;
    dragActiveRef.current = false;
    dragModeRef.current = null;
    setSaveError(null);
    const indices: number[] = [];
    selectedRef.current.forEach((on, i) => {
      if (on) indices.push(i);
    });
    try {
      await onCommitAvailability(indices);
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? String((e as { response?: { data?: { message?: unknown } } }).response?.data?.message ?? '')
          : '';
      setSaveError(msg || 'Could not save availability.');
    }
  }, [onCommitAvailability]);

  useEffect(() => {
    const onDocPointerUp = () => {
      void endDragAndSave();
    };
    document.addEventListener('pointerup', onDocPointerUp);
    document.addEventListener('pointercancel', onDocPointerUp);
    return () => {
      document.removeEventListener('pointerup', onDocPointerUp);
      document.removeEventListener('pointercancel', onDocPointerUp);
    };
  }, [endDragAndSave]);

  const findUnder = useCallback((clientX: number, clientY: number) => {
    return findSlotIndexUnderPointer(userGridRef.current, clientX, clientY);
  }, []);

  const handleUserGridPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const idx = findUnder(event.clientX, event.clientY);
      if (idx === null) return;
      event.preventDefault();

      dragActiveRef.current = true;
      const removing = selectedRef.current[idx];
      dragModeRef.current = removing ? 'remove' : 'add';

      applyDragMode(idx, dragModeRef.current);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [applyDragMode, findUnder],
  );

  const handleUserGridPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragActiveRef.current || !dragModeRef.current) return;
      const idx = findUnder(event.clientX, event.clientY);
      if (idx === null) return;
      applyDragMode(idx, dragModeRef.current);
    },
    [applyDragMode, findUnder],
  );

  const handleUserGridPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      void endDragAndSave();
    },
    [endDragAndSave],
  );

  const hoveredNames = hoveredGroupSlot != null ? availabilityBySlot.get(hoveredGroupSlot) ?? [] : [];
  const hoveredCount = hoveredNames.length;

  const userCells: React.ReactNode[] = [];
  const groupCells: React.ReactNode[] = [];

  const gridTpl = { gridTemplateColumns: `repeat(${numCols}, minmax(0, 1fr))` };

  for (let col = 0; col < numCols; col += 1) {
    for (let row = 0; row < numRows; row += 1) {
      const slotIdx = col * numRows + row;
      const isOn = selected[slotIdx];
      const rowBd = rowBorderModifiers(row, slotStartMinute, slotEndMinute);

      userCells.push(
        <div
          key={`u-${slotIdx}`}
          role="presentation"
          className={`w2m-time-block${isOn ? ' w2m-selected' : ''}${rowBd}`}
          style={{ gridColumn: col + 1 }}
          data-slot={slotIdx}
        />,
      );

      const namesHere = availabilityBySlot.get(slotIdx) ?? [];
      const countHere = namesHere.length;
      const bg = colorScale[Math.min(countHere, colorScale.length - 1)] ?? 'transparent';

      groupCells.push(
        <div
          key={`g-${slotIdx}`}
          role="presentation"
          className={`w2m-time-block${rowBd}`}
          style={{
            gridColumn: col + 1,
            backgroundColor: bg,
          }}
          onMouseEnter={() => setHoveredGroupSlot(slotIdx)}
        />,
      );
    }
  }

  const hideLeftCal = hoveredGroupSlot != null;

  return (
    <div className="w2mRoot">
      <h1 className={headlineFontClassName}>{detail.poll.title}</h1>

      {saveError ? (
        <p className="text-center text-red-600 text-sm mt-2">{saveError}</p>
      ) : null}

      <div className="w2m-split">
        <div className="w2m-left">
          <div className={`w2m-available-overlay${hideLeftCal ? '' : ' w2m-hide'}`}>
            <h5>{`${hoveredCount}/${teamSize} Available`}</h5>
            <div className="w2m-avail-list">
              {hoveredNames.map((name, i) => (
                <p key={`${name}-${i}`}>{name}</p>
              ))}
            </div>
          </div>

          <div className={`w2m-left-cal${hideLeftCal ? ' w2m-hide-left' : ''}`}>
            <h5>Your Availability</h5>
            <div className="w2m-legend">
              <div className="w2m-legend-item">
                <p>Unavailable</p>
                <div className="w2m-square" />
              </div>
              <div className="w2m-legend-item">
                <p>Available</p>
                <div className="w2m-square w2m-green" />
              </div>
            </div>
            <p className="w2m-emphasis">Click and Drag to Toggle; Saved Immediately</p>
            <div className="w2m-schedule">
              <div className="w2m-times">
                {rowStartLabels.map((label, i) => (
                  <p key={`lt-${label}-${i}`} className="w2m-time-row">
                    {label}
                  </p>
                ))}
              </div>
              <div>
                <div className="w2m-days" style={gridTpl}>
                  {columnLabels.map((d, i) => (
                    <p key={`day-u-${i}`}>{d}</p>
                  ))}
                </div>
                <div
                  ref={userGridRef}
                  className="w2m-grid"
                  style={gridTpl}
                  onPointerDown={handleUserGridPointerDown}
                  onPointerMove={handleUserGridPointerMove}
                  onPointerUp={handleUserGridPointerUp}
                  onPointerCancel={handleUserGridPointerUp}
                >
                  {userCells}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w2m-right">
          <h5>{`Group's Availability`}</h5>
          <div className="w2m-color-scale">
            <p>{`0/${teamSize} available`}</p>
            <div className="w2m-colors">
              {colorScale.map((bg, idx) => (
                <div key={idx} className="w2m-color-item" style={{ backgroundColor: bg }} />
              ))}
            </div>
            <p>{`${teamSize}/${teamSize} available`}</p>
          </div>
          <p className="w2m-emphasis">Mouseover the Calendar to See Who Is Available</p>
          <div
            className="w2m-schedule"
            onMouseLeave={() => setHoveredGroupSlot(null)}
          >
            <div className="w2m-times">
              {rowStartLabels.map((label, i) => (
                <p key={`lr-${label}-${i}`} className="w2m-time-row">
                  {label}
                </p>
              ))}
            </div>
            <div>
              <div className="w2m-days" style={gridTpl}>
                {columnLabels.map((d, i) => (
                  <p key={`day-r-${i}`}>{d}</p>
                ))}
              </div>
              <div className="w2m-grid" style={gridTpl}>
                {groupCells}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

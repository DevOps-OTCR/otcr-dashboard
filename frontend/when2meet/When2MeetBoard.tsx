'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import './when2meet.css';
import type { When2MeetGridSpec, When2MeetPollDetail } from '@/lib/api';
import { pollAvailability } from './availability';

function formatSlotTime(minute: number): string {
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

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
  const groupGridRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

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
  const popupId = useId();
  const availability = useMemo(() => pollAvailability(detail), [detail]);

  // The details are drawn over the left column, across the gap from the group calendar, so a
  // mouse leaving the calendar closes them only if it does not reach the details shortly after.
  const mouseLeaveTimerRef = useRef<number | null>(null);
  const cancelMouseLeaveClose = useCallback(() => {
    if (mouseLeaveTimerRef.current != null) window.clearTimeout(mouseLeaveTimerRef.current);
    mouseLeaveTimerRef.current = null;
  }, []);
  const scheduleMouseLeaveClose = (event: ReactPointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    cancelMouseLeaveClose();
    mouseLeaveTimerRef.current = window.setTimeout(() => {
      mouseLeaveTimerRef.current = null;
      setHoveredGroupSlot(null);
    }, 300);
  };
  useEffect(() => cancelMouseLeaveClose, [cancelMouseLeaveClose]);

  const closeAvailability = () => {
    cancelMouseLeaveClose();
    // Restore focus before clearing the selection so onFocus does not reopen it.
    groupGridRef.current?.querySelector<HTMLButtonElement>(`[data-group-slot="${hoveredGroupSlot}"]`)
      ?.focus({ preventScroll: true });
    setHoveredGroupSlot(null);
  };

  const teamSize = availability.members.length;

  const colorScale = useMemo(() => {
    const items: string[] = [];
    for (let k = 0; k <= teamSize; k += 1) {
      items.push(`rgba(48, 147, 56, ${k / Math.max(teamSize, 1)})`);
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

  const availabilityOpen = hoveredGroupSlot != null;

  useEffect(() => {
    // Narrow layouts dock the details to the viewport bottom; cap their height so they stay
    // below the sticky navbar, which grows as its links wrap.
    const overlay = overlayRef.current;
    const navbar = document.querySelector('header');
    if (!availabilityOpen || !overlay || !navbar) return;
    const updateNavbarBottom = () => {
      overlay.style.setProperty('--w2m-navbar-bottom', `${Math.max(0, navbar.getBoundingClientRect().bottom)}px`);
    };
    updateNavbarBottom();
    const observer = new ResizeObserver(updateNavbarBottom);
    observer.observe(navbar);
    window.addEventListener('resize', updateNavbarBottom);
    window.addEventListener('scroll', updateNavbarBottom, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateNavbarBottom);
      window.removeEventListener('scroll', updateNavbarBottom);
    };
  }, [availabilityOpen]);

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

  const hovered = availability.forSlot(hoveredGroupSlot ?? -1);
  const slotTimeLabels = Array.from({ length: numRows }, (_, row) =>
    formatSlotTime(slotStartMinute + row * 15));
  const hoveredLabel = hoveredGroupSlot == null ? '' :
    `${columnLabels[Math.floor(hoveredGroupSlot / numRows)]}, ${slotTimeLabels[hoveredGroupSlot % numRows]}`;
  const repeatedNames = new Set(availability.members.filter((member, index, members) =>
    members.some((other, otherIndex) => otherIndex !== index && other.displayName === member.displayName))
    .map(member => member.displayName));

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
      const countHere = availability.hasIdentityData ? availability.bySlot.get(slotIdx)?.size ?? 0 : namesHere.length;
      const bg = colorScale[Math.min(countHere, colorScale.length - 1)] ?? 'transparent';

      groupCells.push(
        <button
          key={`g-${slotIdx}`}
          type="button"
          aria-label={`${columnLabels[col]}, ${slotTimeLabels[row]}: ${countHere} of ${teamSize} available`}
          aria-describedby={hoveredGroupSlot === slotIdx ? popupId : undefined}
          data-group-slot={slotIdx}
          className={`w2m-time-block${rowBd}`}
          style={{
            gridColumn: col + 1,
            backgroundColor: bg,
          }}
          onPointerEnter={event => {
            if (event.pointerType !== 'mouse') return;
            cancelMouseLeaveClose();
            setHoveredGroupSlot(slotIdx);
          }}
          onFocus={() => { cancelMouseLeaveClose(); setHoveredGroupSlot(slotIdx); }}
          onClick={() => { cancelMouseLeaveClose(); setHoveredGroupSlot(slotIdx); }}
        />,
      );
    }
  }

  const hideLeftCal = availabilityOpen;

  return (
    <div className="w2mRoot">
      <h1 className={headlineFontClassName}>{detail.poll.title}</h1>

      {saveError ? (
        <p className="text-center text-red-600 dark:text-red-400 text-sm mt-2">{saveError}</p>
      ) : null}

      <div className="w2m-split" onKeyDown={event => { if (event.key === 'Escape') closeAvailability(); }}>
        <div className="w2m-left">
          <div ref={overlayRef} id={popupId} role="region" aria-label="Time slot availability" aria-hidden={!hideLeftCal}
            className={`w2m-available-overlay${hideLeftCal ? '' : ' w2m-hide'}`}
            onPointerEnter={event => { if (event.pointerType === 'mouse') cancelMouseLeaveClose(); }}
            onPointerLeave={scheduleMouseLeaveClose}>
            <div className="w2m-availability-header">
              <p className="w2m-slot-label">{hoveredLabel}</p>
              <button type="button" className="w2m-availability-close" aria-label="Close availability details"
                onClick={closeAvailability}>Close</button>
            </div>
            <div className="w2m-availability-body">
            {availability.hasIdentityData ? <>
              <div className="w2m-availability-columns">
                {(['available', 'unavailable'] as const).map(kind => <section key={kind} aria-label={kind === 'available' ? 'Available' : 'Unavailable'}>
                  <h5>{kind === 'available' ? 'Available' : 'Unavailable'} ({hovered[kind].length})</h5>
                  <ul className="w2m-avail-list">
                    {hovered[kind].map(member => <li key={member.id}>
                      {member.displayName}{repeatedNames.has(member.displayName) ? <small>{member.email}</small> : null}
                    </li>)}
                  </ul>
                  {hovered[kind].length === 0 ? <p className="w2m-empty">No one {kind}.</p> : null}
                </section>)}
              </div>
              {hovered.unrecorded.length > 0 ? <section className="w2m-unrecorded" aria-label="No availability recorded">
                <h5>No availability recorded ({hovered.unrecorded.length})</h5>
                <ul className="w2m-avail-list">
                  {hovered.unrecorded.map(member => <li key={member.id}>
                    {member.displayName}{repeatedNames.has(member.displayName) ? <small>{member.email}</small> : null}
                  </li>)}
                </ul>
              </section> : null}
            </> : <p>Refresh the page to load full availability details.</p>}
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
          <p className="w2m-emphasis">Hover, focus, or tap a time to compare availability</p>
          <div className="w2m-schedule" onPointerLeave={scheduleMouseLeaveClose}>
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
              <div ref={groupGridRef} className="w2m-grid" style={gridTpl}>
                {groupCells}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { AdminSpan } from "@/lib/admin/classes-filters";

export type TimedEventInput = {
  id: string;
  startMs: number;
  endMs: number;
};

export type TimedEventLayout = {
  id: string;
  column: number;
  columnCount: number;
  clusterId: number;
};

export type OverflowChip<T = unknown> = {
  clusterId: number;
  count: number;
  startMs: number;
  endMs: number;
  /** Lane index for the "+N more" chip when columns are capped. */
  displayColumn: number;
  laneCount: number;
  hiddenEvents?: T[];
};

/**
 * Assign horizontal columns to overlapping timed events (Google Calendar style).
 * Events in the same overlap cluster share column width equally.
 */
export function layoutTimedEvents<T extends TimedEventInput>(
  events: T[],
): Array<T & TimedEventLayout> {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );

  // Build overlap clusters (connected chains on the timeline).
  let clusterId = 0;
  let clusterEnd = -Infinity;
  const clusterById = new Map<string, number>();

  for (const event of sorted) {
    if (event.startMs >= clusterEnd) {
      clusterId += 1;
      clusterEnd = event.endMs;
    } else {
      clusterEnd = Math.max(clusterEnd, event.endMs);
    }
    clusterById.set(event.id, clusterId);
  }

  // Greedy column assignment per cluster.
  const columnById = new Map<string, number>();
  const columnCountByCluster = new Map<number, number>();

  const byCluster = new Map<number, T[]>();
  for (const event of sorted) {
    const cid = clusterById.get(event.id)!;
    const list = byCluster.get(cid);
    if (list) list.push(event);
    else byCluster.set(cid, [event]);
  }

  for (const [cid, clusterEvents] of byCluster) {
    const columnEnds: number[] = [];
    for (const event of clusterEvents) {
      let column = columnEnds.findIndex((end) => end <= event.startMs);
      if (column < 0) {
        column = columnEnds.length;
        columnEnds.push(event.endMs);
      } else {
        columnEnds[column] = event.endMs;
      }
      columnById.set(event.id, column);
    }
    columnCountByCluster.set(cid, Math.max(1, columnEnds.length));
  }

  return sorted.map((event) => {
    const cid = clusterById.get(event.id)!;
    return {
      ...event,
      column: columnById.get(event.id) ?? 0,
      columnCount: columnCountByCluster.get(cid) ?? 1,
      clusterId: cid,
    };
  });
}

export type CappedTimedEvent<T> = T &
  TimedEventLayout & {
    laneCount: number;
    displayColumn: number;
  };

/**
 * Cap visible columns in dense views. When exceeded, hide trailing columns
 * behind a single "+N more" lane (Google Calendar pattern).
 */
export function capColumns<T extends TimedEventLayout & TimedEventInput>(
  laidOut: T[],
  maxCols: number,
): {
  visible: CappedTimedEvent<T>[];
  overflow: OverflowChip<T>[];
} {
  if (laidOut.length === 0) {
    return { visible: [], overflow: [] };
  }

  if (!Number.isFinite(maxCols)) {
    return {
      visible: laidOut.map((event) => ({
        ...event,
        laneCount: event.columnCount,
        displayColumn: event.column,
      })),
      overflow: [],
    };
  }

  const byCluster = new Map<number, T[]>();
  for (const event of laidOut) {
    const list = byCluster.get(event.clusterId);
    if (list) list.push(event);
    else byCluster.set(event.clusterId, [event]);
  }

  const visible: CappedTimedEvent<T>[] = [];
  const overflow: OverflowChip<T>[] = [];

  for (const [clusterId, events] of byCluster) {
    const columnCount = Math.max(...events.map((e) => e.columnCount));

    if (columnCount <= maxCols) {
      for (const event of events) {
        visible.push({
          ...event,
          laneCount: columnCount,
          displayColumn: event.column,
        });
      }
      continue;
    }

    const cutoff = maxCols - 1;
    const shown = events.filter((e) => e.column < cutoff);
    const hidden = events.filter((e) => e.column >= cutoff);

    for (const event of shown) {
      visible.push({
        ...event,
        laneCount: maxCols,
        displayColumn: event.column,
      });
    }

    if (hidden.length > 0) {
      overflow.push({
        clusterId,
        count: hidden.length,
        startMs: Math.min(...hidden.map((e) => e.startMs)),
        endMs: Math.max(...hidden.map((e) => e.endMs)),
        displayColumn: cutoff,
        laneCount: maxCols,
        hiddenEvents: hidden,
      });
    }
  }

  return { visible, overflow };
}

/** Max side-by-side lanes (visible events + optional "+N more") in week / 3-day views. */
export function maxColumnsForSpan(span: AdminSpan): number {
  if (span === 1) return Number.POSITIVE_INFINITY;
  if (span === 3) return 4; // 3 events + overflow lane
  return 3; // 2 events + overflow lane
}

export function laneGeometry(
  displayColumn: number,
  laneCount: number,
  gutterPct = 1,
): { leftPct: number; widthPct: number } {
  const inner = 100 - gutterPct * 2;
  const widthPct = inner / laneCount - gutterPct;
  const leftPct = gutterPct + displayColumn * (widthPct + gutterPct);
  return { leftPct, widthPct };
}

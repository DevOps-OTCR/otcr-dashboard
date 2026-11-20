import { Badge } from '@/components/ui/Badge';
import { LEVELS, NOT_REVIEWED, STATUSES } from './copy';
import type { QueueState } from './queue';
import type { ReviewLevel } from './types';

const STATE_VARIANT = {
  NOT_REVIEWED: 'default',
  AWAITING: 'warning',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  FAILED: 'danger',
} as const;

export function stateLabel(state: QueueState): string {
  return state === 'NOT_REVIEWED' ? NOT_REVIEWED : STATUSES[state].label;
}

export function StateBadge({ state, level }: { state: QueueState; level?: ReviewLevel }) {
  return (
    <Badge variant={STATE_VARIANT[state]} size="sm" dot={state !== 'NOT_REVIEWED'}>
      {level && state !== 'NOT_REVIEWED' ? `${LEVELS[level].label} · ` : ''}
      {stateLabel(state)}
    </Badge>
  );
}

export function LevelBadge({ level }: { level: ReviewLevel }) {
  return (
    <Badge variant={level === 'ADVANCED' ? 'info' : 'default'} size="sm">
      {LEVELS[level].label} review
    </Badge>
  );
}

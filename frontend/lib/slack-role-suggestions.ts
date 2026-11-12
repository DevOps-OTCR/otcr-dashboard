import type { AppRole } from '@/lib/permissions';

export type SlackRoleSuggestion = {
  id: string;
  slackTitle: string;
  currentRole: AppRole;
  suggestedRole: AppRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: AppRole;
  };
};

export type SlackRoleSuggestionList = {
  status: 'connected' | 'not_connected';
  message?: string;
  suggestions: SlackRoleSuggestion[];
};

/**
 * Only ADMINs may review Slack role suggestions. The backend enforces this;
 * the UI only hides the panel.
 */
export function canReviewSlackRoleSuggestions(role: unknown): boolean {
  return role === 'ADMIN';
}

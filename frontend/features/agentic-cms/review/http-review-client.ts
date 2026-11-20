// ReviewClient backed by the review-job API (reviews.controller.ts).

import axios from 'axios';
import { api } from '@/lib/api';
import type { RequestReviewInput, Review, ReviewClient, ReviewQueue } from './types';

const ERROR_COPY: Record<number, string> = {
  409: 'A review of this file at this level is already running.',
  403: 'You need PM or LC access on this project to run reviews.',
  404: 'AI review is turned off or this file is no longer available.',
  429: 'Too many requests. Try again in a minute.',
};

const FALLBACK_COPY = 'Could not reach AI review. Try again.';

/** Turns an axios error into an Error carrying user-facing copy. */
function toError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return new Error((status && ERROR_COPY[status]) || FALLBACK_COPY);
  }
  return new Error(FALLBACK_COPY);
}

async function call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
  try {
    const response = await fn();
    return response.data;
  } catch (error) {
    throw toError(error);
  }
}

const base = (projectId: string) => `/agentic-cms/reviews/projects/${encodeURIComponent(projectId)}`;

export function createHttpReviewClient(): ReviewClient {
  return {
    mocked: false,
    list: (projectId) => call<ReviewQueue>(() => api.get(base(projectId))),
    request: (input: RequestReviewInput) => {
      const focusNote = input.focusNote?.trim();
      const body = {
        submissionId: input.submissionId,
        level: input.level,
        ...(focusNote ? { focusNote } : {}),
      };
      return call<Review>(() => api.post(base(input.projectId), body));
    },
    retry: (projectId, reviewId) =>
      call<Review>(() => api.post(`${base(projectId)}/${encodeURIComponent(reviewId)}/retry`)),
    post: (projectId, reviewId) =>
      call<Review>(() => api.post(`${base(projectId)}/${encodeURIComponent(reviewId)}/post`)),
  };
}

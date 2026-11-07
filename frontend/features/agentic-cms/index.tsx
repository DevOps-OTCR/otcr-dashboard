'use client';

import { OtcrBot } from './OtcrBot';

// Loaded lazily by components/AgenticCmsFeature.tsx only after the backend
// enables Agentic CMS for the signed-in user. Keep all feature UI inside here.
export default function AgenticCms() {
  return <OtcrBot />;
}

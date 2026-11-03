import { useEffect } from 'react';

declare global {
  interface Window { featureLoads: number; featureEffects: number }
}
window.featureLoads = (window.featureLoads ?? 0) + 1;
export default function Feature() {
  useEffect(() => { window.featureEffects = (window.featureEffects ?? 0) + 1; }, []);
  return <div data-testid="agentic-feature">Agentic test feature</div>;
}

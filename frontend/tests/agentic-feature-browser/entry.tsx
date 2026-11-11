import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgenticCmsFeature } from '@/components/AgenticCmsFeature';
import { TestAuth } from './auth';

function TestApp() {
  const [email, setEmail] = useState('pilot@example.test');
  const [isLoggedIn, setLoggedIn] = useState(true);
  const getToken = useCallback(async () => 'synthetic-token', []);
  return <TestAuth.Provider value={{ isLoggedIn, user: { email }, getToken }}>
    <button onClick={() => setLoggedIn(false)}>Sign out</button>
    <button onClick={() => setLoggedIn(true)}>Sign in</button>
    <button onClick={() => setEmail('other@example.test')}>Switch account</button>
    <AgenticCmsFeature />
  </TestAuth.Provider>;
}
createRoot(document.getElementById('root')!).render(<TestApp />);

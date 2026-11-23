import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { startSession } from './auth/session.ts';
import './i18n.ts';
import './install/installPrompt.ts';
import './index.css';

const queryClient = new QueryClient();

// The session starts at boot (not inside Home): a registered player's refresh cookie is traded for an
// access token, or the guest token is fetched (Story 1.5), before any screen needs it.
startSession();

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

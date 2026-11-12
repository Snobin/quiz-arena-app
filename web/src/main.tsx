import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { startGuestSession } from './auth/guestSession.ts';
import './i18n.ts';
import './index.css';

const queryClient = new QueryClient();

// The guest session starts at boot (not inside Home): the token is ready, or being fetched, before
// any screen needs it.
startGuestSession();

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

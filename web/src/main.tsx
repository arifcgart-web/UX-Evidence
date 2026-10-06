import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { isConfigured } from './lib/supabase';
import { AuthProvider } from './lib/auth';
import { LibrariesProvider } from './lib/libraries';
import { SetupPage } from './pages/SetupPage';
import { Login } from './pages/Login';
import { Shell } from './pages/Shell';
import { HomeRedirect } from './pages/HomeRedirect';
import { LibraryPage } from './pages/LibraryPage';
import { TeamPage } from './pages/TeamPage';
import { InvitePage } from './pages/InvitePage';
import { ExtensionPage } from './pages/ExtensionPage';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

if (!isConfigured) {
  root.render(<SetupPage />);
} else {
  const router = createBrowserRouter([
    { path: '/login', element: <Login /> },
    {
      path: '/',
      element: <Shell />,
      children: [
        { index: true, element: <HomeRedirect /> },
        { path: 'l/:libraryId', element: <LibraryPage /> },
        { path: 'l/:libraryId/team', element: <TeamPage /> },
        { path: 'invite/:token', element: <InvitePage /> },
        { path: 'extension', element: <ExtensionPage /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ]);

  root.render(
    <StrictMode>
      <AuthProvider>
        <LibrariesProvider>
          <RouterProvider router={router} />
        </LibrariesProvider>
      </AuthProvider>
    </StrictMode>,
  );
}

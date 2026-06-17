import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import BaustellePage from '@/pages/BaustellePage';
import BaustelleDetailPage from '@/pages/BaustelleDetailPage';
import MangelPage from '@/pages/MangelPage';
import MangelDetailPage from '@/pages/MangelDetailPage';
import BerichtPage from '@/pages/BerichtPage';
import BerichtDetailPage from '@/pages/BerichtDetailPage';
import PublicFormBaustelle from '@/pages/public/PublicForm_Baustelle';
import PublicFormMangel from '@/pages/public/PublicForm_Mangel';
import PublicFormBericht from '@/pages/public/PublicForm_Bericht';
// <public:imports>
// </public:imports>
// <custom:imports>
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/6a326689292e299748fee5d3" element={<PublicFormBaustelle />} />
              <Route path="public/6a32668ed3e88e64583b36b6" element={<PublicFormMangel />} />
              <Route path="public/6a32668ed559536a0f02fae1" element={<PublicFormBericht />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="baustelle" element={<BaustellePage />} />
                <Route path="baustelle/:id" element={<BaustelleDetailPage />} />
                <Route path="mangel" element={<MangelPage />} />
                <Route path="mangel/:id" element={<MangelDetailPage />} />
                <Route path="bericht" element={<BerichtPage />} />
                <Route path="bericht/:id" element={<BerichtDetailPage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}

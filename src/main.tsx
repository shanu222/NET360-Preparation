import { createRoot } from "react-dom/client";
import { Suspense } from "react";
import App from "./app/App.tsx";
import { AuthProvider } from "./app/context/AuthContext.tsx";
import { AppDataProvider } from "./app/context/AppDataContext.tsx";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
import { FullViewportRouteFallback } from "./app/components/PageRouteFallback.tsx";
import { checkAppVersionFromServer, installChunkLoadRecovery, lazyWithRetry } from "./app/lib/chunkLoadRecovery.ts";
import { initializeNativeExperience } from "./app/lib/nativeMobile.ts";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import "./styles/tailwind.css";
import "./styles/theme.css";

installChunkLoadRecovery();
checkAppVersionFromServer();

const AdminApp = lazyWithRetry(() => import("./admin/AdminApp.tsx"));
const TestInterfacePage = lazyWithRetry(() =>
  import("./app/components/TestInterfacePage.tsx").then((m) => ({ default: m.TestInterfacePage })),
);
  const isAdminOnlyBuild = String((import.meta as any).env?.VITE_ADMIN_ONLY || '').toLowerCase() === 'true';
  const currentHost = window.location.hostname.toLowerCase();
  const isAdminHost = currentHost.includes('net360-admin') || currentHost.startsWith('admin.');
  const isAdminPanelRoute = window.location.pathname.startsWith('/admin');
  const isTestInterfaceRoute =
    window.location.pathname.startsWith('/test-interface') ||
    window.location.pathname.startsWith('/exam-interface');
  const shouldRenderAdminApp = isAdminPanelRoute || (isAdminOnlyBuild && isAdminHost);

  void initializeNativeExperience();

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <HelmetProvider>
        <Suspense fallback={<FullViewportRouteFallback />}>
          {
            // Keep exam/test routes highest priority so admin preview windows
            // still render the real test interface on admin-host deployments.
            isTestInterfaceRoute
              ? (
                <AuthProvider>
                  <AppDataProvider>
                    <TestInterfacePage />
                    <Toaster richColors position="top-right" closeButton visibleToasts={4} expand={false} offset={16} />
                  </AppDataProvider>
                </AuthProvider>
              )
              : shouldRenderAdminApp
                ? (
                    <>
                      <AdminApp />
                      <Toaster richColors position="top-right" closeButton visibleToasts={4} expand={false} offset={16} />
                    </>
                  )
                : (
                  <BrowserRouter>
                    <App />
                  </BrowserRouter>
                )
          }
        </Suspense>
      </HelmetProvider>
    </ErrorBoundary>,
  );
  
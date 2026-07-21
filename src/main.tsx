import { createRoot } from "react-dom/client";
import { Suspense, useEffect } from "react";
import { BrowserRouter, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import App from "./app/App.tsx";
import { AuthProvider } from "./app/context/AuthContext.tsx";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
import { FullViewportRouteFallback } from "./app/components/PageRouteFallback.tsx";
import { checkAppVersionFromServer, installChunkLoadRecovery, lazyWithRetry } from "./app/lib/chunkLoadRecovery.ts";
import { initializeNativeExperience } from "./app/lib/nativeMobile.ts";
import { registerAppNavigate } from "./app/lib/examWindowLaunch.ts";
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

void initializeNativeExperience();

function NavigateBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    registerAppNavigate(navigate);
    return () => registerAppNavigate(null);
  }, [navigate]);
  return null;
}

/** Shared student auth shell so exam ↔ app navigation does not remount AuthProvider. */
function StudentAuthLayout() {
  return (
    <AuthProvider>
      <NavigateBridge />
      <Outlet />
      <Toaster richColors position="top-right" closeButton visibleToasts={4} expand={false} offset={16} />
    </AuthProvider>
  );
}

function AdminShell() {
  return (
    <>
      <AdminApp />
      <Toaster richColors position="top-right" closeButton visibleToasts={4} expand={false} offset={16} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <HelmetProvider>
      <BrowserRouter>
        <Suspense fallback={<FullViewportRouteFallback />}>
          {isAdminOnlyBuild && isAdminHost ? (
            <Routes>
              {/* Exam preview must still work on admin-only hosts */}
              <Route element={<StudentAuthLayout />}>
                <Route path="/exam-interface" element={<TestInterfacePage />} />
                <Route path="/test-interface" element={<TestInterfacePage />} />
              </Route>
              <Route path="*" element={<AdminShell />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="/admin/*" element={<AdminShell />} />
              <Route element={<StudentAuthLayout />}>
                <Route path="/exam-interface" element={<TestInterfacePage />} />
                <Route path="/test-interface" element={<TestInterfacePage />} />
                <Route path="*" element={<App />} />
              </Route>
            </Routes>
          )}
        </Suspense>
      </BrowserRouter>
    </HelmetProvider>
  </ErrorBoundary>,
);

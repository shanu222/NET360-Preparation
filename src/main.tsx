
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import AdminApp from "./admin/AdminApp.tsx";
  import { AuthProvider } from "./app/context/AuthContext.tsx";
  import { AppDataProvider } from "./app/context/AppDataContext.tsx";
  import { Toaster } from "sonner";
  import { TestInterfacePage } from "./app/components/TestInterfacePage.tsx";
  import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
  import { initializeNativeExperience } from "./app/lib/nativeMobile.ts";
  import "./styles/index.css";

  const isAdminOnlyBuild = String((import.meta as any).env?.VITE_ADMIN_ONLY || '').toLowerCase() === 'true';
  const isAdminPanelRoute = window.location.pathname.startsWith('/admin');
  const isTestInterfaceRoute =
    window.location.pathname.startsWith('/test-interface') ||
    window.location.pathname.startsWith('/exam-interface');

  void initializeNativeExperience();

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      {
        isAdminOnlyBuild || isAdminPanelRoute
          ? <AdminApp />
          : isTestInterfaceRoute
            ? (
              <AuthProvider>
                <AppDataProvider>
                  <TestInterfacePage />
                  <Toaster richColors position="top-right" />
                </AppDataProvider>
              </AuthProvider>
            )
            : <App />
      }
    </ErrorBoundary>,
  );
  
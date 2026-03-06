
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import AdminApp from "./admin/AdminApp.tsx";
  import "./styles/index.css";

  const isAdminOnlyBuild = String((import.meta as any).env?.VITE_ADMIN_ONLY || '').toLowerCase() === 'true';
  const isAdminPanelRoute = window.location.pathname.startsWith('/admin');

  createRoot(document.getElementById("root")!).render(isAdminOnlyBuild || isAdminPanelRoute ? <AdminApp /> : <App />);
  
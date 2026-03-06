
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import AdminApp from "./admin/AdminApp.tsx";
  import "./styles/index.css";

  const isAdminPanelRoute = window.location.pathname.startsWith('/admin');

  createRoot(document.getElementById("root")!).render(isAdminPanelRoute ? <AdminApp /> : <App />);
  
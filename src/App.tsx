import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { NotificationHost } from "@/components/NotificationHost";
import { useChimes } from "@/hooks/useChimes";
import { useTheme } from "@/hooks/useTheme";
import { useWindowShell } from "@/hooks/useWindowShell";
import { CalendarPage } from "@/routes/CalendarPage";
import { HudPage } from "@/routes/HudPage";
import { MainPage } from "@/routes/MainPage";
import { ToastPage } from "@/routes/ToastPage";
import "@/styles/global.css";

export function App() {
  useChimes();
  useTheme();
  useWindowShell();

  return (
    <HashRouter>
      <NotificationHost />
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/hud" element={<HudPage />} />
        <Route path="/toast" element={<ToastPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

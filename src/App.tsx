import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { useChimes } from "@/hooks/useChimes";
import { CalendarPage } from "@/routes/CalendarPage";
import { HudPage } from "@/routes/HudPage";
import { MainPage } from "@/routes/MainPage";
import "@/styles/global.css";

export function App() {
  useChimes();

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/hud" element={<HudPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

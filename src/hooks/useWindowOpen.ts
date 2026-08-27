import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { isWindowOpen, toggleWindow, type WindowLabel } from "@/lib/windows";

export function useWindowOpen(label: WindowLabel) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    isWindowOpen(label).then((value) => {
      if (active) setOpen(value);
    });

    const unlisten = listen<{ label: string; open: boolean }>("window:visibility", (event) => {
      if (event.payload.label === label) setOpen(event.payload.open);
    });

    return () => {
      active = false;
      unlisten.then((u) => u());
    };
  }, [label]);

  const toggle = useCallback(async () => {
    const next = await toggleWindow(label);
    setOpen(next);
    return next;
  }, [label]);

  return { open, toggle };
}

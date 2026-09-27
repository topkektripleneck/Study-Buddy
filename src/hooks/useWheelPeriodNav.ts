import { useEffect, type RefObject } from "react";
import { wheelPeriodStep } from "@/lib/schedule";

/** Scroll wheel on `ref` moves one period back/forward (non-passive so the page does not scroll). */
export function useWheelPeriodNav(
  ref: RefObject<HTMLElement | null>,
  onStep: (step: -1 | 1) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const step = wheelPeriodStep(e.deltaY);
      if (step === 0) return;
      e.preventDefault();
      onStep(step);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [ref, onStep, enabled]);
}

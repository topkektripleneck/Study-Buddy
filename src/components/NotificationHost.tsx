import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect, useRef, useState } from "react";
import { navigateTo } from "@/lib/actions";
import { safeListen } from "@/lib/safeListen";
import { openWindow } from "@/lib/windows";
import type { AppNotification, NotifyPayload } from "@/types";

const KIND_META: Record<
  AppNotification["kind"],
  { label: string; glyph: string }
> = {
  timer: { label: "Timer", glyph: "⏱" },
  block: { label: "Schedule", glyph: "◷" },
  metrics: { label: "Streak", glyph: "◎" },
};

const DISMISS_MS = 8_000;

type NotificationHostProps = {
  variant?: "inline" | "popup";
  onEmpty?: () => void;
};

export function NotificationHost(props: NotificationHostProps = {}) {
  const label = getCurrentWebviewWindow().label;
  if (
    (props.variant ?? "inline") === "inline" &&
    (label === "toast" || label === "hud")
  ) {
    return null;
  }
  return <NotificationHostBody {...props} />;
}

function NotificationHostBody({
  variant = "inline",
  onEmpty,
}: NotificationHostProps) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const hadItems = useRef(false);

  const pushItem = useCallback((payload: NotifyPayload) => {
    const id = crypto.randomUUID();
    const entry: AppNotification = { ...payload, id };
    setItems((prev) => [entry, ...prev].slice(0, 5));
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (variant === "popup") {
      invoke<NotifyPayload[]>("notify_take_pending")
        .then((pending) => {
          for (const payload of pending) {
            pushItem(payload);
          }
        })
        .catch(() => {});
    }

    const off = safeListen<NotifyPayload>("notify:fired", (event) => {
      pushItem(event.payload);
    });

    return () => off();
  }, [pushItem, variant]);

  useEffect(() => {
    if (items.length > 0) {
      hadItems.current = true;
    }
  }, [items]);

  useEffect(() => {
    if (items.length === 0 && hadItems.current) {
      onEmpty?.();
    }
  }, [items, onEmpty]);

  function handleActivate(item: AppNotification) {
    if (variant === "popup") {
      openWindow("main").catch(() => {});
    }
    if (item.kind === "block") {
      navigateTo("schedule");
    } else {
      navigateTo("widgets");
    }
    dismiss(item.id);
  }

  if (items.length === 0) return null;

  const stackStyle = variant === "popup" ? popupStack : stack;

  return (
    <div style={stackStyle} aria-live="polite">
      {items.map((item) => (
        <NotificationCard
          key={item.id}
          item={item}
          variant={variant}
          onDismiss={dismiss}
          onActivate={handleActivate}
        />
      ))}
    </div>
  );
}

function NotificationCard({
  item,
  variant,
  onDismiss,
  onActivate,
}: {
  item: AppNotification;
  variant: "inline" | "popup";
  onDismiss: (id: string) => void;
  onActivate: (item: AppNotification) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const deadlineRef = useRef(Date.now() + DISMISS_MS);
  const pausedRemainingRef = useRef<number | null>(null);

  useEffect(() => {
    if (paused) {
      pausedRemainingRef.current = Math.max(0, deadlineRef.current - Date.now());
      return;
    }

    if (pausedRemainingRef.current !== null) {
      deadlineRef.current = Date.now() + pausedRemainingRef.current;
      pausedRemainingRef.current = null;
    }

    const delay = Math.max(0, deadlineRef.current - Date.now());
    const timeout = window.setTimeout(() => onDismiss(item.id), delay);
    return () => window.clearTimeout(timeout);
  }, [paused, item.id, onDismiss]);

  useEffect(() => {
    if (paused) return;

    const tick = () => {
      const remaining = Math.max(0, deadlineRef.current - Date.now());
      setProgress((remaining / DISMISS_MS) * 100);
    };

    tick();
    const interval = window.setInterval(tick, 50);
    return () => window.clearInterval(interval);
  }, [paused, item.id]);

  const meta = KIND_META[item.kind] ?? KIND_META.timer;
  const actionable = variant === "popup" || item.kind === "block" || item.kind === "timer";

  return (
    <div
      className={[
        "sb-glass sb-notify-card",
        actionable ? "sb-notify-card-actionable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={card}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={actionable ? () => onActivate(item) : undefined}
      title={
        actionable
          ? item.kind === "block"
            ? "Open schedule"
            : variant === "popup"
              ? "Click to open Study Buddy"
              : "Open widgets"
          : undefined
      }
    >
      <div style={cardHeader}>
        <span style={glyph} aria-hidden>
          {meta.glyph}
        </span>
        <span style={kindTag}>{meta.label}</span>
        <button
          type="button"
          className="sb-pressable sb-pressable-hover"
          style={closeBtn}
          onClick={(event) => {
            event.stopPropagation();
            onDismiss(item.id);
          }}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
      <strong style={title}>{item.title}</strong>
      <p style={body}>{item.body}</p>
      <div
        className="sb-notify-progress"
        style={{ width: `${progress}%` }}
        aria-hidden
      />
    </div>
  );
}

const stack = {
  position: "fixed" as const,
  top: "var(--sb-space-md)",
  right: "var(--sb-space-md)",
  zIndex: 95,
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  width: "min(340px, calc(100vw - 32px))",
  pointerEvents: "none" as const,
};

const popupStack = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  width: "100%",
  padding: "var(--sb-space-sm)",
};

const card = {
  pointerEvents: "auto" as const,
  padding: "12px 14px",
  borderRadius: "var(--sb-radius-md)",
  border: "1px solid var(--sb-border-glow)",
  boxShadow: "0 8px 28px rgba(0, 0, 0, 0.45)",
};

const cardHeader = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "6px",
};

const glyph = {
  fontSize: "14px",
  color: "var(--sb-accent)",
  lineHeight: 1,
};

const kindTag = {
  flex: 1,
  fontSize: "10px",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "var(--sb-text-muted)",
};

const closeBtn = {
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  fontSize: "16px",
  lineHeight: 1,
  padding: 0,
};

const title = {
  display: "block",
  fontSize: "14px",
  marginBottom: "4px",
  color: "var(--sb-text-primary)",
};

const body = {
  margin: 0,
  fontSize: "12px",
  lineHeight: 1.45,
  color: "var(--sb-text-secondary)",
};

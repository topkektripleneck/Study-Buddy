import { NotificationHost } from "@/components/NotificationHost";
import { closeWindow } from "@/lib/windows";

export function ToastPage() {
  return (
    <div className="sb-toast-page" style={shell}>
      <NotificationHost
        variant="popup"
        onEmpty={() => {
          closeWindow("toast").catch(() => {});
        }}
      />
    </div>
  );
}

const shell = {
  minHeight: "100vh",
  background: "transparent",
};

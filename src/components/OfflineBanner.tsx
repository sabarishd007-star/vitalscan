import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="bg-amber-500 text-white text-center text-sm font-semibold px-4 py-2 flex items-center justify-center gap-2">
      <WifiOff size={16} />
      You're offline. Recent scans and profiles may not sync until you reconnect.
    </div>
  );
}

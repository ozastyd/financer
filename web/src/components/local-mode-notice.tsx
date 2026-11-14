import { Info } from "lucide-react";
import { DATA_MODE } from "@/lib/config";

export function LocalModeNotice() {
  if (DATA_MODE !== "local") return null;
  return (
    <p className="notice" role="note">
      <Info size={16} aria-hidden="true" />
      <span>Mode lokal: layanan belum dikonfigurasi. Data hanya tersimpan di browser ini.</span>
    </p>
  );
}

"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useApp } from "@crewmate/state";

export default function LogoutButton() {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("Could not sign out. Check the identity service and try again.");
      const result = await response.json() as { redirectUrl: string };
      window.location.replace(result.redirectUrl);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not sign out", "error");
      setBusy(false);
    }
  }
  return <button onClick={logout} disabled={busy} aria-label="Sign out of local services" title="Sign out" className="p-2 rounded-lg text-text-3 hover:text-text hover:bg-surface-2 disabled:opacity-50"><LogOut size={16} /></button>;
}

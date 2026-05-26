"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, Trash2 } from "lucide-react";

export function AccountActions() {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/settings/account", { method: "DELETE" });
      if (res.ok) {
        await signOut({ callbackUrl: "/login" });
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-primary hover:border-accent/40 transition"
      >
        <LogOut size={15} />
        Log out
      </button>

      {!confirmDelete ? (
        <button
          onClick={() => setConfirmDelete(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-red-500 hover:border-red-500/40 transition"
        >
          <Trash2 size={15} />
          Delete account
        </button>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted">Permanently delete all data?</span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50 transition"
          >
            <Trash2 size={14} />
            {deleting ? "Deleting…" : "Yes, delete everything"}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="px-3 py-2 text-sm text-muted hover:text-primary transition"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

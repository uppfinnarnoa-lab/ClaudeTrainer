"use client";

import { useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";

export function ChangePasswordForm() {
  const [current, setCurrent]     = useState("");
  const [next, setNext]           = useState("");
  const [confirm, setConfirm]     = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(false);

  const mismatch = next && confirm && next !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch || !current || !next) return;
    setSaving(true);
    setError("");
    setSuccess(false);

    const res = await fetch("/api/settings/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });

    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(
        data.error === "wrong_password"
          ? "Current password is incorrect."
          : (data.error ?? "Something went wrong.")
      );
    } else {
      setSuccess(true);
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => setSuccess(false), 4000);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      {/* Current password */}
      <div>
        <label className="block text-sm font-medium text-primary mb-1.5">Current password</label>
        <div className="relative">
          <input
            type={showCurrent ? "text" : "password"}
            value={current}
            onChange={e => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
            className={inputCls}
          />
          <ShowToggle show={showCurrent} onToggle={() => setShowCurrent(v => !v)} />
        </div>
      </div>

      {/* New password */}
      <div>
        <label className="block text-sm font-medium text-primary mb-1.5">New password</label>
        <div className="relative">
          <input
            type={showNext ? "text" : "password"}
            value={next}
            onChange={e => setNext(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            className={inputCls}
          />
          <ShowToggle show={showNext} onToggle={() => setShowNext(v => !v)} />
        </div>
      </div>

      {/* Confirm */}
      <div>
        <label className="block text-sm font-medium text-primary mb-1.5">Confirm new password</label>
        <input
          type={showNext ? "text" : "password"}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          className={`${inputCls} ${mismatch ? "border-error focus:ring-error/50" : ""}`}
        />
        {mismatch && <p className="text-xs text-error mt-1">Passwords don't match.</p>}
      </div>

      {error   && <p className="text-sm text-error">{error}</p>}
      {success && <p className="text-sm text-accent">Password changed successfully.</p>}

      <button
        type="submit"
        disabled={saving || !!mismatch || !current || !next || !confirm}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white dark:text-background hover:opacity-90 disabled:opacity-40 transition"
      >
        {saving && <Loader2 size={15} className="animate-spin" />}
        Change password
      </button>
    </form>
  );
}

function ShowToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition"
    >
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface-2 px-4 py-2.5 pr-10 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 transition";

"use client";

import { useState } from "react";
import { ExternalLink, Eye, EyeOff, Loader2, Copy, CheckCircle } from "lucide-react";
import { SetupGuide, GARMIN_GUIDE } from "@/components/setup-guide";

interface Props {
  connected:       boolean;
  authUrl:         string | null;
  callbackUrl:     string;
  hasClientId:     boolean;
  hasClientSecret: boolean;
  isAdmin:         boolean;
}

export function GarminConnectSection({ connected, authUrl, callbackUrl, hasClientId, hasClientSecret, isAdmin }: Props) {
  const [clientId,     setClientId]     = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret,   setShowSecret]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [copied,       setCopied]       = useState(false);

  const credentialsSet = hasClientId && hasClientSecret;

  async function saveCredentials() {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSaving(true);
    await fetch("/api/settings/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        garminClientId:     clientId.trim(),
        garminClientSecret: clientSecret.trim(),
      }),
    });
    setSaving(false);
    setSaved(true);
    setClientId(""); setClientSecret("");
    window.location.reload();
  }

  function copyCallback() {
    navigator.clipboard.writeText(callbackUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Admin-only sections */}
      {isAdmin && <SetupGuide steps={GARMIN_GUIDE} defaultOpen={!credentialsSet} />}

      {isAdmin && (
        <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Redirect URI for Garmin portal</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono text-primary bg-surface px-3 py-2 rounded-lg border border-border break-all">
              {callbackUrl}
            </code>
            <button onClick={copyCallback} className="shrink-0 p-2 rounded-lg border border-border hover:bg-surface transition text-muted hover:text-primary">
              {copied ? <CheckCircle size={15} className="text-accent" /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      )}

      {/* Credentials — admin only */}
      {isAdmin && (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">
          Garmin Health API credentials
          {credentialsSet && <span className="ml-2 text-accent normal-case font-medium">✓ Saved</span>}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Client ID</label>
            <input type="text" value={clientId} onChange={e => setClientId(e.target.value)}
              placeholder={hasClientId ? "Already saved" : "Garmin client ID"} className={inp} />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Client Secret</label>
            <div className="relative">
              <input type={showSecret ? "text" : "password"} value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder={hasClientSecret ? "Already saved" : "Garmin client secret"}
                className={`${inp} pr-10`} />
              <button type="button" onClick={() => setShowSecret(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary">
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        </div>

        <button onClick={saveCredentials} disabled={saving || (!clientId.trim() && !clientSecret.trim())}
          className="inline-flex items-center gap-2 rounded-xl bg-surface border border-border px-4 py-2 text-sm font-medium text-primary hover:bg-surface-2 disabled:opacity-40 transition">
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saved ? "Saved ✓" : "Save credentials"}
        </button>
      </div>
      )}

      {/* Connect button */}
      {(isAdmin ? credentialsSet : hasClientId) && !connected && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Connect your account</p>
          <a href={authUrl ?? "#"}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            <ExternalLink size={15} />
            Connect with Garmin
          </a>
        </div>
      )}

      {connected && (
        <p className="text-sm text-accent">✓ Garmin is connected. HRV and sleep data syncs daily at 08:00.</p>
      )}
    </div>
  );
}

const inp = "w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 transition";

"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppearanceSettings() {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-12" />;

  const modes = [
    { value: "light",  label: "Light",  icon: Sun },
    { value: "dark",   label: "Dark",   icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-primary mb-1">Mode</p>
        <p className="text-xs text-muted mb-3">Choose between light mode, dark mode, or follow your system setting.</p>
        <div className="flex gap-2">
          {modes.map(({ value, label, icon: Icon }) => {
            const active = theme === value || (value !== "system" && theme === undefined && resolvedTheme === value);
            return (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border px-5 py-3 text-xs font-medium transition-all",
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-surface-2 text-muted hover:border-accent/40 hover:text-primary"
                )}
              >
                <Icon size={18} />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

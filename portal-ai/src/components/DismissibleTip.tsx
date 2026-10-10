// src/components/DismissibleTip.tsx
"use client";

import { XIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const PREFS_KEY = "portalai_prefs_v2";

interface DismissibleTipProps {
    tipId: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

export function DismissibleTip({ tipId, icon, children, className }: DismissibleTipProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(PREFS_KEY) ?? "{}";
            const prefs = JSON.parse(raw) as { dismissedTips?: string[] };
            if (!prefs.dismissedTips?.includes(tipId)) setVisible(true);
        } catch {
            setVisible(true);
        }
    }, [tipId]);

    function dismiss() {
        setVisible(false);
        try {
            const raw = window.localStorage.getItem(PREFS_KEY) ?? "{}";
            const prefs = JSON.parse(raw) as { dismissedTips?: string[] };
            prefs.dismissedTips = [...(prefs.dismissedTips ?? []), tipId];
            window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        } catch {
            // ignore
        }
    }

    if (!visible) return null;

    return (
        <div
            className={cn(
                "flex items-start gap-3 rounded-2xl border border-sky-500/15 bg-sky-500/8 px-4 py-3.5 text-sm text-sky-200",
                className
            )}
        >
            {icon && <div className="mt-0.5 shrink-0 text-sky-400">{icon}</div>}
            <div className="flex-1 leading-relaxed">{children}</div>
            <button
                type="button"
                onClick={dismiss}
                className="shrink-0 text-sky-400/50 hover:text-sky-300 transition"
                aria-label="Skryť tip"
            >
                <XIcon className="h-4 w-4" />
            </button>
        </div>
    );
}

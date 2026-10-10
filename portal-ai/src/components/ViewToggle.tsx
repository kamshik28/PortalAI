// src/components/ViewToggle.tsx
"use client";

import { LayoutGridIcon, ListIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
    value: "grid" | "list";
    onChange: (v: "grid" | "list") => void;
    className?: string;
}

export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
    return (
        <div
            className={cn(
                "flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5",
                className
            )}
        >
            {(["grid", "list"] as const).map((mode) => (
                <button
                    key={mode}
                    type="button"
                    onClick={() => onChange(mode)}
                    title={mode === "grid" ? "Mriežka" : "Zoznam"}
                    className={cn(
                        "flex items-center justify-center rounded-lg p-1.5 transition",
                        value === mode
                            ? "bg-white/12 text-white"
                            : "text-neutral-500 hover:text-neutral-300"
                    )}
                >
                    {mode === "grid" ? (
                        <LayoutGridIcon className="h-4 w-4" />
                    ) : (
                        <ListIcon className="h-4 w-4" />
                    )}
                </button>
            ))}
        </div>
    );
}

// src/components/SearchInput.tsx
"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface SearchInputProps {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    /** Register a global "/" shortcut to focus this input */
    globalShortcut?: boolean;
}

export function SearchInput({
    value,
    onChange,
    placeholder = "Hľadať...",
    className,
    autoFocus,
    globalShortcut,
}: SearchInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!globalShortcut) return;
        function handler(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (e.key === "/") {
                e.preventDefault();
                inputRef.current?.focus();
            }
        }
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [globalShortcut]);

    return (
        <div className={cn("relative", className)}>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                autoFocus={autoFocus}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-sm text-white placeholder:text-neutral-500
                    focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition"
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        onChange("");
                        inputRef.current?.blur();
                    }
                }}
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-500 hover:text-neutral-300 transition"
                >
                    <XIcon className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}

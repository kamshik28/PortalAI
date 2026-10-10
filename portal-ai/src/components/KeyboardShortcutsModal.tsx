// src/components/KeyboardShortcutsModal.tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KeyboardIcon } from "lucide-react";

const SECTIONS = [
    {
        title: "Navigácia",
        shortcuts: [
            { keys: ["G", "H"], desc: "Domovská stránka" },
            { keys: ["G", "C"], desc: "Kurzy" },
            { keys: ["G", "P"], desc: "Profil" },
            { keys: ["G", "S"], desc: "Nastavenia" },
        ],
    },
    {
        title: "Akcie",
        shortcuts: [
            { keys: ["?"], desc: "Zobraziť klávesové skratky" },
            { keys: ["/"], desc: "Fokus na vyhľadávanie" },
            { keys: ["Esc"], desc: "Zavrieť / zrušiť" },
        ],
    },
];

function Kbd({ children }: { children: string }) {
    return (
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            {children}
        </span>
    );
}

export function KeyboardShortcutsModal() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let buffer = "";
        let bufferTimer: ReturnType<typeof setTimeout> | null = null;

        function handler(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

            if (e.key === "?") {
                e.preventDefault();
                setOpen(true);
                return;
            }

            // Two-key G+X navigation shortcuts
            buffer += e.key.toUpperCase();
            if (bufferTimer) clearTimeout(bufferTimer);
            bufferTimer = setTimeout(() => { buffer = ""; }, 1200);

            if (buffer === "GH") { window.location.href = "/"; buffer = ""; }
            if (buffer === "GC") {
                const cookies = document.cookie || "";
                const role = cookies.split("; ").find((c) => c.startsWith("user_role="))?.split("=")[1];
                window.location.href = role === "teacher" ? "/teacher/courses" : "/student/courses";
                buffer = "";
            }
            if (buffer === "GP") { window.location.href = "/profile"; buffer = ""; }
            if (buffer === "GS") { window.location.href = "/settings"; buffer = ""; }
        }

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-foreground">
                        <KeyboardIcon className="h-4 w-4 text-muted-foreground" />
                        Klávesové skratky
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-3 space-y-5">
                    {SECTIONS.map((section) => (
                        <div key={section.title}>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                {section.title}
                            </p>
                            <div className="space-y-1">
                                {section.shortcuts.map((s, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent"
                                    >
                                        <span className="text-sm text-foreground">{s.desc}</span>
                                        <div className="flex items-center gap-1">
                                            {s.keys.map((k, j) => (
                                                <span key={j} className="flex items-center gap-1">
                                                    {j > 0 && (
                                                        <span className="text-muted-foreground text-xs">then</span>
                                                    )}
                                                    <Kbd>{k}</Kbd>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                    Skratky sú aktívne keď nie je fokus na inpute. Stlač{" "}
                    <Kbd>?</Kbd> kdekoľvek.
                </p>
            </DialogContent>
        </Dialog>
    );
}

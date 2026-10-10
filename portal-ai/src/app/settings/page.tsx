// src/app/settings/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { PageHeader } from "@/components/PageHeader";
import { UserAvatar } from "@/components/UserAvatar";
import { usePreferences, AVATAR_COLORS, type AvatarColorId } from "@/hooks/usePreferences";
import {
    LayoutGridIcon,
    ListIcon,
    MonitorIcon,
    MoonIcon,
    PaintbrushIcon,
    RotateCcwIcon,
    SaveIcon,
    SlidersHorizontalIcon,
    SunIcon,
    UserIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

function SectionCard({
    icon,
    title,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-5 flex items-center gap-2">
                <div className="text-muted-foreground">{icon}</div>
                <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            </div>
            {children}
        </div>
    );
}

function Toggle({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                {description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                )}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none",
                    checked ? "bg-sky-500" : "bg-muted"
                )}
            >
                <span
                    className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform",
                        checked ? "translate-x-4" : "translate-x-0"
                    )}
                />
            </button>
        </div>
    );
}

export default function SettingsPage() {
    const { prefs, setPrefs, resetPrefs, loaded } = usePreferences();
    const { theme, setTheme } = useTheme();
    const [displayNameInput, setDisplayNameInput] = useState("");
    const [dirty, setDirty] = useState(false);

    // sync displayName input from loaded prefs
    useEffect(() => {
        if (loaded) {
            setDisplayNameInput(prefs.displayName);
        }
    }, [loaded, prefs.displayName]);

    function handleSaveDisplayName() {
        const trimmed = displayNameInput.trim();
        setPrefs({ displayName: trimmed });
        setDirty(false);
        toast.success("Zobrazované meno uložené");
    }

    function handleReset() {
        resetPrefs();
        setDisplayNameInput("");
        toast.success("Nastavenia boli resetované na predvolené hodnoty");
    }

    if (!loaded) {
        return (
            <div className="space-y-4">
                <div className="skeleton h-8 w-48" />
                <div className="skeleton h-64 rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Nastavenia"
                subtitle="Prispôsob si zobrazenie a správanie portálu."
                breadcrumbs={[{ label: "Nastavenia" }]}
            />

            <div className="grid gap-5 lg:grid-cols-2">
                {/* ── Identity ── */}
                <SectionCard icon={<UserIcon className="h-4 w-4" />} title="Identita">
                    <div className="space-y-5">
                        {/* Avatar preview */}
                        <div className="flex items-center gap-4">
                            <UserAvatar
                                colorId={prefs.avatarColorId}
                                displayName={displayNameInput || undefined}
                                size="lg"
                            />
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    {displayNameInput || "Prihlásený používateľ"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Náhľad avatara
                                </p>
                            </div>
                        </div>

                        {/* Display name */}
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-muted-foreground">
                                Zobrazované meno
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={displayNameInput}
                                    onChange={(e) => {
                                        setDisplayNameInput(e.target.value);
                                        setDirty(true);
                                    }}
                                    placeholder="Napr. Ján Novák"
                                    maxLength={40}
                                    className="input-dark flex-1"
                                />
                                {dirty && (
                                    <button
                                        type="button"
                                        onClick={handleSaveDisplayName}
                                        className="btn-primary shrink-0"
                                    >
                                        <SaveIcon className="h-4 w-4" />
                                        Uložiť
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Ukladá sa lokálne v prehliadači. Neovplyvňuje účet na serveri.
                            </p>
                        </div>
                    </div>
                </SectionCard>

                {/* ── Appearance ── */}
                <SectionCard
                    icon={<PaintbrushIcon className="h-4 w-4" />}
                    title="Farba avatara"
                >
                    <div className="grid grid-cols-3 gap-3">
                        {AVATAR_COLORS.map((color) => (
                            <button
                                key={color.id}
                                type="button"
                                onClick={() => setPrefs({ avatarColorId: color.id as AvatarColorId })}
                                className={cn(
                                    "flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-xs transition",
                                    prefs.avatarColorId === color.id
                                        ? "border-border bg-accent"
                                        : "border-border bg-transparent hover:bg-accent"
                                )}
                            >
                                <UserAvatar
                                    colorId={color.id as AvatarColorId}
                                    displayName={displayNameInput || undefined}
                                    size="md"
                                />
                                <span className="text-muted-foreground">{color.label}</span>
                                {prefs.avatarColorId === color.id && (
                                    <span className="pill pill-blue text-[10px]">Aktívna</span>
                                )}
                            </button>
                        ))}
                    </div>
                </SectionCard>

                {/* ── Theme ── */}
                <SectionCard
                    icon={<SunIcon className="h-4 w-4" />}
                    title="Téma"
                >
                    <div className="grid grid-cols-3 gap-2">
                        {([
                            { value: "light", label: "Svetlá", icon: <SunIcon className="h-4 w-4" /> },
                            { value: "dark",  label: "Tmavá",  icon: <MoonIcon className="h-4 w-4" /> },
                            { value: "system",label: "Systém", icon: <MonitorIcon className="h-4 w-4" /> },
                        ] as const).map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setTheme(opt.value)}
                                className={cn(
                                    "flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-xs transition",
                                    theme === opt.value
                                        ? "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                                        : "border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                )}
                            >
                                {opt.icon}
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                        Svetlá téma je vhodná na snímky obrazovky do záverečnej práce.
                    </p>
                </SectionCard>

                {/* ── Layout ── */}
                <SectionCard
                    icon={<SlidersHorizontalIcon className="h-4 w-4" />}
                    title="Rozloženie"
                >
                    <div className="space-y-4">
                        {/* View mode */}
                        <div>
                            <p className="text-sm font-medium text-foreground mb-3">
                                Predvolené zobrazenie kurzov
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {(["grid", "list"] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setPrefs({ viewMode: mode })}
                                        className={cn(
                                            "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition",
                                            prefs.viewMode === mode
                                                ? "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                                                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        {mode === "grid" ? (
                                            <LayoutGridIcon className="h-4 w-4" />
                                        ) : (
                                            <ListIcon className="h-4 w-4" />
                                        )}
                                        {mode === "grid" ? "Mriežka" : "Zoznam"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-border pt-4 space-y-1">
                            <Toggle
                                label="Kompaktné karty"
                                description="Menšie karty kurzov s menej priestoru"
                                checked={prefs.compactMode}
                                onChange={(v) => setPrefs({ compactMode: v })}
                            />
                        </div>
                    </div>
                </SectionCard>

                {/* ── Reset ── */}
                <SectionCard
                    icon={<RotateCcwIcon className="h-4 w-4" />}
                    title="Obnoviť nastavenia"
                >
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Všetky nastavenia sú uložené lokálne vo tvojom prehliadači
                            (localStorage). Neovplyvňujú tvoj serverový účet ani iných
                            používateľov. Resetom sa vymažú: zobrazované meno, farba avatara,
                            pripnuté kurzy, nedávne kurzy, zobrazenie kurzov a skryté tipy.
                        </p>

                        <div className="rounded-xl border border-amber-500/15 bg-amber-500/8 px-4 py-3 text-sm text-amber-300">
                            Toto zmaže všetky lokálne preferencie. Akciu nie je možné vrátiť.
                        </div>

                        <button
                            type="button"
                            onClick={handleReset}
                            className="btn-danger"
                        >
                            <RotateCcwIcon className="h-4 w-4" />
                            Resetovať nastavenia
                        </button>
                    </div>
                </SectionCard>
            </div>
        </div>
    );
}

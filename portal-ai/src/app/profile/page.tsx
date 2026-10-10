// src/app/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { UserAvatar } from "@/components/UserAvatar";
import { usePreferences, AVATAR_COLORS, type AvatarColorId } from "@/hooks/usePreferences";
import {
    BookOpenIcon,
    CheckIcon,
    ClipboardIcon,
    ClockIcon,
    PencilIcon,
    SaveIcon,
    SettingsIcon,
    ShieldCheckIcon,
    XIcon,
} from "lucide-react";
import toast from "react-hot-toast";

function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const c = document.cookie.split("; ").find((x) => x.startsWith(name + "="));
    return c ? decodeURIComponent(c.split("=")[1] || "") : null;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error("Nepodarilo sa skopírovať");
        }
    }

    return (
        <button
            type="button"
            onClick={handleCopy}
            title="Kopírovať"
            className="ml-2 rounded-lg p-1 text-neutral-500 hover:bg-white/8 hover:text-neutral-300 transition"
        >
            {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> : <ClipboardIcon className="h-3.5 w-3.5" />}
        </button>
    );
}

export default function ProfilePage() {
    const router = useRouter();
    const { prefs, setPrefs, loaded } = usePreferences();
    const [role, setRole] = useState<"student" | "teacher" | null>(null);
    const [userId, setUserId] = useState<string | null>(null);

    // Display name editing
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState("");

    useEffect(() => {
        const r = getCookie("user_role");
        setRole(r === "student" || r === "teacher" ? r : null);
        setUserId(getCookie("user_id"));
    }, []);

    useEffect(() => {
        if (loaded) setNameInput(prefs.displayName);
    }, [loaded, prefs.displayName]);

    // Redirect if not logged in
    useEffect(() => {
        const token = getCookie("access_token");
        const userRole = getCookie("user_role");
        if (!token && !userRole) {
            router.push("/auth/login");
        }
    }, [router]);

    function saveName() {
        setPrefs({ displayName: nameInput.trim() });
        setEditingName(false);
        toast.success("Meno uložené");
    }

    function cancelEdit() {
        setNameInput(prefs.displayName);
        setEditingName(false);
    }

    const roleName = role === "teacher" ? "Učiteľ" : "Študent";
    const dashboardHref = role === "teacher" ? "/teacher/courses" : "/student";
    const displayName = loaded ? (prefs.displayName || roleName) : roleName;

    if (!loaded) {
        return (
            <div className="space-y-6">
                <div className="skeleton h-8 w-36" />
                <div className="skeleton h-28 rounded-2xl" />
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="skeleton h-56 rounded-2xl" />
                    <div className="skeleton h-56 rounded-2xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Môj profil"
                subtitle="Informácie o tvojom účte a lokálne nastavenia."
                breadcrumbs={[{ label: "Profil" }]}
                action={
                    <Link href="/settings" className="btn-ghost text-xs px-3 py-1.5">
                        <SettingsIcon className="h-3.5 w-3.5" />
                        Nastavenia
                    </Link>
                }
            />

            {/* ── Avatar banner ── */}
            <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/5 p-6 sm:flex-row sm:items-center">
                {/* Avatar with colour ring */}
                <div className="flex items-center gap-4">
                    <UserAvatar
                        role={role}
                        colorId={prefs.avatarColorId}
                        displayName={prefs.displayName || undefined}
                        size="lg"
                    />
                    <div>
                        {/* Editable display name */}
                        {editingName ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={nameInput}
                                    onChange={(e) => setNameInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") saveName();
                                        if (e.key === "Escape") cancelEdit();
                                    }}
                                    maxLength={40}
                                    autoFocus
                                    className="input-dark w-40 py-1.5 text-sm"
                                />
                                <button type="button" onClick={saveName} className="btn-primary py-1.5 px-3">
                                    <SaveIcon className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={cancelEdit} className="btn-ghost py-1.5 px-3">
                                    <XIcon className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <p className="text-lg font-bold text-white">{displayName}</p>
                                <button
                                    type="button"
                                    onClick={() => setEditingName(true)}
                                    title="Upraviť meno"
                                    className="rounded-lg p-1 text-neutral-500 hover:bg-white/8 hover:text-neutral-300 transition"
                                >
                                    <PencilIcon className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                            <span className={`pill ${role === "teacher" ? "pill-violet" : "pill-blue"}`}>
                                {roleName}
                            </span>
                            <span className="pill pill-green">Prihlásený</span>
                        </div>
                    </div>
                </div>

                {/* Quick colour switcher */}
                <div className="sm:ml-auto">
                    <p className="mb-2 text-xs text-neutral-500">Farba avatara</p>
                    <div className="flex items-center gap-1.5">
                        {AVATAR_COLORS.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => setPrefs({ avatarColorId: c.id as AvatarColorId })}
                                title={c.label}
                                className={`h-5 w-5 rounded-full ring-offset-1 ring-offset-[#0f1117] transition ${
                                    prefs.avatarColorId === c.id ? "ring-2 ring-white/60 scale-110" : "opacity-60 hover:opacity-100"
                                }`}
                                style={{ backgroundColor: colorHex(c.id) }}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
                {/* ── Account details ── */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldCheckIcon className="h-4 w-4 text-neutral-400" />
                        <h2 className="text-sm font-semibold text-white">Detaily účtu</h2>
                    </div>

                    <dl className="space-y-3">
                        <div>
                            <dt className="text-xs text-neutral-500">ID používateľa</dt>
                            <dd className="mt-0.5 flex items-center">
                                <span className="font-mono text-sm text-white break-all">
                                    {userId ?? "—"}
                                </span>
                                {userId && <CopyButton text={userId} />}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-neutral-500">Rola</dt>
                            <dd className="mt-0.5 text-sm text-white">{roleName}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-neutral-500">Zobrazované meno</dt>
                            <dd className="mt-0.5 flex items-center gap-2">
                                <span className="text-sm text-white">
                                    {prefs.displayName || <span className="text-neutral-500 italic">Nenastavené</span>}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setEditingName(true)}
                                    className="text-xs text-sky-400 hover:text-sky-300 transition"
                                >
                                    Zmeniť
                                </button>
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-neutral-500">Session</dt>
                            <dd className="mt-0.5">
                                <span className="pill pill-green">Aktívna</span>
                            </dd>
                        </div>
                    </dl>
                </div>

                {/* ── Access capabilities ── */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <BookOpenIcon className="h-4 w-4 text-neutral-400" />
                        <h2 className="text-sm font-semibold text-white">Prístupové práva</h2>
                    </div>

                    <ul className="space-y-2.5">
                        {(role === "student"
                            ? [
                                "Prístup k priradeným kurzom",
                                "AI chat pre jednotlivé kurzy",
                                "Zobrazenie materiálov kurzu",
                                "AIS synchronizácia predmetov",
                              ]
                            : [
                                "Vytváranie a správa kurzov",
                                "Nahrávanie PDF materiálov",
                                "Správa zoznamu študentov",
                                "AI chat pre vlastné kurzy",
                              ]
                        ).map((item) => (
                            <li key={item} className="flex items-center gap-2.5 text-sm text-neutral-300">
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                        role === "teacher" ? "bg-violet-400" : "bg-emerald-400"
                                    }`}
                                />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* ── Recent courses ── */}
            {prefs.recentCourses.length > 0 && (
                <div>
                    <div className="mb-3 flex items-center gap-2">
                        <ClockIcon className="h-4 w-4 text-neutral-400" />
                        <h2 className="text-sm font-semibold text-white">Nedávno navštívené kurzy</h2>
                    </div>
                    <div className="space-y-2">
                        {prefs.recentCourses.slice(0, 5).map((c) => (
                            <Link
                                key={c.id}
                                href={`/${c.role}/courses/${c.id}`}
                                className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-sm transition hover:bg-white/6 hover:border-white/12"
                            >
                                <BookOpenIcon className="h-4 w-4 shrink-0 text-neutral-500" />
                                <span className="flex-1 truncate text-white">{c.name}</span>
                                {c.code && (
                                    <span className="pill pill-neutral">{c.code}</span>
                                )}
                                <span className="text-xs text-neutral-600 shrink-0">
                                    {formatRelativeTime(c.visitedAt)}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Quick links ── */}
            <div className="flex flex-wrap gap-3 pt-2">
                <Link href={dashboardHref} className="btn-primary">
                    <BookOpenIcon className="h-4 w-4" />
                    {role === "teacher" ? "Moje kurzy" : "Dashboard"}
                </Link>
                <Link href="/settings" className="btn-ghost">
                    <SettingsIcon className="h-4 w-4" />
                    Nastavenia
                </Link>
                <Link href="/help" className="btn-ghost">
                    Pomoc
                </Link>
            </div>
        </div>
    );
}

function colorHex(id: string): string {
    const map: Record<string, string> = {
        sky: "#0ea5e9", violet: "#8b5cf6", emerald: "#10b981",
        amber: "#f59e0b", rose: "#f43f5e", indigo: "#6366f1",
    };
    return map[id] ?? "#0ea5e9";
}

function formatRelativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "práve teraz";
    if (m < 60) return `pred ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `pred ${h} h`;
    const d = Math.floor(h / 24);
    return `pred ${d} d`;
}

// src/app/student/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpenIcon, BotIcon, ClockIcon, DatabaseIcon, PinIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { DismissibleTip } from "@/components/DismissibleTip";
import { usePreferences } from "@/hooks/usePreferences";

type TeacherInfo = {
    id: string;
    email: string;
    name?: string | null;
} | null;

type StudentCourse = {
    id: string;
    name: string;
    code?: string | null;
    description?: string | null;
    createdAt?: string;
    teacher?: TeacherInfo;
};

function readRoleFromCookie(): "student" | "teacher" | null {
    if (typeof document === "undefined") return null;
    const cookies = document.cookie || "";
    const roleCookie = cookies.split("; ").find((c) => c.startsWith("user_role="));
    if (!roleCookie) return null;
    const value = decodeURIComponent(roleCookie.split("=")[1] || "");
    return value === "student" || value === "teacher" ? value : null;
}

function readUserIdFromCookie(): string | null {
    if (typeof document === "undefined") return null;
    const c = document.cookie.split("; ").find((x) => x.startsWith("user_id="));
    return c ? decodeURIComponent(c.split("=")[1] || "") : null;
}

function StatCardSkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-muted/30 p-5">
            <div className="skeleton h-3 w-20 mb-3" />
            <div className="skeleton h-7 w-12 mb-2" />
            <div className="skeleton h-3 w-36" />
        </div>
    );
}

function CourseCardSkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-muted/30 p-5">
            <div className="skeleton h-9 w-9 rounded-xl mb-3" />
            <div className="skeleton h-4 w-32 mb-2" />
            <div className="skeleton h-3 w-full mb-1.5" />
            <div className="skeleton h-3 w-3/4 mb-4" />
            <div className="skeleton h-8 w-24 rounded-xl" />
        </div>
    );
}

function StatCard({ title, value, hint, accent }: { title: string; value: string; hint: string; accent?: string }) {
    return (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className={`mt-2 text-2xl font-bold ${accent ?? "text-foreground"}`}>{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
    );
}

function QuickAction({ title, desc, href, icon }: { title: string; desc: string; href: string; icon: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none transition hover:bg-muted hover:border-border hover:shadow-none"
        >
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition group-hover:bg-accent">
                {icon}
            </div>
            <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
        </Link>
    );
}

function formatRelativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "práve teraz";
    if (m < 60) return `pred ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `pred ${h} h`;
    return `pred ${Math.floor(h / 24)} d`;
}

export default function StudentDashboardPage() {
    const [role, setRole] = useState<"student" | "teacher" | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [courses, setCourses] = useState<StudentCourse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { prefs, loaded } = usePreferences();

    useEffect(() => {
        const currentRole = readRoleFromCookie();
        setRole(currentRole);
        setUserId(readUserIdFromCookie());

        if (currentRole !== "student") {
            setLoading(false);
            return;
        }

        const load = async () => {
            try {
                setLoading(true);
                const res = await fetch("/api/student/courses");
                const data = await res.json().catch(() => null);
                if (!res.ok) { setError("Nepodarilo sa načítať kurzy."); return; }
                setCourses(data?.courses ?? []);
            } catch {
                setError("Nepodarilo sa načítať dashboard.");
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, []);

    if (loading) {
        return (
            <div className="space-y-8">
                <div>
                    <div className="skeleton h-7 w-40 mb-2" />
                    <div className="skeleton h-4 w-64" />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <CourseCardSkeleton /><CourseCardSkeleton /><CourseCardSkeleton />
                </div>
            </div>
        );
    }

    if (role !== "student") {
        return (
            <div className="space-y-4">
                <PageHeader title="Študentský dashboard" />
                <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                    Táto sekcia je dostupná iba pre prihláseného študenta.
                </div>
            </div>
        );
    }

    const pinnedCourses = loaded
        ? courses.filter((c) => prefs.pinnedCourses.includes(c.id))
        : [];
    const recentCourses = loaded
        ? prefs.recentCourses.filter((r) => r.role === "student").slice(0, 4)
        : [];
    const latestCourses = courses.slice(0, 3);

    const displayName = loaded && prefs.displayName ? prefs.displayName : "Späť";

    return (
        <div className="space-y-8">
            <PageHeader
                title={`Vitaj ${displayName}.`}
                subtitle="Tu máš prehľad kurzov a prístup k AI pomocníkovi."
                badge={<span className="pill pill-green">Prihlásený</span>}
                action={
                    <Link href="/student/courses" className="btn-ghost text-xs px-3 py-1.5">
                        Všetky kurzy →
                    </Link>
                }
            />

            {/* Welcome tip */}
            <DismissibleTip tipId="student-dashboard-welcome" icon={<BotIcon className="h-4 w-4" />}>
                <span className="font-medium">Tip:</span> V každom kurze máš k dispozícii AI asistenta natrénovaného na materiáloch daného predmetu.
                Skús tiež funkciu <span className="font-medium">pripnutia kurzu</span> — kolík ikona na karte kurzu.
            </DismissibleTip>

            {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
            )}

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <StatCard title="Moje kurzy" value={String(courses.length)} hint="Kurzy, do ktorých si priradený" />
                <StatCard
                    title="Pripnuté"
                    value={String(loaded ? prefs.pinnedCourses.length : 0)}
                    hint="Kurzy, ktoré si si pripol pre rýchly prístup"
                    accent={prefs.pinnedCourses.length > 0 ? "text-sky-600 dark:text-sky-300" : "text-foreground"}
                />
                <StatCard
                    title="Stav"
                    value={error ? "Chyba" : "OK"}
                    hint={error ?? "Dashboard napojený na core-api"}
                    accent={error ? "text-red-400" : "text-emerald-400"}
                />
            </div>

            {/* Quick actions */}
            <div>
                <h2 className="mb-4 text-base font-semibold text-foreground">Rýchle akcie</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <QuickAction href="/student/courses" icon={<BookOpenIcon className="h-4 w-4" />} title="Moje kurzy" desc="Všetky predmety, do ktorých si zapísaný" />
                    <QuickAction href="/student/courses" icon={<BotIcon className="h-4 w-4" />} title="AI chat" desc="Pýtaj sa otázky k materiálom kurzu" />
                    <QuickAction href="/ui/completion" icon={<BotIcon className="h-4 w-4" />} title="Všeobecný chat" desc="Chat mimo konkrétneho predmetu" />
                    <QuickAction href="/student/ais" icon={<DatabaseIcon className="h-4 w-4" />} title="AIS sync" desc="Pripoj AIS a stiahni materiály predmetov" />
                </div>
            </div>

            {/* Pinned courses */}
            {pinnedCourses.length > 0 && (
                <div>
                    <div className="mb-4 flex items-center gap-2">
                        <PinIcon className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-base font-semibold text-foreground">Pripnuté kurzy</h2>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {pinnedCourses.map((course) => (
                            <div key={course.id} className="group flex flex-col rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5 shadow-sm dark:shadow-none transition hover:bg-sky-500/8">
                                <div className="mb-3 flex items-start justify-between gap-2">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
                                        <BookOpenIcon className="h-4 w-4" />
                                    </div>
                                    {course.code && <span className="pill pill-neutral">{course.code}</span>}
                                </div>
                                <h3 className="text-sm font-semibold text-foreground">{course.name}</h3>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Učiteľ: {course.teacher?.name || course.teacher?.email || "—"}
                                </p>
                                <Link href={`/student/courses/${course.id}`} className="mt-4 btn-ghost text-xs px-3 py-1.5">
                                    Otvoriť kurz
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recently opened */}
            {recentCourses.length > 0 && (
                <div>
                    <div className="mb-4 flex items-center gap-2">
                        <ClockIcon className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-base font-semibold text-foreground">Nedávno navštívené</h2>
                    </div>
                    <div className="space-y-2">
                        {recentCourses.map((r) => (
                            <Link
                                key={r.id}
                                href={`/student/courses/${r.id}`}
                                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm transition hover:bg-muted"
                            >
                                <BookOpenIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="flex-1 truncate text-foreground">{r.name}</span>
                                {r.code && <span className="pill pill-neutral">{r.code}</span>}
                                <span className="text-xs text-muted-foreground shrink-0">{formatRelativeTime(r.visitedAt)}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Latest courses preview */}
            <div>
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground">Najnovšie kurzy</h2>
                    <Link href="/student/courses" className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition">
                        Zobraziť všetky →
                    </Link>
                </div>

                {latestCourses.length === 0 ? (
                    <EmptyState
                        icon={<BookOpenIcon className="h-7 w-7" />}
                        title="Zatiaľ žiadne kurzy"
                        description="Požiadaj učiteľa o pridanie do kurzu."
                    />
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {latestCourses.map((course) => (
                            <div key={course.id} className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none transition hover:border-border hover:bg-muted/50 hover:shadow-none">
                                <div className="mb-3 flex items-start justify-between gap-2">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-300">
                                        <BookOpenIcon className="h-4 w-4" />
                                    </div>
                                    {course.code && <span className="pill pill-neutral">{course.code}</span>}
                                </div>
                                <h3 className="text-sm font-semibold text-foreground">{course.name}</h3>
                                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                                    {course.description || "Kurz zatiaľ nemá doplnený popis."}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Učiteľ: {course.teacher?.name || course.teacher?.email || "—"}
                                </p>
                                <Link href={`/student/courses/${course.id}`} className="mt-4 btn-ghost text-xs px-3 py-1.5">
                                    Otvoriť kurz
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

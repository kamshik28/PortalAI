// src/app/student/courses/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpenIcon, PinIcon, PinOffIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { SearchInput } from "@/components/SearchInput";
import { ViewToggle } from "@/components/ViewToggle";
import { usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

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

function CourseCardSkeleton({ compact }: { compact?: boolean }) {
    return (
        <div className={cn("rounded-2xl border border-border bg-muted/30", compact ? "p-3" : "p-5")}>
            <div className="flex items-start justify-between mb-3">
                <div className="skeleton h-9 w-9 rounded-xl" />
                <div className="skeleton h-5 w-14 rounded-full" />
            </div>
            <div className="skeleton h-4 w-36 mb-2" />
            <div className="skeleton h-3 w-full mb-1.5" />
            <div className="skeleton h-3 w-2/3 mb-4" />
            <div className="skeleton h-8 w-24 rounded-xl" />
        </div>
    );
}

function CourseGridCard({
    course,
    pinned,
    compact,
    onTogglePin,
}: {
    course: StudentCourse;
    pinned: boolean;
    compact: boolean;
    onTogglePin: (id: string) => void;
}) {
    return (
        <div
            className={cn(
                "group flex flex-col rounded-2xl border bg-card shadow-sm dark:shadow-none transition hover:bg-muted/50 hover:shadow-none",
                pinned ? "border-sky-500/25 bg-sky-500/5" : "border-border hover:border-border",
                compact ? "p-3" : "p-5"
            )}
        >
            <div className={cn("flex items-start justify-between gap-2", compact ? "mb-2" : "mb-3")}>
                <div className={cn("flex shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-300", compact ? "h-7 w-7" : "h-9 w-9")}>
                    <BookOpenIcon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                </div>
                <div className="flex items-center gap-1.5">
                    {course.code && (
                        <span className="pill pill-neutral">{course.code}</span>
                    )}
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); onTogglePin(course.id); }}
                        title={pinned ? "Odopnúť" : "Pripnúť"}
                        className={cn(
                            "rounded-lg p-1 transition",
                            pinned
                                ? "text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300"
                                : "text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                        )}
                    >
                        {pinned ? <PinOffIcon className="h-3.5 w-3.5" /> : <PinIcon className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>

            <h2 className={cn("font-semibold text-foreground leading-snug", compact ? "text-xs" : "text-sm")}>
                {course.name}
            </h2>

            {!compact && course.description && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {course.description}
                </p>
            )}

            <p className={cn("text-muted-foreground", compact ? "mt-1 text-[10px]" : "mt-2 text-xs")}>
                Učiteľ: {course.teacher?.name || course.teacher?.email || "—"}
            </p>

            <div className={cn("mt-auto", compact ? "pt-2" : "pt-4")}>
                <Link
                    href={`/student/courses/${course.id}`}
                    className={cn("btn-ghost", compact ? "text-[11px] px-2.5 py-1" : "text-xs px-3 py-1.5")}
                >
                    Otvoriť kurz
                </Link>
            </div>
        </div>
    );
}

function CourseListRow({
    course,
    pinned,
    onTogglePin,
}: {
    course: StudentCourse;
    pinned: boolean;
    onTogglePin: (id: string) => void;
}) {
    return (
        <div
            className={cn(
                "group flex items-center gap-4 rounded-xl border px-4 py-3 shadow-sm dark:shadow-none transition hover:bg-muted hover:shadow-none",
                pinned ? "border-sky-500/20 bg-sky-500/5" : "border-border bg-card"
            )}
        >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-300">
                <BookOpenIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{course.name}</p>
                <p className="text-xs text-muted-foreground">
                    {course.code ? `${course.code} · ` : ""}
                    Učiteľ: {course.teacher?.name || course.teacher?.email || "—"}
                </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    onClick={() => onTogglePin(course.id)}
                    className={cn(
                        "rounded-lg p-1 transition",
                        pinned
                            ? "text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300"
                            : "text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                    )}
                >
                    {pinned ? <PinOffIcon className="h-3.5 w-3.5" /> : <PinIcon className="h-3.5 w-3.5" />}
                </button>
                <Link href={`/student/courses/${course.id}`} className="btn-ghost text-xs px-3 py-1.5">
                    Otvoriť
                </Link>
            </div>
        </div>
    );
}

export default function StudentCoursesPage() {
    const [role, setRole] = useState<"student" | "teacher" | null>(null);
    const [courses, setCourses] = useState<StudentCourse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const { prefs, setPrefs, togglePin, loaded } = usePreferences();

    const viewMode = loaded ? prefs.viewMode : "grid";
    const compact = loaded ? prefs.compactMode : false;

    useEffect(() => {
        const currentRole = readRoleFromCookie();
        setRole(currentRole);
        if (currentRole !== "student") { setLoading(false); return; }

        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch("/api/student/courses");
                const data = await res.json().catch(() => null);
                if (!res.ok) { setError("Nepodarilo sa načítať kurzy."); return; }
                setCourses(data?.courses ?? []);
            } catch {
                setError("Nepodarilo sa načítať kurzy.");
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return courses;
        const q = search.toLowerCase();
        return courses.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.code?.toLowerCase().includes(q) ||
                c.description?.toLowerCase().includes(q) ||
                c.teacher?.name?.toLowerCase().includes(q) ||
                c.teacher?.email?.toLowerCase().includes(q)
        );
    }, [courses, search]);

    const pinned = useMemo(
        () => filtered.filter((c) => loaded && prefs.pinnedCourses.includes(c.id)),
        [filtered, loaded, prefs.pinnedCourses]
    );
    const unpinned = useMemo(
        () => filtered.filter((c) => !loaded || !prefs.pinnedCourses.includes(c.id)),
        [filtered, loaded, prefs.pinnedCourses]
    );

    const gridClass = compact
        ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        : "grid gap-4 md:grid-cols-2 lg:grid-cols-3";

    if (loading) {
        return (
            <div className="space-y-6">
                <div>
                    <div className="skeleton h-7 w-32 mb-2" />
                    <div className="skeleton h-4 w-64" />
                </div>
                <div className="skeleton h-10 rounded-xl" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => <CourseCardSkeleton key={i} />)}
                </div>
            </div>
        );
    }

    if (role !== "student") {
        return (
            <div className="space-y-4">
                <PageHeader title="Moje kurzy" breadcrumbs={[{ label: "Dashboard", href: "/student" }, { label: "Kurzy" }]} />
                <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                    Táto sekcia je dostupná iba pre prihláseného študenta.
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Moje kurzy"
                subtitle={`${courses.length} ${courses.length === 1 ? "kurz" : courses.length < 5 ? "kurzy" : "kurzov"} k dispozícii`}
                breadcrumbs={[{ label: "Dashboard", href: "/student" }, { label: "Kurzy" }]}
            />

            {/* Controls */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Hľadať kurz..."
                    className="flex-1"
                    globalShortcut
                />
                <ViewToggle
                    value={viewMode}
                    onChange={(v) => setPrefs({ viewMode: v })}
                />
            </div>

            {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</div>
            )}

            {/* No results */}
            {filtered.length === 0 && courses.length > 0 && (
                <EmptyState
                    icon={<BookOpenIcon className="h-7 w-7" />}
                    title="Žiadne výsledky"
                    description={`Pre vyhľadávanie „${search}" nebol nájdený žiadny kurz.`}
                    action={<button type="button" onClick={() => setSearch("")} className="btn-ghost text-xs">Vymazať hľadanie</button>}
                />
            )}

            {filtered.length === 0 && courses.length === 0 && (
                <EmptyState
                    icon={<BookOpenIcon className="h-7 w-7" />}
                    title="Zatiaľ žiadne kurzy"
                    description="Požiadaj učiteľa o pridanie do niektorého kurzu."
                />
            )}

            {/* Pinned section */}
            {pinned.length > 0 && (
                <div>
                    <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <PinIcon className="h-3 w-3" /> Pripnuté
                    </p>
                    {viewMode === "grid" ? (
                        <div className={gridClass}>
                            {pinned.map((c) => (
                                <CourseGridCard
                                    key={c.id}
                                    course={c}
                                    pinned
                                    compact={compact}
                                    onTogglePin={togglePin}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {pinned.map((c) => (
                                <CourseListRow key={c.id} course={c} pinned onTogglePin={togglePin} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* All / remaining courses */}
            {unpinned.length > 0 && (
                <div>
                    {pinned.length > 0 && (
                        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Všetky kurzy
                        </p>
                    )}
                    {viewMode === "grid" ? (
                        <div className={gridClass}>
                            {unpinned.map((c) => (
                                <CourseGridCard
                                    key={c.id}
                                    course={c}
                                    pinned={false}
                                    compact={compact}
                                    onTogglePin={togglePin}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {unpinned.map((c) => (
                                <CourseListRow key={c.id} course={c} pinned={false} onTogglePin={togglePin} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

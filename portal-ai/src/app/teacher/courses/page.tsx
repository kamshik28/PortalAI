// src/app/teacher/courses/page.tsx
"use client";

import React, { useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";
import { BookOpenIcon, PinIcon, PinOffIcon, PlusIcon, XIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { SearchInput } from "@/components/SearchInput";
import { ViewToggle } from "@/components/ViewToggle";
import { usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type Course = {
    id: string;
    name: string;
    code?: string | null;
    description?: string | null;
};

type CoursesResponse = { courses?: Course[] } | Course[];

function CourseCardSkeleton() {
    return (
        <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
            <div className="flex items-start justify-between mb-3">
                <div className="skeleton h-9 w-9 rounded-xl" />
                <div className="skeleton h-5 w-14 rounded-full" />
            </div>
            <div className="skeleton h-4 w-36 mb-2" />
            <div className="skeleton h-3 w-full mb-1.5" />
            <div className="skeleton h-8 w-24 rounded-xl mt-4" />
        </div>
    );
}

function CourseGridCard({
    course,
    pinned,
    compact,
    onTogglePin,
}: {
    course: Course;
    pinned: boolean;
    compact: boolean;
    onTogglePin: (id: string) => void;
}) {
    return (
        <div
            className={cn(
                "group flex flex-col rounded-2xl border bg-white/5 transition hover:bg-white/8",
                pinned ? "border-violet-500/25 bg-violet-500/5" : "border-white/10 hover:border-white/15",
                compact ? "p-3" : "p-5"
            )}
        >
            <div className={cn("flex items-start justify-between gap-2", compact ? "mb-2" : "mb-3")}>
                <div className={cn("flex shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300", compact ? "h-7 w-7" : "h-9 w-9")}>
                    <BookOpenIcon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                </div>
                <div className="flex items-center gap-1.5">
                    {course.code && <span className="pill pill-neutral">{course.code}</span>}
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); onTogglePin(course.id); }}
                        title={pinned ? "Odopnúť" : "Pripnúť"}
                        className={cn(
                            "rounded-lg p-1 transition",
                            pinned
                                ? "text-violet-400 hover:text-violet-300"
                                : "text-neutral-600 hover:text-neutral-400 opacity-0 group-hover:opacity-100"
                        )}
                    >
                        {pinned ? <PinOffIcon className="h-3.5 w-3.5" /> : <PinIcon className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>
            <h2 className={cn("font-semibold text-white leading-snug", compact ? "text-xs" : "text-sm")}>{course.name}</h2>
            {!compact && course.description && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-400">{course.description}</p>
            )}
            <div className={cn("mt-auto", compact ? "pt-2" : "pt-4")}>
                <Link href={`/teacher/courses/${course.id}`} className={cn("btn-ghost", compact ? "text-[11px] px-2.5 py-1" : "text-xs px-3 py-1.5")}>
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
    course: Course;
    pinned: boolean;
    onTogglePin: (id: string) => void;
}) {
    return (
        <div className={cn(
            "group flex items-center gap-4 rounded-xl border px-4 py-3 transition hover:bg-white/5",
            pinned ? "border-violet-500/20 bg-violet-500/5" : "border-white/8 bg-white/3"
        )}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                <BookOpenIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{course.name}</p>
                {course.code && <p className="text-xs text-neutral-500">{course.code}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    onClick={() => onTogglePin(course.id)}
                    className={cn(
                        "rounded-lg p-1 transition",
                        pinned ? "text-violet-400 hover:text-violet-300" : "text-neutral-600 hover:text-neutral-400 opacity-0 group-hover:opacity-100"
                    )}
                >
                    {pinned ? <PinOffIcon className="h-3.5 w-3.5" /> : <PinIcon className="h-3.5 w-3.5" />}
                </button>
                <Link href={`/teacher/courses/${course.id}`} className="btn-ghost text-xs px-3 py-1.5">Otvoriť</Link>
            </div>
        </div>
    );
}

export default function TeacherCoursesPage() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [description, setDescription] = useState("");
    const [creating, setCreating] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [search, setSearch] = useState("");
    const { prefs, setPrefs, togglePin, loaded } = usePreferences();

    const viewMode = loaded ? prefs.viewMode : "grid";
    const compact = loaded ? prefs.compactMode : false;

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const res = await fetch("/api/teacher/courses");
                if (!res.ok) { setError("Nepodarilo sa načítať kurzy."); return; }
                const data = (await res.json()) as CoursesResponse;
                setCourses(Array.isArray(data) ? data : data.courses ?? []);
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
        return courses.filter((c) => c.name.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q));
    }, [courses, search]);

    const pinned = useMemo(() => filtered.filter((c) => loaded && prefs.pinnedCourses.includes(c.id)), [filtered, loaded, prefs.pinnedCourses]);
    const unpinned = useMemo(() => filtered.filter((c) => !loaded || !prefs.pinnedCourses.includes(c.id)), [filtered, loaded, prefs.pinnedCourses]);

    const handleCreateCourse = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!name.trim()) return;
        try {
            setCreating(true);
            const res = await fetch("/api/teacher/courses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), code: code.trim() || null, description: description.trim() || null }),
            });
            if (!res.ok) { setError("Nepodarilo sa vytvoriť kurz."); return; }
            const raw = (await res.json()) as { course?: Course } | Course;
            const course: Course = typeof raw === "object" && raw !== null && "course" in raw && raw.course ? raw.course : (raw as Course);
            setCourses((prev) => [course, ...prev.filter((c) => c.id !== course.id)]);
            setName(""); setCode(""); setDescription("");
            setShowCreate(false);
            toast.success("Kurz bol vytvorený");
        } catch {
            setError("Nepodarilo sa vytvoriť kurz.");
        } finally {
            setCreating(false);
        }
    };

    const gridClass = compact
        ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        : "grid gap-4 md:grid-cols-2 lg:grid-cols-3";

    return (
        <div className="space-y-6">
            <PageHeader
                title="Moje kurzy"
                subtitle="Vytváraj a spravuj kurzy, pridávaj materiály a študentov."
                action={
                    <button
                        type="button"
                        onClick={() => setShowCreate((v) => !v)}
                        className={showCreate ? "btn-ghost" : "btn-primary"}
                    >
                        {showCreate ? (<><XIcon className="h-4 w-4" />Zrušiť</>) : (<><PlusIcon className="h-4 w-4" />Nový kurz</>)}
                    </button>
                }
            />

            {/* Create form */}
            {showCreate && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-white">Vytvoriť nový kurz</h2>
                    <form onSubmit={handleCreateCourse} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="md:col-span-2 space-y-1.5">
                                <label className="block text-sm font-medium text-neutral-300">Názov <span className="text-red-400">*</span></label>
                                <input className="input-dark" value={name} onChange={(e) => setName(e.target.value)} placeholder="Napr. Inteligentné komunikačné technológie" required />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-neutral-300">Kód</label>
                                <input className="input-dark" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Napr. IKT1" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-neutral-300">Popis (voliteľné)</label>
                            <textarea className="input-dark resize-none" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Čo je cieľom kurzu..." />
                        </div>
                        <div className="flex items-center gap-3">
                            <button type="submit" disabled={creating} className="btn-primary">{creating ? "Vytváram..." : "Vytvoriť kurz"}</button>
                            <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost">Zrušiť</button>
                        </div>
                    </form>
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
            )}

            {/* Controls */}
            {!loading && courses.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <SearchInput value={search} onChange={setSearch} placeholder="Hľadať kurz..." className="flex-1" globalShortcut />
                    <ViewToggle value={viewMode} onChange={(v) => setPrefs({ viewMode: v })} />
                </div>
            )}

            {loading ? (
                <div className={gridClass}>{Array.from({ length: 3 }).map((_, i) => <CourseCardSkeleton key={i} />)}</div>
            ) : courses.length === 0 ? (
                <EmptyState
                    icon={<BookOpenIcon className="h-7 w-7" />}
                    title="Zatiaľ žiadne kurzy"
                    description="Vytvor prvý kurz kliknutím na Nový kurz."
                    action={<button type="button" onClick={() => setShowCreate(true)} className="btn-primary"><PlusIcon className="h-4 w-4" />Nový kurz</button>}
                />
            ) : (
                <>
                    {filtered.length === 0 && search && (
                        <EmptyState
                            icon={<BookOpenIcon className="h-7 w-7" />}
                            title="Žiadne výsledky"
                            description={`Pre „${search}" nebol nájdený žiadny kurz.`}
                            action={<button type="button" onClick={() => setSearch("")} className="btn-ghost text-xs">Vymazať hľadanie</button>}
                        />
                    )}

                    {pinned.length > 0 && (
                        <div>
                            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500">
                                <PinIcon className="h-3 w-3" /> Pripnuté
                            </p>
                            {viewMode === "grid" ? (
                                <div className={gridClass}>{pinned.map((c) => <CourseGridCard key={c.id} course={c} pinned compact={compact} onTogglePin={togglePin} />)}</div>
                            ) : (
                                <div className="space-y-2">{pinned.map((c) => <CourseListRow key={c.id} course={c} pinned onTogglePin={togglePin} />)}</div>
                            )}
                        </div>
                    )}

                    {unpinned.length > 0 && (
                        <div>
                            {pinned.length > 0 && (
                                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">Všetky kurzy</p>
                            )}
                            {viewMode === "grid" ? (
                                <div className={gridClass}>{unpinned.map((c) => <CourseGridCard key={c.id} course={c} pinned={false} compact={compact} onTogglePin={togglePin} />)}</div>
                            ) : (
                                <div className="space-y-2">{unpinned.map((c) => <CourseListRow key={c.id} course={c} pinned={false} onTogglePin={togglePin} />)}</div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// src/app/student/courses/[courseId]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CourseChat from "@/components/CourseChat";
import CourseQuizPanel from "@/components/CourseQuizPanel";
import CourseProgressPanel from "@/components/CourseProgressPanel";
import { PageHeader } from "@/components/PageHeader";
import { usePreferences } from "@/hooks/usePreferences";
import { BookOpenIcon, CalendarIcon, HashIcon, UserIcon } from "lucide-react";

type TeacherInfo = {
    id: string;
    email: string;
    name?: string | null;
} | null;

type StudentCourseDetail = {
    id: string;
    name: string;
    code?: string | null;
    description?: string | null;
    teacher?: TeacherInfo;
};

type CourseDetailResponse = {
    course?: StudentCourseDetail | null;
};

type TabId = "chat" | "quiz" | "progress";

function readRoleFromCookie(): "student" | "teacher" | null {
    if (typeof document === "undefined") return null;
    const cookies = document.cookie || "";
    const roleCookie = cookies.split("; ").find((c) => c.startsWith("user_role="));
    if (!roleCookie) return null;
    const value = decodeURIComponent(roleCookie.split("=")[1] || "");
    return value === "student" || value === "teacher" ? value : null;
}

function PageSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div>
                <div className="skeleton h-3 w-48 mb-3" />
                <div className="skeleton h-7 w-64 mb-2" />
                <div className="skeleton h-4 w-32" />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2 skeleton h-80 rounded-2xl" />
                <div className="skeleton h-64 rounded-2xl" />
            </div>
        </div>
    );
}

const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: "chat",     label: "Chat",   icon: "💬" },
    { id: "quiz",     label: "Kvíz",   icon: "🧠" },
    { id: "progress", label: "Pokrok", icon: "📊" },
];

export default function StudentCourseDetailPage() {
    const params = useParams();
    const raw = (params as Record<string, string | string[] | undefined>)?.courseId;
    const courseId =
        typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;

    const [role, setRole] = useState<"student" | "teacher" | null>(null);
    const [course, setCourse] = useState<StudentCourseDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>("chat");
    const { trackRecentCourse } = usePreferences();

    useEffect(() => {
        const currentRole = readRoleFromCookie();
        setRole(currentRole);

        if (currentRole !== "student" || !courseId) {
            setLoading(false);
            return;
        }

        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(`/api/student/courses/${courseId}`);
                const data = (await res.json().catch(() => null)) as CourseDetailResponse | null;
                if (!res.ok) { setError("Nepodarilo sa načítať detail kurzu."); return; }
                const loaded = data?.course ?? null;
                setCourse(loaded);

                if (loaded && currentRole === "student") {
                    trackRecentCourse({
                        id: loaded.id,
                        name: loaded.name,
                        code: loaded.code,
                        role: "student",
                    });
                }
            } catch {
                setError("Nepodarilo sa načítať detail kurzu.");
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, [courseId, trackRecentCourse]);

    if (loading) return <PageSkeleton />;

    if (role !== "student") {
        return (
            <div className="space-y-4">
                <PageHeader
                    title="Kurz"
                    breadcrumbs={[{ label: "Dashboard", href: "/student" }, { label: "Kurzy", href: "/student/courses" }, { label: "Detail" }]}
                />
                <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                    Táto sekcia je dostupná iba pre prihláseného študenta.
                </div>
            </div>
        );
    }

    if (!courseId || !course) {
        return (
            <div className="space-y-4">
                <PageHeader
                    title="Kurz"
                    breadcrumbs={[{ label: "Dashboard", href: "/student" }, { label: "Kurzy", href: "/student/courses" }, { label: "Detail" }]}
                />
                <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                    {error ?? "Kurz nebol nájdený."}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={course.name}
                subtitle={course.description ?? undefined}
                breadcrumbs={[
                    { label: "Dashboard", href: "/student" },
                    { label: "Kurzy", href: "/student/courses" },
                    { label: course.name },
                ]}
                badge={
                    course.code ? (
                        <span className="pill pill-neutral">{course.code}</span>
                    ) : undefined
                }
            />

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Main content — tabs */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Tab bar */}
                    <div className="flex gap-1 rounded-xl border border-border bg-muted/50 p-1">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                    activeTab === tab.id
                                        ? "bg-card text-foreground shadow-sm dark:bg-white/10 dark:shadow-none"
                                        : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                                }`}
                            >
                                <span>{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    {activeTab === "chat" && (
                        <CourseChat courseId={course.id} />
                    )}

                    {activeTab === "quiz" && (
                        <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none overflow-hidden">
                            <div className="px-5 pt-5 pb-3">
                                <h2 className="text-base font-semibold text-foreground">Kvíz z materiálov kurzu</h2>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                    Otestuj si vedomosti — výsledky sa automaticky uložia do tvojho pokroku.
                                </p>
                            </div>
                            <div className="px-5 pb-5">
                                <CourseQuizPanel courseId={course.id} courseName={course.name} />
                            </div>
                        </div>
                    )}

                    {activeTab === "progress" && (
                        <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none overflow-hidden">
                            <div className="px-5 pt-5 pb-3">
                                <h2 className="text-base font-semibold text-foreground">Môj pokrok</h2>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                    Štatistiky tvojho štúdia v tomto kurze.
                                </p>
                            </div>
                            <div className="px-5 pb-5">
                                <CourseProgressPanel courseId={course.id} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Info sidebar */}
                <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none p-5">
                        <h2 className="mb-4 text-base font-semibold text-foreground">O kurze</h2>
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <BookOpenIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Názov</p>
                                    <p className="text-sm text-foreground mt-0.5">{course.name}</p>
                                </div>
                            </div>
                            {course.code && (
                                <div className="flex items-start gap-3">
                                    <HashIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Kód</p>
                                        <p className="text-sm text-foreground mt-0.5">{course.code}</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-start gap-3">
                                <UserIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Učiteľ</p>
                                    <p className="text-sm text-foreground mt-0.5">
                                        {course.teacher?.name || course.teacher?.email || "—"}
                                    </p>
                                </div>
                            </div>
                            {course.description && (
                                <div className="flex items-start gap-3">
                                    <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Popis</p>
                                        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                                            {course.description}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="mt-5 pt-4 border-t border-border">
                            <Link href="/student/courses" className="btn-ghost w-full text-xs py-2">
                                ← Späť na kurzy
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

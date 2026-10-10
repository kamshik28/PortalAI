// src/app/teacher/courses/[coursesId]/page.tsx
"use client";

import React, { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TeacherCourseChat from "@/components/TeacherCourseChat";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { usePreferences } from "@/hooks/usePreferences";
import toast from "react-hot-toast";
import {
    BookOpenIcon,
    FileTextIcon,
    UploadIcon,
    UsersIcon,
    UserPlusIcon,
    Trash2Icon,
    RefreshCwIcon,
    ExternalLinkIcon,
} from "lucide-react";

type UnitType = "lecture" | "lab";

type Material = {
    id: string;
    courseId: string;
    unitType: UnitType;
    unitIndex: number;
    filename: string;
    createdAt: string;
    signedUrl?: string | null;
    indexedAt?: string | null;
    chunkCount?: number | null;
};

type CourseDetail = {
    id: string;
    name: string;
    code?: string | null;
    description?: string | null;
};

type Student = {
    id: string;
    email: string;
    name?: string | null;
};

type StudentsResponse = { students?: Student[] } | Student[];
type CoursesResponse = { courses?: CourseDetail[] } | CourseDetail[];
type MaterialsResponse = { materials?: Material[] } | Material[];

// ─── Confirm dialog state ─────────────────────────────────────────────────────
type ConfirmState = {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    variant?: "danger" | "default";
    onConfirm: () => void;
};

const CONFIRM_CLOSED: ConfirmState = {
    open: false,
    title: "",
    onConfirm: () => {},
};

export default function TeacherCourseDetailPage() {
    const params = useParams();
    const raw = (params as Record<string, string | string[] | undefined>)?.coursesId;
    const courseId =
        typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;

    const [course, setCourse] = useState<CourseDetail | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(true);
    const { trackRecentCourse } = usePreferences();

    const [studentEmail, setStudentEmail] = useState("");
    const [savingStudent, setSavingStudent] = useState(false);

    const [unitType, setUnitType] = useState<UnitType>("lecture");
    const [unitIndex, setUnitIndex] = useState<number>(1);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [replaceMode, setReplaceMode] = useState(false);

    const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_CLOSED);

    const selectedMaterial = useMemo(
        () => materials.find((m) => m.unitType === unitType && m.unitIndex === unitIndex) ?? null,
        [materials, unitType, unitIndex]
    );

    const loadMaterials = async (id: string) => {
        const res = await fetch(`/api/teacher/courses/${id}/materials`);
        if (!res.ok) { setMaterials([]); return; }
        const data = (await res.json()) as MaterialsResponse;
        setMaterials(Array.isArray(data) ? data : data.materials ?? []);
    };

    useEffect(() => {
        if (!courseId) return;
        const load = async () => {
            try {
                setLoading(true);
                try {
                    const resCourse = await fetch("/api/teacher/courses");
                    if (resCourse.ok) {
                        const data = (await resCourse.json()) as CoursesResponse;
                        const list = Array.isArray(data) ? data : data.courses ?? [];
                        const found = list.find((c) => c.id === courseId);
                        if (found) {
                            setCourse(found);
                            trackRecentCourse({ id: found.id, name: found.name, code: found.code, role: "teacher" });
                        }
                    }
                } catch { /* ignore */ }

                const resStudents = await fetch(`/api/teacher/courses/${courseId}/students`);
                if (resStudents.ok) {
                    const data = (await resStudents.json()) as StudentsResponse;
                    setStudents(Array.isArray(data) ? data : data.students ?? []);
                } else {
                    setStudents([]);
                }

                await loadMaterials(courseId);
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [courseId]);

    useEffect(() => {
        setReplaceMode(false);
        setPdfFile(null);
    }, [unitType, unitIndex]);

    // ── Add student ──────────────────────────────────────────────────────────
    const handleAddStudent = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!studentEmail.trim() || !courseId) return;

        try {
            setSavingStudent(true);
            const res = await fetch(`/api/teacher/courses/${courseId}/students`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ studentEmail: studentEmail.trim() }),
            });

            const rawText = await res.text().catch(() => "");
            let parsed: unknown = null;
            try { parsed = rawText ? JSON.parse(rawText) : null; } catch { parsed = rawText; }

            if (!res.ok) {
                let message = "Nepodarilo sa pridať študenta.";
                if (parsed && typeof parsed === "object" && "backendBody" in parsed) {
                    const bb = (parsed as { backendBody?: string }).backendBody;
                    if (bb) {
                        try { message = (JSON.parse(bb) as { message?: string }).message ?? bb; }
                        catch { message = bb; }
                    }
                } else if (parsed && typeof parsed === "object" && "message" in parsed) {
                    message = String((parsed as { message?: string }).message ?? message);
                } else if (typeof parsed === "string" && parsed.trim()) {
                    message = parsed;
                }
                toast.error(message);
                return;
            }

            const rawStudent = parsed as { student?: Student } | Student | null;
            const added: Student =
                rawStudent && typeof rawStudent === "object" && "student" in rawStudent && rawStudent.student
                    ? rawStudent.student
                    : (rawStudent as Student);

            setStudents((prev) => prev.some((s) => s.id === added.id) ? prev : [...prev, added]);
            setStudentEmail("");
            toast.success("Študent bol pridaný");
        } catch {
            toast.error("Nepodarilo sa pridať študenta.");
        } finally {
            setSavingStudent(false);
        }
    };

    // ── Remove student ───────────────────────────────────────────────────────
    const handleRemoveStudent = (studentId: string, studentName: string) => {
        setConfirm({
            open: true,
            title: "Odstrániť študenta?",
            description: `Naozaj chceš odstrániť „${studentName}" z kurzu?`,
            confirmLabel: "Odstrániť",
            variant: "danger",
            onConfirm: async () => {
                setConfirm(CONFIRM_CLOSED);
                if (!courseId) return;
                try {
                    const res = await fetch(`/api/teacher/courses/${courseId}/students/${studentId}`, {
                        method: "DELETE",
                    });

                    const rawText = await res.text().catch(() => "");
                    let parsed: unknown = null;
                    try { parsed = rawText ? JSON.parse(rawText) : null; } catch { parsed = rawText; }

                    if (!res.ok) {
                        let message = "Nepodarilo sa odstrániť študenta.";
                        if (parsed && typeof parsed === "object" && "backendBody" in parsed) {
                            const bb = (parsed as { backendBody?: string }).backendBody;
                            if (bb) {
                                try { message = (JSON.parse(bb) as { message?: string }).message ?? bb; }
                                catch { message = bb; }
                            }
                        } else if (parsed && typeof parsed === "object" && "message" in parsed) {
                            message = String((parsed as { message?: string }).message ?? message);
                        }
                        toast.error(message);
                        return;
                    }

                    setStudents((prev) => prev.filter((s) => s.id !== studentId));
                    toast.success("Študent bol odstránený");
                } catch {
                    toast.error("Nepodarilo sa odstrániť študenta.");
                }
            },
        });
    };

    // ── Upload material ──────────────────────────────────────────────────────
    const handleUploadOrReplaceMaterial = async () => {
        if (!courseId || !pdfFile) return;
        try {
            setUploading(true);
            const form = new FormData();
            form.append("file", pdfFile);
            form.append("unitType", unitType);
            form.append("unitIndex", String(unitIndex));
            form.append("replaceExisting", replaceMode ? "true" : "false");

            const res = await fetch(`/api/teacher/courses/${courseId}/materials`, {
                method: "POST",
                body: form,
            });

            const rawText = await res.text().catch(() => "");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let parsed: any = null;
            try { parsed = rawText ? JSON.parse(rawText) : null; } catch { parsed = rawText; }

            if (!res.ok) {
                let message = "Nepodarilo sa nahrať PDF.";
                if (parsed?.body?.message) message = parsed.body.message;
                else if (parsed?.message) message = parsed.message;
                else if (typeof parsed === "string" && parsed.trim()) message = parsed;
                toast.error(message);
                return;
            }

            await loadMaterials(courseId);
            setPdfFile(null);
            setReplaceMode(false);
            toast.success(replaceMode ? "PDF bolo nahradené" : "PDF bolo nahrané");
        } catch {
            toast.error("Nepodarilo sa nahrať PDF.");
        } finally {
            setUploading(false);
        }
    };

    // ── Delete material ──────────────────────────────────────────────────────
    const handleDeleteMaterial = (material: Material) => {
        setConfirm({
            open: true,
            title: "Odstrániť PDF?",
            description: `Naozaj chceš odstrániť súbor „${material.filename}"?`,
            confirmLabel: "Odstrániť",
            variant: "danger",
            onConfirm: async () => {
                setConfirm(CONFIRM_CLOSED);
                if (!courseId) return;
                try {
                    const res = await fetch(`/api/teacher/courses/${courseId}/materials/${material.id}`, {
                        method: "DELETE",
                    });
                    if (!res.ok) {
                        toast.error("Nepodarilo sa odstrániť PDF.");
                        return;
                    }
                    await loadMaterials(courseId);
                    setPdfFile(null);
                    setReplaceMode(false);
                    toast.success("PDF bolo odstránené");
                } catch {
                    toast.error("Nepodarilo sa odstrániť PDF.");
                }
            },
        });
    };

    if (!courseId) {
        return <p className="text-neutral-400">Chýba coursesId v URL.</p>;
    }

    return (
        <div className="space-y-8">
            <ConfirmDialog
                open={confirm.open}
                title={confirm.title}
                description={confirm.description}
                confirmLabel={confirm.confirmLabel}
                variant={confirm.variant}
                onConfirm={confirm.onConfirm}
                onCancel={() => setConfirm(CONFIRM_CLOSED)}
            />

            <PageHeader
                title={course?.name ?? "Kurz"}
                subtitle={course?.description ?? undefined}
                breadcrumbs={[
                    { label: "Kurzy", href: "/teacher/courses" },
                    { label: course?.name ?? courseId },
                ]}
                badge={
                    course?.code ? (
                        <span className="pill pill-neutral">{course.code}</span>
                    ) : undefined
                }
            />

            {/* ── Stats cards ── */}
            {!loading && (
                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Materiály</p>
                        <p className="mt-2 text-2xl font-bold text-white">{materials.length}</p>
                        <p className="mt-1 text-xs text-neutral-400">Nahraté PDF súbory</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Študenti</p>
                        <p className="mt-2 text-2xl font-bold text-white">{students.length}</p>
                        <p className="mt-1 text-xs text-neutral-400">Priradení do kurzu</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">AI chat</p>
                        <p className="mt-2 text-2xl font-bold text-emerald-400">Aktívny</p>
                        <p className="mt-1 text-xs text-neutral-400">Pripravený odpovedať</p>
                    </div>
                </div>
            )}

            {/* ── Materials section ── */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                    <FileTextIcon className="h-4 w-4 text-neutral-400" />
                    <h2 className="text-base font-semibold text-white">Materiály (PDF)</h2>
                </div>
                <p className="text-sm text-neutral-400">
                    Pre každú kombináciu typ + číslo môže byť uložený iba jeden PDF súbor.
                </p>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
                    <div className="grid gap-4 lg:grid-cols-12">
                        <div className="lg:col-span-3 space-y-1.5">
                            <label className="block text-sm font-medium text-neutral-300">Typ</label>
                            <select
                                className="select-dark"
                                value={unitType}
                                onChange={(e) => setUnitType(e.target.value as UnitType)}
                            >
                                <option value="lecture">Prednáška</option>
                                <option value="lab">Cvičenie</option>
                            </select>
                        </div>

                        <div className="lg:col-span-2 space-y-1.5">
                            <label className="block text-sm font-medium text-neutral-300">Číslo</label>
                            <select
                                className="select-dark"
                                value={unitIndex}
                                onChange={(e) => setUnitIndex(Number(e.target.value))}
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>

                        <div className="lg:col-span-7">
                            {!selectedMaterial || replaceMode ? (
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-neutral-300">
                                        {replaceMode ? "Nový PDF súbor" : "PDF súbor"}
                                    </label>

                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        multiple={false}
                                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-300
                                            file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-white
                                            hover:file:bg-white/15 transition"
                                        onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                                    />

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            disabled={!pdfFile || uploading}
                                            onClick={handleUploadOrReplaceMaterial}
                                            className="btn-primary"
                                        >
                                            <UploadIcon className="h-4 w-4" />
                                            {uploading
                                                ? (replaceMode ? "Nahrádzam..." : "Nahrávam...")
                                                : (replaceMode ? "Uložiť nový súbor" : "Nahrať PDF")}
                                        </button>
                                        {replaceMode && (
                                            <button
                                                className="btn-ghost"
                                                onClick={() => { setReplaceMode(false); setPdfFile(null); }}
                                            >
                                                Zrušiť
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-4">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-white">
                                                Súbor pre tento slot existuje
                                            </p>
                                            <p className="mt-0.5 text-sm text-neutral-300">
                                                {selectedMaterial.filename}
                                            </p>
                                            <p className="mt-0.5 text-xs text-neutral-500">
                                                {selectedMaterial.unitType === "lecture" ? "Prednáška" : "Cvičenie"}{" "}
                                                {selectedMaterial.unitIndex}
                                            </p>
                                            {selectedMaterial.indexedAt ? (
                                                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                                    Indexované{selectedMaterial.chunkCount != null ? ` (${selectedMaterial.chunkCount} ch.)` : ""}
                                                </span>
                                            ) : (
                                                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                                                    Nenajdené v AI — súbor existuje, ale nie je prehľadávateľný
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedMaterial.signedUrl && (
                                                <a
                                                    href={selectedMaterial.signedUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="btn-ghost text-xs px-3 py-1.5"
                                                >
                                                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                                                    Otvoriť PDF
                                                </a>
                                            )}
                                            <button
                                                className="btn-ghost text-xs px-3 py-1.5"
                                                onClick={() => { setReplaceMode(true); setPdfFile(null); }}
                                            >
                                                <RefreshCwIcon className="h-3.5 w-3.5" />
                                                Nahradiť
                                            </button>
                                            <button
                                                className="btn-danger text-xs px-3 py-1.5"
                                                onClick={() => handleDeleteMaterial(selectedMaterial)}
                                            >
                                                <Trash2Icon className="h-3.5 w-3.5" />
                                                Odstrániť
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs text-neutral-400">
                        Vybraný slot:{" "}
                        <span className="font-medium text-white">
                            {unitType === "lecture" ? "Prednáška" : "Cvičenie"} {unitIndex}
                        </span>
                    </div>
                </div>

                {/* Materials list */}
                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-neutral-300">Nahrané materiály</h3>

                    {loading ? (
                        <div className="skeleton h-24 rounded-2xl" />
                    ) : materials.length === 0 ? (
                        <EmptyState
                            icon={<FileTextIcon className="h-6 w-6" />}
                            title="Zatiaľ žiadne PDF materiály"
                            description="Nahraj prvý PDF súbor výberom slotu vyššie."
                        />
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                            {materials.map((m) => (
                                <div
                                    key={m.id}
                                    className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4"
                                >
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                                            <FileTextIcon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-white">
                                                {m.filename}
                                            </p>
                                            <p className="text-xs text-neutral-500">
                                                {m.unitType === "lecture" ? "Prednáška" : "Cvičenie"}{" "}
                                                {m.unitIndex}
                                            </p>
                                            {m.indexedAt ? (
                                                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                                    Indexované{m.chunkCount != null ? ` (${m.chunkCount} ch.)` : ""}
                                                </span>
                                            ) : (
                                                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                                                    Nenajdené v AI
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {m.signedUrl && (
                                            <a
                                                href={m.signedUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="btn-ghost text-xs px-2.5 py-1.5"
                                            >
                                                <ExternalLinkIcon className="h-3.5 w-3.5" />
                                            </a>
                                        )}
                                        <button
                                            className="btn-ghost text-xs px-2.5 py-1.5"
                                            onClick={() => {
                                                setUnitType(m.unitType);
                                                setUnitIndex(m.unitIndex);
                                                setReplaceMode(true);
                                                setPdfFile(null);
                                            }}
                                        >
                                            <RefreshCwIcon className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            className="btn-danger text-xs px-2.5 py-1.5"
                                            onClick={() => handleDeleteMaterial(m)}
                                        >
                                            <Trash2Icon className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* ── AI Chat + Test Generator (unified) ── */}
            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <BookOpenIcon className="h-4 w-4 text-neutral-400" />
                    <h2 className="text-base font-semibold text-white">AI asistent a generátor testov</h2>
                </div>
                <TeacherCourseChat courseId={courseId} />
            </section>

            {/* ── Students ── */}
            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <UsersIcon className="h-4 w-4 text-neutral-400" />
                    <h2 className="text-base font-semibold text-white">Študenti v kurze</h2>
                </div>

                <form
                    onSubmit={handleAddStudent}
                    className="flex flex-col gap-3 md:flex-row md:items-end"
                >
                    <div className="flex-1 space-y-1.5">
                        <label className="block text-sm font-medium text-neutral-300">
                            Pridať študenta
                        </label>
                        <input
                            type="email"
                            className="input-dark"
                            value={studentEmail}
                            onChange={(e) => setStudentEmail(e.target.value)}
                            placeholder="Email študenta"
                            required
                        />
                    </div>
                    <button type="submit" disabled={savingStudent} className="btn-primary shrink-0">
                        <UserPlusIcon className="h-4 w-4" />
                        {savingStudent ? "Pridávam..." : "Pridať"}
                    </button>
                </form>

                {loading ? (
                    <div className="skeleton h-16 rounded-xl" />
                ) : students.length === 0 ? (
                    <EmptyState
                        icon={<UsersIcon className="h-6 w-6" />}
                        title="Zatiaľ žiadni študenti"
                        description="Pridaj prvého študenta zadaním jeho emailu."
                    />
                ) : (
                    <ul className="space-y-2">
                        {students.map((s) => (
                            <li
                                key={s.id}
                                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                            >
                                <div>
                                    <p className="text-sm font-medium text-white">
                                        {s.name ?? s.email}
                                    </p>
                                    {s.name && (
                                        <p className="text-xs text-neutral-500">{s.email}</p>
                                    )}
                                </div>
                                <button
                                    className="btn-danger text-xs px-3 py-1.5"
                                    onClick={() => handleRemoveStudent(s.id, s.name ?? s.email)}
                                >
                                    <Trash2Icon className="h-3.5 w-3.5" />
                                    Odstrániť
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

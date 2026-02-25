// src/app/teacher/courses/[coursesId]/page.tsx
"use client";

import React, { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import CourseChat from "@/components/CourseChat";

type UnitType = "lecture" | "lab";

type Material = {
    id: string;
    courseId: string;
    unitType: UnitType;
    unitIndex: number;
    filename: string;
    createdAt: string;
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

export default function TeacherCourseDetailPage() {
    const params = useParams();

    // 🔥 ВАЖЛИВО: назва ключа = [coursesId]
    const raw = (params as Record<string, string | string[] | undefined>)?.coursesId;

    const courseId =
        typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;

    const [course, setCourse] = useState<CourseDetail | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);

    const [studentEmail, setStudentEmail] = useState("");
    const [savingStudent, setSavingStudent] = useState(false);

    const [unitType, setUnitType] = useState<UnitType>("lecture");
    const [unitIndex, setUnitIndex] = useState<number>(1);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [materials, setMaterials] = useState<Material[]>([]);

    useEffect(() => {
        if (!courseId) return;

        const load = async () => {
            try {
                setLoading(true);

                // 1) detail kurzu (dočasne cez /api/teacher/courses a find)
                try {
                    const resCourse = await fetch("/api/teacher/courses", {
                        method: "GET",
                        headers: { "Content-Type": "application/json" },
                    });

                    if (resCourse.ok) {
                        const data = (await resCourse.json()) as CoursesResponse;
                        const list = Array.isArray(data) ? data : data.courses ?? [];
                        const found = list.find((c) => c.id === courseId);
                        if (found) setCourse(found);
                    }
                } catch {
                    // detail nie je kritický
                }

                // 2) študenti v kurze
                const resStudents = await fetch(`/api/teacher/courses/${courseId}/students`, {
                    method: "GET",
                    headers: { "Content-Type": "application/json" },
                });

                if (resStudents.ok) {
                    const data = (await resStudents.json()) as StudentsResponse;
                    const list = Array.isArray(data) ? data : data.students ?? [];
                    setStudents(list);
                } else {
                    // не валимо сторінку, просто пустий список
                    setStudents([]);
                }
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, [courseId]);

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

            if (!res.ok) {
                console.error("Add student failed, status", res.status);
                alert("Nepodarilo sa pridať študenta.");
                return;
            }

            const raw = (await res.json()) as { student?: Student } | Student;
            const added: Student =
                typeof raw === "object" && raw !== null && "student" in raw && raw.student
                    ? raw.student
                    : (raw as Student);

            setStudents((prev) => [...prev, added]);
            setStudentEmail("");
        } catch (err) {
            console.error("Add student error", err);
            alert("Nepodarilo sa pridať študenta.");
        } finally {
            setSavingStudent(false);
        }
    };

    const handleRemoveStudent = async (studentId: string) => {
        if (!courseId) return;

        const confirmed = window.confirm("Naozaj chceš odstrániť študenta z kurzu?");
        if (!confirmed) return;

        try {
            const res = await fetch(
                `/api/teacher/courses/${courseId}/students/${studentId}`,
                { method: "DELETE" }
            );

            if (!res.ok) {
                console.error("Remove student failed, status", res.status);
                alert("Nepodarilo sa odstrániť študenta.");
                return;
            }

            setStudents((prev) => prev.filter((s) => s.id !== studentId));
        } catch (err) {
            console.error("Remove student error", err);
            alert("Nepodarilo sa odstrániť študenta.");
        }
    };

    if (!courseId) {
        return <p>Chýba coursesId v URL.</p>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">
                    Kurz: {course?.name ?? courseId}
                </h1>

                {course?.code && (
                    <p className="text-sm text-muted-foreground">Kód: {course.code}</p>
                )}

                {course?.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                        {course.description}
                    </p>
                )}
            </div>

            {/* Materiály (PDF) */}
            <section className="space-y-3">
                <h2 className="font-medium">Materiály (PDF)</h2>

                <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Typ</label>
                            <select
                                className="border rounded-md px-3 py-2 w-full text-sm bg-background text-foreground"
                                value={unitType}
                                onChange={(e) => setUnitType(e.target.value as UnitType)}
                            >
                                <option value="lecture">Prednáška</option>
                                <option value="lab">Cvičenie</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">Číslo</label>
                            <select
                                className="border rounded-md px-3 py-2 w-full text-sm bg-background text-foreground"
                                value={unitIndex}
                                onChange={(e) => setUnitIndex(Number(e.target.value))}
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">PDF súbor</label>
                            <input
                                type="file"
                                accept="application/pdf"
                                multiple={false}
                                className="border rounded-md px-3 py-2 w-full text-sm bg-background text-foreground"
                                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                            />
                        </div>
                    </div>

                    <Button
                        disabled={!pdfFile || uploading}
                        onClick={async () => {
                            if (!courseId || !pdfFile) return;

                            try {
                                setUploading(true);

                                const form = new FormData();
                                form.append("file", pdfFile);
                                form.append("unitType", unitType);
                                form.append("unitIndex", String(unitIndex));

                                const res = await fetch(`/api/teacher/courses/${courseId}/materials`, {
                                    method: "POST",
                                    body: form,
                                });

                                if (!res.ok) {
                                    const t = await res.text().catch(() => "");
                                    console.error("Upload material failed:", res.status, t);
                                    alert("Nepodarilo sa nahrať PDF.");
                                    return;
                                }

                                const data = await res.json().catch(() => null);

                                if (data?.material) {
                                    setMaterials((prev) => [data.material, ...prev]);
                                }

                                setPdfFile(null);
                                alert("PDF nahraté a indexované. Chat ho môže použiť.");
                            } catch (err) {
                                console.error("Upload material error:", err);
                                alert("Nepodarilo sa nahrať PDF.");
                            } finally {
                                setUploading(false);
                            }
                        }}
                    >
                        {uploading ? "Nahrávam..." : "Nahrať PDF"}
                    </Button>
                </div>

                {materials.length > 0 && (
                    <div className="space-y-2">
                        {materials.map((m) => (
                            <div key={m.id} className="rounded-md border bg-card px-3 py-2 text-sm">
                                <div className="font-medium">{m.filename}</div>
                                <div className="text-xs text-muted-foreground">
                                    {m.unitType === "lecture" ? "Prednáška" : "Cvičenie"} {m.unitIndex}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>


            {/* AI chat pre tento kurz */}
            <section className="space-y-2">
                <h2 className="font-medium">AI chat pre tento kurz</h2>
                <CourseChat courseId={courseId} />
            </section>

            {/* Správa študentov */}
            <section className="space-y-3">
                <h2 className="font-medium">Študenti v kurze</h2>

                <form
                    onSubmit={handleAddStudent}
                    className="flex flex-col md:flex-row gap-2 md:items-center"
                >
                    <input
                        type="email"
                        className="border rounded-md px-3 py-2 w-full text-sm bg-background text-foreground"
                        value={studentEmail}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setStudentEmail(e.target.value)
                        }
                        placeholder="Email študenta"
                        required
                    />
                    <Button type="submit" disabled={savingStudent}>
                        {savingStudent ? "Pridávam..." : "Pridať študenta"}
                    </Button>
                </form>

                {loading && <p>Načítavam...</p>}

                {!loading && students.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        Zatiaľ nie sú priradení žiadni študenti.
                    </p>
                )}

                {students.length > 0 && (
                    <ul className="space-y-2">
                        {students.map((s) => (
                            <li
                                key={s.id}
                                className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
                            >
                                <div>
                                    <p className="text-sm">{s.name ?? s.email}</p>
                                    <p className="text-xs text-muted-foreground">{s.email}</p>
                                </div>

                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleRemoveStudent(s.id)}
                                >
                                    Odstrániť
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

// src/app/teacher/courses/page.tsx
"use client";

import React, { useEffect, useState, FormEvent, ChangeEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Course = {
    id: string;
    name: string;
    code?: string | null;
    description?: string | null;
};

type CoursesResponse = { courses?: Course[] } | Course[];

export default function TeacherCoursesPage() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [description, setDescription] = useState("");
    const [creating, setCreating] = useState(false);

    // показ / скриття formulára
    const [showCreate, setShowCreate] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                setError(null);

                const res = await fetch("/api/teacher/courses", {
                    method: "GET",
                    headers: { "Content-Type": "application/json" },
                });

                if (!res.ok) {
                    console.error("Failed to load courses, status", res.status);
                    setError("Nepodarilo sa načítať kurzy.");
                    return;
                }

                const data = (await res.json()) as CoursesResponse;
                const list = Array.isArray(data) ? data : data.courses ?? [];
                setCourses(list);
            } catch (err) {
                console.error("Failed to load courses", err);
                setError("Nepodarilo sa načítať kurzy.");
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, []);

    const handleCreateCourse = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!name.trim()) return;

        try {
            setCreating(true);
            setError(null);

            const res = await fetch("/api/teacher/courses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    code: code.trim() || null,
                    description: description.trim() || null,
                }),
            });

            if (!res.ok) {
                console.error("Create course failed, status", res.status);
                setError("Nepodarilo sa vytvoriť kurz.");
                return;
            }

            const raw = (await res.json()) as { course?: Course } | Course;

            const course: Course =
                typeof raw === "object" && raw !== null && "course" in raw && raw.course
                    ? raw.course
                    : (raw as Course);

            // додати зверху + без дубля
            setCourses((prev) => [course, ...prev.filter((c) => c.id !== course.id)]);

            // очистити форму
            setName("");
            setCode("");
            setDescription("");

            // сховати форму після створення
            setShowCreate(false);
        } catch (err) {
            console.error("Create course error", err);
            setError("Nepodarilo sa vytvoriť kurz.");
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Заголовок + кругла кнопка справа */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Moje kurzy</h1>
                    <p className="text-sm text-muted-foreground">
                        Tu môžeš vytvárať nové kurzy a otvárať AI chat pre každý kurz.
                    </p>
                </div>

                {/* Кругла кнопка + / - */}
                <button
                    type="button"
                    onClick={() => setShowCreate((v) => !v)}
                    className="h-10 w-10 rounded-full bg-white text-black shadow hover:bg-white/90 transition flex items-center justify-center"
                    aria-label={showCreate ? "Skryť formulár" : "Vytvoriť nový kurz"}
                    title={showCreate ? "Skryť formulár" : "Vytvoriť nový kurz"}
                >
                    <span className="text-xl leading-none">{showCreate ? "−" : "+"}</span>
                </button>
            </div>

            {/* Formulár на створення курсу (тільки якщо showCreate) */}
            {showCreate && (
                <form
                    onSubmit={handleCreateCourse}
                    className="space-y-3 rounded-xl border bg-card p-4"
                >
                    <h2 className="font-medium">Vytvoriť nový kurz</h2>

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="md:col-span-2 space-y-1">
                            <label className="text-sm font-medium">Názov kurzu</label>
                            <input
                                className="border rounded-md px-3 py-2 w-full text-sm bg-background text-foreground"
                                value={name}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setName(e.target.value)
                                }
                                placeholder="Napr. IKT – Inteligentné komunikačné technológie"
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">Kód</label>
                            <input
                                className="border rounded-md px-3 py-2 w-full text-sm bg-background text-foreground"
                                value={code}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setCode(e.target.value)
                                }
                                placeholder="Napr. IKT1"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">
                            Krátky popis (voliteľné)
                        </label>
                        <textarea
                            className="border rounded-md px-3 py-2 w-full text-sm bg-background text-foreground"
                            value={description}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                                setDescription(e.target.value)
                            }
                            placeholder="Čo je cieľom kurzu, pre akých študentov je určený..."
                            rows={3}
                        />
                    </div>

                    <Button type="submit" disabled={creating}>
                        {creating ? "Vytváram..." : "Vytvoriť kurz"}
                    </Button>
                </form>
            )}

            {loading && <p>Načítavam kurzy...</p>}
            {error && <p className="text-sm text-red-500">{error}</p>}

            {!loading && !error && courses.length === 0 && (
                <p className="text-sm text-muted-foreground">Zatiaľ nemáš žiadne kurzy.</p>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => (
                    <div
                        key={course.id}
                        className="rounded-xl border bg-card p-4 flex flex-col justify-between"
                    >
                        <div>
                            <h2 className="font-medium">{course.name}</h2>

                            {course.code && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Kód: {course.code}
                                </p>
                            )}

                            {course.description && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    {course.description}
                                </p>
                            )}
                        </div>

                        <div className="mt-4 flex gap-2">
                            <Button asChild size="sm" variant="outline">
                                <Link href={`/teacher/courses/${course.id}`}>Otvoriť kurz</Link>
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

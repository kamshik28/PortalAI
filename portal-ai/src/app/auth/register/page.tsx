// src/app/auth/register/page.tsx

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Role = "student" | "teacher";

export default function RegisterPage() {
    const router = useRouter();
    const [role, setRole] = useState<Role>("student");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setIsLoading(true);

        const form = e.currentTarget;
        const formData = new FormData(form);

        const fullName = formData.get("fullName") as string;
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;
        const roleFromForm = formData.get("role") as Role | null;

        const finalRole: Role = roleFromForm ?? role;

        const payload = {
            fullName,
            email,
            password,
            role: finalRole,
        };

        try {
            // 1️⃣ реєстрація
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setError((data as any)?.message || "Registration failed");
                return;
            }

            setSuccess("Registracia prebehla, prihlasujem...");

            // 2️⃣ автоматичний логін, щоб зловити токен + user_role з бекенда
            const loginRes = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const loginData = await loginRes.json().catch(() => null);

            if (!loginRes.ok) {
                console.error("Autologin error:", loginData);
                setError(
                    (loginData as any)?.message ||
                    "Registracia prebehla, ale prihlasenie zlyhalo",
                );
                return;
            }

            router.push("/");
        } catch (err) {
            console.error(err);
            setError("Network error");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <Card className="w-full max-w-md p-6 space-y-4">
                <h1 className="text-2xl font-semibold text-center">
                    Registracia
                </h1>

                {error && (
                    <p className="text-sm text-red-500 text-center">
                        {error}
                    </p>
                )}
                {success && (
                    <p className="text-sm text-green-600 text-center">
                        {success}
                    </p>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label
                            className="text-sm font-medium"
                            htmlFor="fullName"
                        >
                            Meno a priezvisko
                        </label>
                        <input
                            id="fullName"
                            name="fullName"
                            type="text"
                            required
                            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <label
                            className="text-sm font-medium"
                            htmlFor="email"
                        >
                            E-mail
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <label
                            className="text-sm font-medium"
                            htmlFor="password"
                        >
                            Heslo
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            minLength={6}
                            required
                            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                        />
                    </div>

                    <div className="space-y-1">
                        <span className="text-sm font-medium">Rola</span>
                        <div className="flex gap-4 mt-1">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="radio"
                                    name="role"
                                    value="student"
                                    checked={role === "student"}
                                    onChange={() => setRole("student")}
                                />
                                Student
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="radio"
                                    name="role"
                                    value="teacher"
                                    checked={role === "teacher"}
                                    onChange={() => setRole("teacher")}
                                />
                                Ucitel
                            </label>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                    >
                        {isLoading ? "Registrujem..." : "Zaregistrovat sa"}
                    </Button>
                </form>
            </Card>
        </div>

    );
}

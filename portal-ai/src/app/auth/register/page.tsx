// src/app/auth/register/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
        const roleFromForm = (formData.get("role") as Role | null) ?? role;

        const payload = { fullName, email, password, role: roleFromForm };

        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setError((data as { message?: string })?.message || "Registrácia zlyhala");
                return;
            }

            setSuccess("Registrácia prebehla, prihlasoujem...");

            const loginRes = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const loginData = await loginRes.json().catch(() => null);

            if (!loginRes.ok) {
                setError(
                    (loginData as { message?: string })?.message ||
                    "Registrácia prebehla, ale prihlásenie zlyhalo"
                );
                return;
            }

            router.push("/");
            router.refresh();
        } catch {
            setError("Chyba siete — skús to znova");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
            <div className="w-full max-w-sm">
                {/* Header */}
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/8 ring-1 ring-white/15">
                        <span className="text-sm font-black text-white">AI</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Vytvor účet</h1>
                    <p className="mt-1.5 text-sm text-neutral-400">
                        Zaregistruj sa do PortalAI
                    </p>
                </div>

                {/* Card */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-sm">
                    {error && (
                        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                            {success}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-neutral-300" htmlFor="fullName">
                                Meno a priezvisko
                            </label>
                            <input
                                id="fullName"
                                name="fullName"
                                type="text"
                                required
                                autoComplete="name"
                                placeholder="Ján Novák"
                                className="input-dark"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-neutral-300" htmlFor="email">
                                E-mail
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                required
                                autoComplete="email"
                                placeholder="tvoj@email.sk"
                                className="input-dark"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-neutral-300" htmlFor="password">
                                Heslo
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                minLength={6}
                                required
                                autoComplete="new-password"
                                placeholder="min. 6 znakov"
                                className="input-dark"
                            />
                        </div>

                        <div className="space-y-2">
                            <span className="block text-sm font-medium text-neutral-300">Rola</span>
                            <div className="grid grid-cols-2 gap-2">
                                {(["student", "teacher"] as const).map((r) => (
                                    <label
                                        key={r}
                                        className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                                            role === r
                                                ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                                                : "border-white/10 bg-white/5 text-neutral-400 hover:bg-white/8 hover:text-white"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="role"
                                            value={r}
                                            checked={role === r}
                                            onChange={() => setRole(r)}
                                            className="sr-only"
                                        />
                                        {r === "student" ? "Študent" : "Učiteľ"}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-primary w-full mt-2"
                        >
                            {isLoading ? "Registrujem..." : "Zaregistrovať sa"}
                        </button>
                    </form>
                </div>

                <p className="mt-4 text-center text-sm text-neutral-500">
                    Máš účet?{" "}
                    <Link
                        href="/auth/login"
                        className="text-sky-400 hover:text-sky-300 transition font-medium"
                    >
                        Prihlás sa
                    </Link>
                </p>
            </div>
        </div>
    );
}

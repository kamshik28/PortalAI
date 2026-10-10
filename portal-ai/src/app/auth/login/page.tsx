// src/app/auth/login/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        const form = e.currentTarget;
        const formData = new FormData(form);

        const payload = {
            email: formData.get("email"),
            password: formData.get("password"),
        };

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setError(data?.message || "Prihlásenie zlyhalo");
            } else {
                router.push("/");
                router.refresh();
            }
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
                    <h1 className="text-2xl font-bold text-white">Vitaj späť</h1>
                    <p className="mt-1.5 text-sm text-neutral-400">
                        Prihlás sa do svojho účtu
                    </p>
                </div>

                {/* Card */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-sm">
                    {error && (
                        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
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
                                required
                                autoComplete="current-password"
                                placeholder="••••••••"
                                className="input-dark"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn-primary w-full mt-2"
                        >
                            {isLoading ? "Prihlasujem..." : "Prihlásiť sa"}
                        </button>
                    </form>
                </div>

                <p className="mt-4 text-center text-sm text-neutral-500">
                    Nemáš účet?{" "}
                    <Link
                        href="/auth/register"
                        className="text-sky-400 hover:text-sky-300 transition font-medium"
                    >
                        Zaregistruj sa
                    </Link>
                </p>
            </div>
        </div>
    );
}

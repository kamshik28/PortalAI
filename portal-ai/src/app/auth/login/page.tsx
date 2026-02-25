// src/app/auth/login/page.tsx

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
                setError(data?.message || "Login failed");
            } else {
                // кука ставиться в /api/auth/login
                router.push("/");
            }
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
                    Prihlasenie
                </h1>

                {error && (
                    <p className="text-sm text-red-500 text-center">{error}</p>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor="email">
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
                        <label className="text-sm font-medium" htmlFor="password">
                            Heslo
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                    >
                        {isLoading ? "Prihlasujem..." : "Prihlasit sa"}
                    </Button>
                </form>
            </Card>
        </div>
    );
}

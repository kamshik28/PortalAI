"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {BellIcon, BookOpenIcon, ChartBarIcon, HomeIcon} from "lucide-react";
import { Button } from "@/components/ui/button";
import ModeToggle from "./ModeToggle";

type UserRole = "student" | "teacher" | null;

function DesktopNavbar() {
    const [role, setRole] = useState<UserRole>(null);
    const pathname = usePathname();
    const router = useRouter();

    const isLoggedIn = role !== null;

    // читаємо роль з cookie user_role
    useEffect(() => {
        if (typeof document === "undefined") return;

        const cookies = document.cookie || "";
        const roleCookie = cookies
            .split("; ")
            .find((c) => c.startsWith("user_role="));

        if (!roleCookie) {
            setRole(null);
            return;
        }

        const value = decodeURIComponent(roleCookie.split("=")[1] || "");

        if (value === "student" || value === "teacher") {
            setRole(value);
        } else {
            setRole(null);
        }
    }, [pathname]); // оновлюємо при зміні маршруту

    async function handleLogout() {
        try {
            await fetch("/api/auth/logout", {
                method: "POST",
            });

            if (typeof window !== "undefined") {
                // на всякий випадок, якщо колись знову будеш зберігати токен у localStorage
                window.localStorage.removeItem("access_token");
            }
        } catch (e) {
            console.error("Logout error:", e);
        } finally {
            setRole(null);
            router.push("/");
        }
    }

    return (
        <div className="hidden md:flex items-center space-x-4">
            <ModeToggle />

            <Button variant="ghost" className="flex items-center gap-2" asChild>
                <Link href="/">
                    <HomeIcon className="w-4 h-4" />
                    <span className="hidden lg:inline">Home</span>
                </Link>
            </Button>

            <Button variant="ghost" className="flex items-center gap-2" asChild>
                <Link href="/ui/completion">
                    <ChartBarIcon className="w-4 h-4" />
                    <span className="hidden lg:inline">Chat</span>
                </Link>
            </Button>
            {role === "teacher" && (
                <Button
                    variant="ghost"
                    className="flex items-center gap-2"
                    asChild
                >
                    <Link href="/teacher/courses">
                        <BookOpenIcon className="w-4 h-4" />
                        <span className="hidden lg:inline">Kurzy</span>
                    </Link>
                </Button>
            )}
            <Button variant="ghost" className="flex items-center gap-2" asChild>
                <Link href="/notifications">
                    <BellIcon className="w-4 h-4" />
                    <span className="hidden lg:inline">Notifications</span>
                </Link>
            </Button>

            {isLoggedIn ? (
                <>
                    <span className="text-sm text-muted-foreground">
                        {role === "teacher" ? "Učiteľ" : "Študent"}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLogout}
                    >
                        Logout
                    </Button>
                </>
            ) : (
                <>
                    <Button variant="outline" asChild>
                        <Link href="/auth/login">Login</Link>
                    </Button>
                    <Button variant="default" asChild>
                        <Link href="/auth/register">Register</Link>
                    </Button>
                </>
            )}
        </div>
    );
}

export default DesktopNavbar;

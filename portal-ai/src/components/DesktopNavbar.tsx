// src/components/DesktopNavbar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    BookOpenIcon,
    DatabaseIcon,
    LayoutDashboardIcon,
    LogOutIcon,
    UserIcon,
    ChevronDownIcon,
    SettingsIcon,
    HelpCircleIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/UserAvatar";
import { usePreferences } from "@/hooks/usePreferences";
import ModeToggle from "@/components/ModeToggle";

type UserRole = "student" | "teacher" | null;

function readSessionFromCookies(): { role: UserRole; userId: string | null } {
    if (typeof document === "undefined") return { role: null, userId: null };
    const cookies = document.cookie || "";
    const get = (name: string) => {
        const c = cookies.split("; ").find((x) => x.startsWith(name + "="));
        return c ? decodeURIComponent(c.split("=")[1] || "") : null;
    };
    const rawRole = get("user_role");
    const role =
        rawRole === "student" || rawRole === "teacher" ? rawRole : null;
    return { role, userId: get("user_id") };
}

function NavLink({
    href,
    icon,
    label,
    active,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    active: boolean;
}) {
    return (
        <Link
            href={href}
            className={cn(
                "relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                active
                    ? "bg-sky-100 text-sky-700 dark:bg-accent dark:text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
        >
            {icon}
            <span className="hidden lg:inline">{label}</span>
            {active && (
                <span className="absolute -bottom-[1px] left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-sky-600 dark:bg-sky-400" />
            )}
        </Link>
    );
}

function UserDropdown({
    role,
    userId,
    displayName,
    colorId,
    onLogout,
}: {
    role: UserRole;
    userId: string | null;
    displayName?: string;
    colorId?: string;
    onLogout: () => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const label = displayName || (role === "teacher" ? "Učiteľ" : "Študent");

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 pl-1.5 pr-2.5 py-1 text-sm font-medium text-foreground transition hover:bg-muted"
            >
                <UserAvatar
                    role={role}
                    colorId={colorId as Parameters<typeof UserAvatar>[0]["colorId"]}
                    displayName={displayName}
                    size="xs"
                />
                <span className="hidden lg:inline max-w-[96px] truncate">{label}</span>
                <ChevronDownIcon
                    className={cn(
                        "h-3.5 w-3.5 text-muted-foreground transition-transform",
                        open && "rotate-180"
                    )}
                />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-border bg-card shadow-xl dark:shadow-2xl z-50">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                        <UserAvatar
                            role={role}
                            colorId={colorId as Parameters<typeof UserAvatar>[0]["colorId"]}
                            displayName={displayName}
                            size="md"
                        />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{label}</p>
                            <p className="text-xs text-muted-foreground">
                                {role === "teacher" ? "Učiteľ" : "Študent"}
                            </p>
                        </div>
                    </div>

                    {/* Links */}
                    <div className="p-2">
                        <Link
                            href="/profile"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition"
                        >
                            <UserIcon className="h-4 w-4" />
                            Môj profil
                        </Link>
                        <Link
                            href="/settings"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition"
                        >
                            <SettingsIcon className="h-4 w-4" />
                            Nastavenia
                        </Link>
                        <Link
                            href="/help"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition"
                        >
                            <HelpCircleIcon className="h-4 w-4" />
                            Pomoc
                        </Link>

                        <div className="my-1.5 border-t border-border" />

                        <button
                            type="button"
                            onClick={() => { setOpen(false); onLogout(); }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition"
                        >
                            <LogOutIcon className="h-4 w-4" />
                            Odhlásiť sa
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function DesktopNavbar() {
    const [role, setRole] = useState<UserRole>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const pathname = usePathname();
    const router = useRouter();
    const { prefs, loaded } = usePreferences();

    useEffect(() => {
        const { role: r, userId: uid } = readSessionFromCookies();
        setRole(r);
        setUserId(uid);
    }, [pathname]);

    async function handleLogout() {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch {
            // ignore
        } finally {
            setRole(null);
            setUserId(null);
            router.push("/");
            router.refresh();
        }
    }

    const isActive = (href: string) =>
        href === "/" ? pathname === "/" : pathname.startsWith(href);

    const coursesHref =
        role === "teacher" ? "/teacher/courses" : "/student/courses";

    // avoid hydration mismatch — don't render pref-dependent UI until loaded
    const avatarColorId = loaded ? prefs.avatarColorId : "sky";
    const displayName = loaded ? prefs.displayName : "";

    return (
        <div className="hidden md:flex items-center gap-1">
            {role === "student" && (
                <NavLink
                    href="/student"
                    icon={<LayoutDashboardIcon className="h-4 w-4" />}
                    label="Dashboard"
                    active={
                        isActive("/student") &&
                        !pathname.startsWith("/student/courses") &&
                        !pathname.startsWith("/student/ais")
                    }
                />
            )}

            {role !== null && (
                <NavLink
                    href={coursesHref}
                    icon={<BookOpenIcon className="h-4 w-4" />}
                    label="Kurzy"
                    active={
                        isActive("/student/courses") || isActive("/teacher/courses")
                    }
                />
            )}

            {role === "student" && (
                <NavLink
                    href="/student/ais"
                    icon={<DatabaseIcon className="h-4 w-4" />}
                    label="AIS"
                    active={isActive("/student/ais")}
                />
            )}

            <ModeToggle />
            <div className="mx-2 h-5 w-px bg-border" />

            {role !== null ? (
                <UserDropdown
                    role={role}
                    userId={userId}
                    displayName={displayName || undefined}
                    colorId={avatarColorId}
                    onLogout={handleLogout}
                />
            ) : (
                <div className="flex items-center gap-2">
                    <Link
                        href="/auth/login"
                        className="rounded-xl px-4 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                    >
                        Prihlásenie
                    </Link>
                    <Link
                        href="/auth/register"
                        className="rounded-xl bg-foreground px-4 py-1.5 text-sm font-semibold text-background transition hover:bg-foreground/90"
                    >
                        Registrácia
                    </Link>
                </div>
            )}
        </div>
    );
}

export default DesktopNavbar;

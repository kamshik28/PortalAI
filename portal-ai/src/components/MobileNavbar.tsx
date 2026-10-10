// src/components/MobileNavbar.tsx
"use client";

import {
    BookOpenIcon,
    DatabaseIcon,
    HelpCircleIcon,
    LayoutDashboardIcon,
    LogOutIcon,
    MenuIcon,
    SettingsIcon,
    UserIcon,
} from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/UserAvatar";
import { usePreferences } from "@/hooks/usePreferences";

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

function MobileNavLink({
    href,
    icon,
    label,
    active,
    onClick,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick?: () => void;
}) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                    ? "bg-sky-100 text-sky-700 dark:bg-accent dark:text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
        >
            {icon}
            {label}
        </Link>
    );
}

function MobileNavbar() {
    const [showMenu, setShowMenu] = useState(false);
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
            setShowMenu(false);
            router.push("/");
            router.refresh();
        }
    }

    const isActive = (href: string) =>
        href === "/" ? pathname === "/" : pathname.startsWith(href);

    const coursesHref =
        role === "teacher" ? "/teacher/courses" : "/student/courses";

    const avatarColorId = loaded ? prefs.avatarColorId : "sky";
    const displayName = loaded ? prefs.displayName : "";
    const label = displayName || (role === "teacher" ? "Učiteľ" : role === "student" ? "Študent" : null);

    return (
        <div className="flex md:hidden items-center gap-2">
            <Sheet open={showMenu} onOpenChange={setShowMenu}>
                <SheetTrigger asChild>
                    <button
                        type="button"
                        className="flex items-center justify-center h-9 w-9 rounded-xl border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    >
                        <MenuIcon className="h-4 w-4" />
                        <span className="sr-only">Menu</span>
                    </button>
                </SheetTrigger>

                <SheetContent
                    side="right"
                    className="w-[280px] border-l border-border bg-background p-0"
                >
                    <SheetHeader className="border-b border-border px-5 py-4">
                        <SheetTitle className="text-left text-base font-bold text-foreground">
                            Portal<span className="text-sky-400">AI</span>
                        </SheetTitle>
                    </SheetHeader>

                    {/* User info */}
                    {role && (
                        <div className="border-b border-border px-5 py-4">
                            <div className="flex items-center gap-3">
                                <UserAvatar
                                    role={role}
                                    colorId={avatarColorId}
                                    displayName={displayName || undefined}
                                    size="md"
                                />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {label}
                                    </p>
                                    {userId && (
                                        <p className="text-xs text-neutral-500 font-mono truncate max-w-[160px]">
                                            {userId.slice(0, 16)}…
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <nav className="flex flex-col gap-1 p-3">
                        {role === "student" && (
                            <MobileNavLink
                                href="/student"
                                icon={<LayoutDashboardIcon className="h-4 w-4" />}
                                label="Dashboard"
                                active={
                                    isActive("/student") &&
                                    !pathname.startsWith("/student/courses") &&
                                    !pathname.startsWith("/student/ais")
                                }
                                onClick={() => setShowMenu(false)}
                            />
                        )}

                        {role !== null && (
                            <MobileNavLink
                                href={coursesHref}
                                icon={<BookOpenIcon className="h-4 w-4" />}
                                label="Kurzy"
                                active={
                                    isActive("/student/courses") ||
                                    isActive("/teacher/courses")
                                }
                                onClick={() => setShowMenu(false)}
                            />
                        )}

                        {role === "student" && (
                            <MobileNavLink
                                href="/student/ais"
                                icon={<DatabaseIcon className="h-4 w-4" />}
                                label="AIS"
                                active={isActive("/student/ais")}
                                onClick={() => setShowMenu(false)}
                            />
                        )}

                        {role !== null && (
                            <>
                                <div className="my-1 border-t border-border" />
                                <MobileNavLink
                                    href="/profile"
                                    icon={<UserIcon className="h-4 w-4" />}
                                    label="Môj profil"
                                    active={isActive("/profile")}
                                    onClick={() => setShowMenu(false)}
                                />
                                <MobileNavLink
                                    href="/settings"
                                    icon={<SettingsIcon className="h-4 w-4" />}
                                    label="Nastavenia"
                                    active={isActive("/settings")}
                                    onClick={() => setShowMenu(false)}
                                />
                            </>
                        )}

                        <MobileNavLink
                            href="/help"
                            icon={<HelpCircleIcon className="h-4 w-4" />}
                            label="Pomoc"
                            active={isActive("/help")}
                            onClick={() => setShowMenu(false)}
                        />
                    </nav>

                    {/* Bottom actions */}
                    <div className="absolute bottom-0 left-0 right-0 border-t border-border p-3">
                        {role ? (
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition"
                            >
                                <LogOutIcon className="h-4 w-4" />
                                Odhlásiť sa
                            </button>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <Link
                                    href="/auth/login"
                                    onClick={() => setShowMenu(false)}
                                    className="flex items-center justify-center rounded-xl border border-border bg-muted/50 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition"
                                >
                                    Prihlásenie
                                </Link>
                                <Link
                                    href="/auth/register"
                                    onClick={() => setShowMenu(false)}
                                    className="flex items-center justify-center rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition"
                                >
                                    Registrácia
                                </Link>
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

export default MobileNavbar;

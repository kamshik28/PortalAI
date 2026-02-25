// src/components/MobileNavbar.tsx


"use client";

import {
    BellIcon,
    HomeIcon,
    MenuIcon,
    MoonIcon,
    SunIcon,
    ChartBarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

function MobileNavbar() {
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const { theme, setTheme } = useTheme();
    const pathname = usePathname();

    useEffect(() => {
        if (typeof document !== "undefined") {
            const hasToken = document.cookie.includes("access_token=");
            setIsLoggedIn(hasToken);
        }
    }, [pathname]);

    return (
        <div className="flex md:hidden items-center space-x-2">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="mr-2"
            >
                <SunIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <MoonIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
            </Button>

            <Sheet open={showMobileMenu} onOpenChange={setShowMobileMenu}>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <MenuIcon className="h-5 w-5" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px]">
                    <SheetHeader>
                        <SheetTitle>Menu</SheetTitle>
                    </SheetHeader>

                    <nav className="flex flex-col space-y-4 mt-6">
                        <Button
                            variant="ghost"
                            className="flex items-center gap-3 justify-start"
                            asChild
                        >
                            <Link href="/">
                                <HomeIcon className="w-4 h-4" />
                                Home
                            </Link>
                        </Button>

                        <Button
                            variant="ghost"
                            className="flex items-center gap-3 justify-start"
                            asChild
                        >
                            <Link href="/notifications">
                                <BellIcon className="w-4 h-4" />
                                Notifications
                            </Link>
                        </Button>

                        <Button
                            variant="ghost"
                            className="flex items-center gap-3 justify-start"
                            asChild
                        >
                            <Link href="/ui/completion">
                                <ChartBarIcon className="w-4 h-4" />
                                Chat
                            </Link>
                        </Button>

                        {isLoggedIn ? (
                            <span className="text-sm text-muted-foreground">
                Prihlaseny
              </span>
                        ) : (
                            <>
                                <Button variant="outline" className="w-full" asChild>
                                    <Link href="/auth/login">Login</Link>
                                </Button>
                                <Button variant="default" className="w-full" asChild>
                                    <Link href="/auth/register">Register</Link>
                                </Button>
                            </>
                        )}
                    </nav>
                </SheetContent>
            </Sheet>
        </div>
    );
}

export default MobileNavbar;

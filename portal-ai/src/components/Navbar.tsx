// src/components/Navbar.tsx
import Link from "next/link";
import DesktopNavbar from "./DesktopNavbar";
import MobileNavbar from "@/components/MobileNavbar";

function Navbar() {
    return (
        <nav className="sticky top-0 z-50 w-full border-b border-border shadow-sm bg-white backdrop-blur-xl supports-[backdrop-filter]:bg-white/90 dark:shadow-none dark:bg-background/80 dark:supports-[backdrop-filter]:bg-background/60">
            <div className="max-w-5xl mx-auto px-4 sm:px-6">
                <div className="flex h-14 items-center justify-between">
                    {/* Logo */}
                    <Link
                        href="/"
                        className="flex items-center gap-2.5 group"
                    >
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/10 ring-1 ring-foreground/15 transition group-hover:bg-foreground/15">
                            <span className="text-[10px] font-black text-foreground tracking-tight">AI</span>
                        </div>
                        <span className="text-sm font-bold text-foreground tracking-wide">
                            Portal<span className="text-sky-400">AI</span>
                        </span>
                    </Link>

                    <DesktopNavbar />
                    <MobileNavbar />
                </div>
            </div>
        </nav>
    );
}

export default Navbar;

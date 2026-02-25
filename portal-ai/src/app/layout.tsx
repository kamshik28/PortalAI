import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
    title: "PortalAI",
    description: "Student portal with AI assistant",
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html
            lang="en"
            suppressHydrationWarning
            className={`${GeistSans.variable} ${GeistMono.variable}`}
        >
        <body className="antialiased">
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            {/* ✅ Global background (full screen) */}
            <div className="min-h-screen bg-[#07090c] text-white relative overflow-x-hidden">
                {/* glow blobs */}
                <div className="pointer-events-none fixed inset-0 -z-10">
                    <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-sky-500/15 blur-3xl" />
                    <div className="absolute top-40 left-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
                    <div className="absolute bottom-24 right-24 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
                </div>

                {/* subtle overlay to make it richer */}
                <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-white/5 via-transparent to-transparent" />

                <Navbar />

                {/* Your existing layout */}
                <main className="py-8">
                    <div className="max-w-7xl mx-auto px-4">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            <div className="hidden lg:block lg:col-span-2"></div>
                            <div className="lg:col-span-9">{children}</div>
                        </div>
                    </div>
                </main>
            </div>

            <Toaster />
        </ThemeProvider>
        </body>
        </html>
    );
}

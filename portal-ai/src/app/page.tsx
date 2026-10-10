// src/app/page.tsx
import Link from "next/link";
import { getSessionFromCookies } from "@/lib/auth";
import {
    ArrowRightIcon,
    BookOpenIcon,
    BotIcon,
    DatabaseIcon,
    GraduationCapIcon,
    LayoutDashboardIcon,
    ShieldCheckIcon,
    SparklesIcon,
    UploadIcon,
    UsersIcon,
    ZapIcon,
} from "lucide-react";

type UserRole = "student" | "teacher";

function FeaturePill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
            {children}
        </span>
    );
}

function FeatureBlock({
    icon,
    title,
    desc,
}: {
    icon: React.ReactNode;
    title: string;
    desc: string;
}) {
    return (
        <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/8 text-neutral-300">
                {icon}
            </div>
            <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-400">{desc}</p>
            </div>
        </div>
    );
}

function DashCard({
    href,
    icon,
    label,
    desc,
    accent,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    desc: string;
    accent: string;
}) {
    return (
        <Link
            href={href}
            className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/8 hover:border-white/15"
        >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:opacity-90 ${accent}`}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="mt-0.5 text-sm text-neutral-400">{desc}</p>
            </div>
            <ArrowRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600 transition group-hover:text-neutral-400 group-hover:translate-x-0.5" />
        </Link>
    );
}

export default async function HomePage() {
    const session = await getSessionFromCookies();
    const isLoggedIn = session.isLoggedIn;
    const role = (session.role ?? "student") as UserRole;
    const userId = session.userId;

    const coursesHref = role === "teacher" ? "/teacher/courses" : "/student/courses";
    const dashboardHref = role === "teacher" ? "/teacher/courses" : "/student";

    if (isLoggedIn) {
        // ── Logged-in landing ─────────────────────────────────────────────
        return (
            <div className="space-y-10">
                {/* Hero */}
                <div className="rounded-3xl border border-white/8 bg-white/3 px-6 py-8 sm:px-8">
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className={`pill ${role === "teacher" ? "pill-violet" : "pill-blue"}`}>
                                    {role === "teacher" ? "Učiteľ" : "Študent"}
                                </span>
                                <span className="pill pill-green">Prihlásený</span>
                            </div>
                            <h1 className="text-3xl font-extrabold tracking-tight text-white">
                                Vitaj v PortalAI.
                            </h1>
                            <p className="mt-3 max-w-md text-base leading-relaxed text-neutral-300">
                                {role === "student"
                                    ? "Prístup ku kurzom, materiálom a AI asistentovi pre štúdium."
                                    : "Správa kurzov, materiálov, študentov a AI chatu."}
                            </p>
                            <div className="mt-5 flex flex-wrap gap-3">
                                <Link href={dashboardHref} className="btn-primary">
                                    {role === "student" ? (
                                        <><LayoutDashboardIcon className="h-4 w-4" />Dashboard</>
                                    ) : (
                                        <><BookOpenIcon className="h-4 w-4" />Moje kurzy</>
                                    )}
                                </Link>
                                <Link href={coursesHref} className="btn-ghost">
                                    <BookOpenIcon className="h-4 w-4" />
                                    {role === "student" ? "Kurzy" : "Správa kurzov"}
                                </Link>
                                <Link href="/ui/completion" className="btn-ghost">
                                    <BotIcon className="h-4 w-4" />
                                    Chat
                                </Link>
                            </div>
                        </div>

                        {/* Mini account card */}
                        <div className="shrink-0 rounded-2xl border border-white/10 bg-black/20 p-5 min-w-[180px]">
                            <p className="text-xs text-neutral-500 mb-1">Účet</p>
                            <p className="text-base font-bold text-white">
                                {role === "teacher" ? "Učiteľ" : "Študent"}
                            </p>
                            {userId && (
                                <p className="mt-1 font-mono text-[10px] text-neutral-600 truncate max-w-[160px]">
                                    {userId}
                                </p>
                            )}
                            <div className="mt-4 space-y-1.5">
                                <Link href="/profile" className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition">
                                    <ZapIcon className="h-3 w-3" /> Môj profil
                                </Link>
                                <Link href="/settings" className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition">
                                    <SparklesIcon className="h-3 w-3" /> Nastavenia
                                </Link>
                                <Link href="/help" className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition">
                                    <ShieldCheckIcon className="h-3 w-3" /> Pomoc
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick nav */}
                <div>
                    <h2 className="mb-4 text-sm font-semibold text-neutral-400 uppercase tracking-wider">
                        Rýchla navigácia
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {role === "student" && (
                            <DashCard
                                href="/student"
                                icon={<LayoutDashboardIcon className="h-5 w-5" />}
                                label="Dashboard"
                                desc="Prehľad kurzov, akcie a štatistiky"
                                accent="bg-sky-500/15 text-sky-300"
                            />
                        )}
                        <DashCard
                            href={coursesHref}
                            icon={<BookOpenIcon className="h-5 w-5" />}
                            label={role === "teacher" ? "Moje kurzy" : "Kurzy"}
                            desc={role === "teacher" ? "Správa kurzov a materiálov" : "Všetky priradené predmety"}
                            accent="bg-violet-500/15 text-violet-300"
                        />
                        <DashCard
                            href="/ui/completion"
                            icon={<BotIcon className="h-5 w-5" />}
                            label="Všeobecný chat"
                            desc="AI asistent bez väzby na kurz"
                            accent="bg-emerald-500/15 text-emerald-300"
                        />
                        {role === "student" && (
                            <DashCard
                                href="/student/ais"
                                icon={<DatabaseIcon className="h-5 w-5" />}
                                label="AIS synchronizácia"
                                desc="Prepoj AIS a stiahni materiály"
                                accent="bg-amber-500/15 text-amber-300"
                            />
                        )}
                        <DashCard
                            href="/profile"
                            icon={<GraduationCapIcon className="h-5 w-5" />}
                            label="Profil"
                            desc="Informácie o účte a nastavenia"
                            accent="bg-rose-500/15 text-rose-300"
                        />
                        <DashCard
                            href="/help"
                            icon={<ShieldCheckIcon className="h-5 w-5" />}
                            label="Pomoc"
                            desc="Funkcie, skratky a FAQ"
                            accent="bg-neutral-500/15 text-neutral-300"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-6 text-xs text-neutral-600">
                    <span>© {new Date().getFullYear()} PortalAI</span>
                    <div className="flex items-center gap-4">
                        <Link href="/help" className="hover:text-neutral-400 transition">Pomoc</Link>
                        <Link href="/settings" className="hover:text-neutral-400 transition">Nastavenia</Link>
                    </div>
                </div>
            </div>
        );
    }

    // ── Guest landing ─────────────────────────────────────────────────────────
    return (
        <div className="space-y-16">
            {/* Hero */}
            <div className="mt-8 text-center space-y-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/8 ring-1 ring-white/15">
                    <span className="text-xl font-black text-white tracking-tight">AI</span>
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                    Portal<span className="text-sky-400">AI</span>
                </h1>
                <p className="mx-auto max-w-lg text-base leading-relaxed text-neutral-300">
                    Študentský portál s AI asistentom. Kurzy, materiály a inteligentný chat
                    natrénovaný na obsahu predmetov.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <Link href="/auth/register" className="btn-primary">
                        Začať zadarmo
                        <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                    <Link href="/auth/login" className="btn-ghost">
                        Mám účet
                    </Link>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                    <FeaturePill><BookOpenIcon className="h-3 w-3" />Kurzy</FeaturePill>
                    <FeaturePill><BotIcon className="h-3 w-3" />AI chat</FeaturePill>
                    <FeaturePill><UploadIcon className="h-3 w-3" />PDF materiály</FeaturePill>
                    <FeaturePill><UsersIcon className="h-3 w-3" />Správa študentov</FeaturePill>
                    <FeaturePill><DatabaseIcon className="h-3 w-3" />AIS sync</FeaturePill>
                </div>
            </div>

            {/* Features */}
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {[
                    {
                        icon: <BookOpenIcon className="h-5 w-5" />,
                        title: "Kurzy a materiály",
                        desc: "Učitelia vytvárajú kurzy, nahrávajú PDF prednášky a cvičenia. Študenti majú všetko na jednom mieste.",
                    },
                    {
                        icon: <BotIcon className="h-5 w-5" />,
                        title: "AI asistent pre každý kurz",
                        desc: "Každý kurz má vlastného AI chatbota natrénovaného na nahraných materiáloch. Pýtaj sa priamo.",
                    },
                    {
                        icon: <DatabaseIcon className="h-5 w-5" />,
                        title: "AIS synchronizácia",
                        desc: "Prepoj svoju AIS session a AI automaticky načíta obsah predmetov.",
                    },
                    {
                        icon: <UsersIcon className="h-5 w-5" />,
                        title: "Správa tried",
                        desc: "Učiteľ pridáva / odstraňuje študentov podľa emailu. Jednoduchý správca kurzov.",
                    },
                    {
                        icon: <ZapIcon className="h-5 w-5" />,
                        title: "Pripnuté kurzy a história",
                        desc: "Rýchly prístup k nedávno navštíveným predmetom a možnosť pripnutia obľúbených kurzov.",
                    },
                    {
                        icon: <SparklesIcon className="h-5 w-5" />,
                        title: "Personalizácia",
                        desc: "Nastav si zobrazované meno, farbu avatara, preferovaný pohľad a ďalšie komfortné funkcie.",
                    },
                ].map((f, i) => (
                    <FeatureBlock key={i} {...f} />
                ))}
            </div>

            {/* CTA */}
            <div className="rounded-3xl border border-white/8 bg-white/3 px-6 py-10 text-center space-y-4">
                <h2 className="text-2xl font-bold text-white">Začni hneď</h2>
                <p className="text-neutral-400 max-w-md mx-auto text-sm">
                    Registrácia je okamžitá. Môžeš sa zaregistrovať ako študent alebo učiteľ.
                </p>
                <div className="flex justify-center gap-3">
                    <Link href="/auth/register" className="btn-primary">
                        Vytvoriť účet
                        <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                    <Link href="/auth/login" className="btn-ghost">Prihlásenie</Link>
                </div>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-6 text-xs text-neutral-600">
                <span>© {new Date().getFullYear()} PortalAI</span>
                <div className="flex items-center gap-4">
                    <Link href="/help" className="hover:text-neutral-400 transition">Pomoc</Link>
                    <Link href="/auth/login" className="hover:text-neutral-400 transition">Prihlásenie</Link>
                </div>
            </div>
        </div>
    );
}

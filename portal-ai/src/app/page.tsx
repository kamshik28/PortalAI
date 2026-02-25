import Link from "next/link";
import { cookies } from "next/headers";

type UserRole = "student" | "teacher";

function extractUserIdFromToken(token: string): string | null {
    if (!token.startsWith("local_")) return null;
    const rest = token.slice("local_".length);
    const idx = rest.indexOf("_");
    return idx === -1 ? rest : rest.slice(0, idx);
}

function safeRole(v: string | undefined): UserRole | null {
    return v === "student" || v === "teacher" ? v : null;
}

function Pill({
                  children,
                  tone = "neutral",
              }: {
    children: React.ReactNode;
    tone?: "neutral" | "green" | "blue" | "amber";
}) {
    const cls =
        tone === "green"
            ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
            : tone === "blue"
                ? "bg-sky-500/15 text-sky-200 ring-sky-500/30"
                : tone === "amber"
                    ? "bg-amber-500/15 text-amber-200 ring-amber-500/30"
                    : "bg-white/10 text-neutral-200 ring-white/15";

    return (
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ring-1 ${cls}`}>
      {children}
    </span>
    );
}

function Card({
                  title,
                  desc,
                  footer,
              }: {
    title: string;
    desc: string;
    footer?: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="space-y-2">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-sm leading-relaxed text-neutral-300">{desc}</p>
            </div>
            {footer ? <div className="mt-4">{footer}</div> : null}
        </div>
    );
}

function ButtonLink({
                        href,
                        children,
                        variant = "primary",
                        disabled = false,
                    }: {
    href: string;
    children: React.ReactNode;
    variant?: "primary" | "secondary";
    disabled?: boolean;
}) {
    const base =
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition";
    const primary =
        "bg-white text-black hover:opacity-90";
    const secondary =
        "border border-white/15 bg-white/5 text-white hover:bg-white/10";

    const cls = `${base} ${variant === "primary" ? primary : secondary} ${
        disabled ? "pointer-events-none opacity-40" : ""
    }`;

    return <Link className={cls} href={href}>{children}</Link>;
}

export default async function HomePage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("access_token")?.value ?? "";
    const roleCookie = cookieStore.get("user_role")?.value;

    const isLoggedIn = Boolean(token);
    const role = safeRole(roleCookie) ?? "student";
    const userId = isLoggedIn ? extractUserIdFromToken(token) : null;

    const coursesHref = role === "teacher" ? "/teacher/courses" : "/student/courses";

    return (
        <main className="min-h-screen w-full overflow-x-hidden bg-[#07090c] text-white">
            {/* Background glow */}
            <div className="pointer-events-none fixed inset-0 -z-10">                <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-sky-500/15 blur-3xl" />
                <div className="absolute top-40 left-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="absolute bottom-24 right-24 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
            </div>

            <div className="relative mx-auto max-w-6xl px-6 py-10">
                {/* Top bar */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                            <span className="text-sm font-black">AI</span>
                        </div>
                        <div>
                            <p className="text-lg font-bold leading-tight">PortalAI</p>
                            <p className="text-xs text-neutral-400">študentský portál + RAG chat</p>
                        </div>
                    </div>

                    {isLoggedIn ? (
                        <div className="flex items-center gap-2">
                            <Pill tone="green">Prihlásený</Pill>

                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Pill tone="amber">Hosť</Pill>

                        </div>
                    )}
                </div>

                {/* Hero */}
                <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-center">
                    <div className="space-y-4">
                        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                            {isLoggedIn ? "Vitaj späť." : "Vitaj v PortalAI."}
                        </h1>

                        <p className="text-sm leading-relaxed text-neutral-300">
                            {isLoggedIn
                                ? "Rýchly prehľad: kurzy, materiály a chat pre konkrétny predmet."
                                : "Prihlás sa a uvidíš svoje kurzy, nahrané PDF materiály a AI chat so zdrojmi z Qdrant."}
                        </p>


                        <div className="mt-3 flex flex-wrap gap-3">
                            <ButtonLink href={coursesHref} variant="primary" disabled={!isLoggedIn}>
                                Moje kurzy
                            </ButtonLink>
                            <ButtonLink href="/ui/completion" variant="secondary">
                                Otvoriť chat
                            </ButtonLink>

                        </div>

                        {!isLoggedIn && (
                            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-neutral-300">
                                <span className="font-semibold text-white">Tip:</span>{" "}
                                po prihlásení sa ti odomknú kurzy a upload PDF (pre učiteľa).
                                Chat môžeš otvoriť aj ako hosť, але без повного контексту.
                            </div>
                        )}
                    </div>

                    {/* Profile panel */}
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-neutral-400">Profil</p>
                                <p className="mt-1 text-lg font-bold text-white">
                                    {isLoggedIn ? "Prihlásený používateľ" : "Hosť"}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Pill>{role}</Pill>
                                {userId ? <Pill tone="blue">id: {userId}</Pill> : <Pill>id: —</Pill>}
                            </div>
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                            <Card
                                title="Kurzy"
                                desc="Prehľad kurzov, študenti, enrollments."
                                footer={
                                    <ButtonLink href={coursesHref} variant="secondary" disabled={!isLoggedIn}>
                                        Prejsť
                                    </ButtonLink>
                                }
                            />
                            <Card
                                title="Materiály (PDF)"
                                desc="Upload → Supabase Storage → index do Qdrant."
                                footer={
                                    <ButtonLink
                                        href={role === "teacher" ? "/teacher/materials" : "/student/materials"}
                                        variant="secondary"
                                        disabled={!isLoggedIn}
                                    >
                                        Otvoriť
                                    </ButtonLink>
                                }
                            />


                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-neutral-400">
                    <span>© {new Date().getFullYear()} PortalAI</span>
                    <span className="opacity-80">
            {isLoggedIn ? "Session aktívna (cookie token)" : "Nie si prihlásený"}
          </span>
                </div>
            </div>
        </main>
    );
}

// src/app/help/page.tsx
import { PageHeader } from "@/components/PageHeader";
import {
    BookOpenIcon,
    BotIcon,
    DatabaseIcon,
    GraduationCapIcon,
    KeyboardIcon,
    LayoutDashboardIcon,
    ShieldCheckIcon,
    UploadIcon,
    UsersIcon,
    ZapIcon,
} from "lucide-react";
import Link from "next/link";

function FeatureCard({
    icon,
    title,
    description,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-4 rounded-2xl border border-white/8 bg-white/3 p-5">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/8 text-neutral-300">
                {icon}
            </div>
            <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-400">{description}</p>
            </div>
        </div>
    );
}

function Kbd({ children }: { children: string }) {
    return (
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-white/15 bg-white/8 px-1 font-mono text-[11px] text-neutral-300">
            {children}
        </span>
    );
}

const SHORTCUTS = [
    { keys: ["?"],       desc: "Zobraziť klávesové skratky" },
    { keys: ["G", "H"],  desc: "Prejsť na domovskú stránku" },
    { keys: ["G", "C"],  desc: "Prejsť na kurzy" },
    { keys: ["G", "P"],  desc: "Prejsť na profil" },
    { keys: ["G", "S"],  desc: "Prejsť na nastavenia" },
    { keys: ["/"],       desc: "Aktivovať vyhľadávanie na stránke" },
    { keys: ["Esc"],     desc: "Zavrieť dialog / vyhľadávanie" },
];

export default function HelpPage() {
    return (
        <div className="space-y-10">
            <PageHeader
                title="Pomoc"
                subtitle="Prehľad funkcií, klávesových skratiek a tipy pre používanie PortalAI."
                breadcrumbs={[{ label: "Pomoc" }]}
            />

            {/* ── Features ── */}
            <section>
                <h2 className="mb-4 text-base font-semibold text-white">Funkcie platformy</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    <FeatureCard
                        icon={<BookOpenIcon className="h-4 w-4" />}
                        title="Kurzy"
                        description="Prezeraj si kurzy, ku ktorým máš prístup ako študent, alebo spravuj vlastné kurzy ako učiteľ."
                    />
                    <FeatureCard
                        icon={<BotIcon className="h-4 w-4" />}
                        title="AI chat"
                        description="Každý kurz má vlastného AI asistenta s kontextom z nahratých PDF materiálov."
                    />
                    <FeatureCard
                        icon={<UploadIcon className="h-4 w-4" />}
                        title="Nahrávanie materiálov"
                        description="Učiteľ môže nahrávať PDF súbory pre každý slot (Prednáška / Cvičenie × 1–12)."
                    />
                    <FeatureCard
                        icon={<UsersIcon className="h-4 w-4" />}
                        title="Správa študentov"
                        description="Učiteľ pridáva / odstraňuje študentov z kurzu podľa emailovej adresy."
                    />
                    <FeatureCard
                        icon={<DatabaseIcon className="h-4 w-4" />}
                        title="AIS synchronizácia"
                        description="Študenti môžu prepojiť svoju AIS session a stiahnuté materiály predmetov sú dostupné v AI chate."
                    />
                    <FeatureCard
                        icon={<GraduationCapIcon className="h-4 w-4" />}
                        title="Dashboard"
                        description="Rýchly prehľad kurzov, stavu a nedávno navštívených predmetov."
                    />
                    <FeatureCard
                        icon={<ZapIcon className="h-4 w-4" />}
                        title="Pripnuté kurzy"
                        description="Kurzy môžeš pripnúť hore na zoznam pomocou ikony kolíka na karte kurzu."
                    />
                    <FeatureCard
                        icon={<ShieldCheckIcon className="h-4 w-4" />}
                        title="Nastavenia & profil"
                        description="Nastav si zobrazované meno, farbu avatara a preferovaný pohľad na zoznamy."
                    />
                </div>
            </section>

            {/* ── Keyboard shortcuts ── */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <KeyboardIcon className="h-4 w-4 text-neutral-400" />
                    <h2 className="text-base font-semibold text-white">Klávesové skratky</h2>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                    {SHORTCUTS.map((s, i) => (
                        <div
                            key={i}
                            className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? "border-t border-white/6" : ""}`}
                        >
                            <span className="text-sm text-neutral-300">{s.desc}</span>
                            <div className="flex items-center gap-1">
                                {s.keys.map((k, j) => (
                                    <span key={j} className="flex items-center gap-1">
                                        {j > 0 && (
                                            <span className="text-neutral-600 text-xs mx-0.5">
                                                then
                                            </span>
                                        )}
                                        <Kbd>{k}</Kbd>
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                    Skratky sú aktívne keď nie je fokus na žiadnom vstupnom poli. Kdekoľvek stlač{" "}
                    <Kbd>?</Kbd> pre zobrazenie tohto zoznamu.
                </p>
            </section>

            {/* ── FAQ / Tips ── */}
            <section>
                <h2 className="mb-4 text-base font-semibold text-white">Časté otázky</h2>
                <div className="space-y-3">
                    {[
                        {
                            q: "Kde sa ukladajú moje nastavenia?",
                            a: "Zobrazované meno, farba avatara, pripnuté kurzy a nedávno navštívené kurzy sú uložené lokálne v localStorage tvojho prehliadača. Neovplyvňujú iných používateľov ani server.",
                        },
                        {
                            q: "Prečo AI chat neodpovedá na moje otázky?",
                            a: "AI chat je naviazaný na materiály daného kurzu. Uisti sa, že učiteľ nahrál PDF materiály. Chat funguje iba ak je spustený Flowise server.",
                        },
                        {
                            q: "Ako si zmením zobrazované meno?",
                            a: "Prejdi na stránku Nastavenia (link v menu vpravo hore) a uprav pole Zobrazované meno.",
                        },
                        {
                            q: "Čo je AIS synchronizácia?",
                            a: "Ak si študent FIIT STU, môžeš prepojiť svoju AIS session. Systém stiahne obsah predmetov a sprístupní ho v AI chate.",
                        },
                    ].map(({ q, a }, i) => (
                        <details
                            key={i}
                            className="group rounded-2xl border border-white/10 bg-white/5"
                        >
                            <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-medium text-white list-none">
                                {q}
                                <span className="ml-4 shrink-0 text-neutral-500 transition group-open:rotate-180">▾</span>
                            </summary>
                            <div className="border-t border-white/8 px-5 py-4 text-sm leading-relaxed text-neutral-400">
                                {a}
                            </div>
                        </details>
                    ))}
                </div>
            </section>

            {/* ── Navigation ── */}
            <section className="flex flex-wrap gap-3">
                <Link href="/" className="btn-ghost">← Domov</Link>
                <Link href="/settings" className="btn-ghost">Nastavenia</Link>
                <Link href="/profile" className="btn-ghost">Profil</Link>
            </section>
        </div>
    );
}

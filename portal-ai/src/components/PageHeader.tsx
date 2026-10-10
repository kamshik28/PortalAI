// src/components/PageHeader.tsx
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    breadcrumbs?: BreadcrumbItem[];
    action?: ReactNode;
    badge?: ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumbs, action, badge }: PageHeaderProps) {
    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
            <div className="space-y-1">
                {breadcrumbs && breadcrumbs.length > 0 && (
                    <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                        {breadcrumbs.map((crumb, i) => (
                            <span key={i} className="flex items-center gap-1">
                                {i > 0 && <ChevronRightIcon className="h-3 w-3" />}
                                {crumb.href ? (
                                    <Link
                                        href={crumb.href}
                                        className="hover:text-foreground transition"
                                    >
                                        {crumb.label}
                                    </Link>
                                ) : (
                                    <span className="text-muted-foreground">{crumb.label}</span>
                                )}
                            </span>
                        ))}
                    </nav>
                )}

                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                    {badge}
                </div>

                {subtitle && (
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                )}
            </div>

            {action && (
                <div className="shrink-0">{action}</div>
            )}
        </div>
    );
}

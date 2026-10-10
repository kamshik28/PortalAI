// src/components/EmptyState.tsx
import type { ReactNode } from "react";
import { InboxIcon } from "lucide-react";

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-muted/30 px-6 py-14 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                {icon ?? <InboxIcon className="h-7 w-7" />}
            </div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {description && (
                <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{description}</p>
            )}
            {action && <div className="mt-6">{action}</div>}
        </div>
    );
}

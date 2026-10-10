// src/components/ConfirmDialog.tsx
"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { TriangleAlertIcon } from "lucide-react";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "default";
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "Potvrdiť",
    cancelLabel = "Zrušiť",
    variant = "danger",
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
            <DialogContent>
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        {variant === "danger" && (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 ring-1 ring-red-500/30">
                                <TriangleAlertIcon className="h-5 w-5 text-red-400" />
                            </div>
                        )}
                        <DialogTitle>{title}</DialogTitle>
                    </div>
                    {description && (
                        <DialogDescription className="mt-2">{description}</DialogDescription>
                    )}
                </DialogHeader>
                <DialogFooter className="mt-6">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="btn-ghost"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={variant === "danger" ? "btn-danger" : "btn-primary"}
                    >
                        {confirmLabel}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

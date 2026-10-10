// src/components/UserAvatar.tsx
"use client";

import { getAvatarColor, type AvatarColorId } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
    role?: "student" | "teacher" | null;
    colorId?: AvatarColorId;
    displayName?: string;
    size?: "xs" | "sm" | "md" | "lg";
    className?: string;
}

const sizeMap = {
    xs: "h-6 w-6 rounded-lg text-[10px]",
    sm: "h-7 w-7 rounded-lg text-[10px]",
    md: "h-8 w-8 rounded-xl text-xs",
    lg: "h-14 w-14 rounded-2xl text-xl",
};

export function UserAvatar({
    role,
    colorId = "sky",
    displayName,
    size = "md",
    className,
}: UserAvatarProps) {
    const color = getAvatarColor(colorId);

    const initials = displayName
        ? displayName
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
        : role === "teacher"
          ? "UČ"
          : "ŠT";

    return (
        <div
            className={cn(
                "flex shrink-0 items-center justify-center font-bold ring-1",
                color.bg,
                color.text,
                color.ring,
                sizeMap[size],
                className
            )}
        >
            {initials}
        </div>
    );
}

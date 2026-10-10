// src/hooks/usePreferences.ts
"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "portalai_prefs_v2";

// ─── Avatar colours ──────────────────────────────────────────────────────────
export const AVATAR_COLORS = [
    { id: "sky",     label: "Modrá",  bg: "bg-sky-500/20",     text: "text-sky-300",     ring: "ring-sky-500/30"     },
    { id: "violet",  label: "Fialová",bg: "bg-violet-500/20",  text: "text-violet-300",  ring: "ring-violet-500/30"  },
    { id: "emerald", label: "Zelená", bg: "bg-emerald-500/20", text: "text-emerald-300", ring: "ring-emerald-500/30" },
    { id: "amber",   label: "Zlatá",  bg: "bg-amber-500/20",   text: "text-amber-300",   ring: "ring-amber-500/30"   },
    { id: "rose",    label: "Ružová", bg: "bg-rose-500/20",    text: "text-rose-300",    ring: "ring-rose-500/30"    },
    { id: "indigo",  label: "Indigo", bg: "bg-indigo-500/20",  text: "text-indigo-300",  ring: "ring-indigo-500/30"  },
] as const;

export type AvatarColorId = (typeof AVATAR_COLORS)[number]["id"];

export function getAvatarColor(id: AvatarColorId) {
    return AVATAR_COLORS.find((c) => c.id === id) ?? AVATAR_COLORS[0];
}

// ─── Recent course entry ──────────────────────────────────────────────────────
export interface RecentCourse {
    id: string;
    name: string;
    code?: string | null;
    role: "student" | "teacher";
    visitedAt: number;
}

// ─── Preferences schema ───────────────────────────────────────────────────────
export interface Preferences {
    displayName: string;          // custom display name override
    avatarColorId: AvatarColorId; // avatar background colour
    pinnedCourses: string[];      // course IDs that are pinned
    recentCourses: RecentCourse[];// recently visited courses (max 8)
    viewMode: "grid" | "list";    // course list view mode
    compactMode: boolean;         // denser cards
    dismissedTips: string[];      // IDs of dismissed tip banners
    showWelcomeBanner: boolean;   // whether welcome banner is visible
}

const DEFAULT_PREFS: Preferences = {
    displayName: "",
    avatarColorId: "sky",
    pinnedCourses: [],
    recentCourses: [],
    viewMode: "grid",
    compactMode: false,
    dismissedTips: [],
    showWelcomeBanner: true,
};

function load(): Preferences {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_PREFS;
        return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Preferences>) };
    } catch {
        return DEFAULT_PREFS;
    }
}

function persist(prefs: Preferences) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // storage unavailable
    }
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function usePreferences() {
    const [prefs, setPrefsState] = useState<Preferences>(DEFAULT_PREFS);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        setPrefsState(load());
        setLoaded(true);
    }, []);

    const setPrefs = useCallback((update: Partial<Preferences>) => {
        setPrefsState((prev) => {
            const next = { ...prev, ...update };
            persist(next);
            return next;
        });
    }, []);

    /** Toggle pin state for a course ID */
    const togglePin = useCallback((courseId: string) => {
        setPrefsState((prev) => {
            const pinned = prev.pinnedCourses.includes(courseId)
                ? prev.pinnedCourses.filter((id) => id !== courseId)
                : [...prev.pinnedCourses, courseId];
            const next = { ...prev, pinnedCourses: pinned };
            persist(next);
            return next;
        });
    }, []);

    /** Record a course visit (keeps 8 most-recent, deduped) */
    const trackRecentCourse = useCallback(
        (entry: Omit<RecentCourse, "visitedAt">) => {
            setPrefsState((prev) => {
                const recent: RecentCourse = { ...entry, visitedAt: Date.now() };
                const filtered = prev.recentCourses.filter((c) => c.id !== entry.id);
                const next = { ...prev, recentCourses: [recent, ...filtered].slice(0, 8) };
                persist(next);
                return next;
            });
        },
        []
    );

    /** Dismiss a one-time tip banner by ID */
    const dismissTip = useCallback((tipId: string) => {
        setPrefsState((prev) => {
            if (prev.dismissedTips.includes(tipId)) return prev;
            const next = { ...prev, dismissedTips: [...prev.dismissedTips, tipId] };
            persist(next);
            return next;
        });
    }, []);

    /** Reset everything to defaults */
    const resetPrefs = useCallback(() => {
        setPrefsState(DEFAULT_PREFS);
        persist(DEFAULT_PREFS);
    }, []);

    return { prefs, setPrefs, togglePin, trackRecentCourse, dismissTip, resetPrefs, loaded };
}

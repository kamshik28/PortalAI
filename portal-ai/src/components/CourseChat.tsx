"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const FullPageChat = dynamic(
    () => import("flowise-embed-react").then((m) => m.FullPageChat),
    { ssr: false }
);

type UserRole = "student" | "teacher";

function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const cookies = document.cookie || "";
    const found = cookies.split("; ").find((c) => c.startsWith(`${name}=`));
    return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

// token: local_<userId>_<uuid>
function extractUserIdFromToken(token: string): string | null {
    if (!token.startsWith("local_")) return null;
    const rest = token.slice("local_".length);
    const idx = rest.indexOf("_");
    return idx === -1 ? rest : rest.slice(0, idx);
}

export default function CourseChat({ courseId }: { courseId: string }) {
    const [userRole, setUserRole] = useState<UserRole>("student");
    const [authToken, setAuthToken] = useState("");
    const [userId, setUserId] = useState("");

    useEffect(() => {
        const role = getCookie("user_role");
        if (role === "teacher" || role === "student") setUserRole(role);

        const token =
            typeof window !== "undefined"
                ? window.localStorage.getItem("access_token") ?? ""
                : "";

        if (token) {
            setAuthToken(token);
            const uid = extractUserIdFromToken(token);
            if (uid) setUserId(uid);
        }
    }, []);

    // ✅ ключ: окремий чат для кожного курсу
    const sessionId = useMemo(() => {
        const uid = userId || "anon";
        return `portal_${uid}_${courseId}`;
    }, [userId, courseId]);

    return (
        <div className="w-full">
            <FullPageChat
                chatflowid="fe844743-dd08-4086-b0b0-c3db50ef5026"
                apiHost="http://localhost:3000"
                chatflowConfig={{
                    sessionId, // ✅ найважливіше
                    vars: {
                        userRole,
                        authToken,
                        courseId, // ✅ щоб Flowise знав курс
                        userId,
                    },
                }}
                theme={{
                    chatWindow: {
                        showTitle: true,
                        title: "AI chat (kurz)",
                        height: 550,
                        width: 1000,
                        renderHTML: true,
                    },
                }}
            />
        </div>
    );
}

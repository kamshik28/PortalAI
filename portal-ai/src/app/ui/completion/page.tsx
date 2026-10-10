// src/app/ui/completion/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { logout } from "../../lib/logout";

const FullPageChat = dynamic(
    () => import("flowise-embed-react").then((m) => m.FullPageChat),
    { ssr: false }
);

type UserRole = "student" | "teacher";

type FlowiseMessage =
    | string
    | {
    message?: string;
    text?: string;
    data?: {
        text?: string;
    };
};

function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const cookies = document.cookie || "";
    const found = cookies.split("; ").find((c) => c.startsWith(`${name}=`));
    return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

export default function CompletionPage() {
    const [isReady, setIsReady] = useState(false);
    const [userRole, setUserRole] = useState<UserRole>("student");
    const [authToken, setAuthToken] = useState<string>("");
    const [userId, setUserId] = useState<string>("");

    useEffect(() => {
        if (typeof document === "undefined") return;

        const role = getCookie("user_role");
        const cookieUserId = getCookie("user_id") ?? "";

        if (role === "teacher" || role === "student") {
            setUserRole(role);
        }

        setUserId(cookieUserId);

        const tokenFromStorage =
            typeof window !== "undefined"
                ? window.localStorage.getItem("access_token")
                : null;

        if (tokenFromStorage) {
            setAuthToken(tokenFromStorage);
        }

        setIsReady(true);
    }, []);

    useEffect(() => {
        if (typeof document === "undefined") return;

        const interval = setInterval(() => {
            const cookies = document.cookie || "";
            const hasRole = cookies
                .split("; ")
                .some((c) => c.startsWith("user_role="));

            if (!hasRole) {
                try {
                    window.localStorage.removeItem("access_token");
                    window.localStorage.removeItem("refresh_token");
                } catch (e) {
                    console.warn("logout localStorage clear error", e);
                }

                window.location.href = "/auth/login";
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const sessionId = useMemo(() => {
        const uid = userId || "anon";
        return `portal_global_${userRole}_${uid}`;
    }, [userRole, userId]);

    if (!isReady) {
        return (
            <div className="w-screen h-screen flex items-center justify-center text-sm text-muted-foreground">
                Načítavam chat...
            </div>
        );
    }

    return (
        <div className="w-screen h-screen">
            <FullPageChat
                key={sessionId}
                chatflowid="fe844743-dd08-4086-b0b0-c3db50ef5026"
                apiHost="http://localhost:3000"
                chatflowConfig={{
                    sessionId,
                    vars: {
                        userRole,
                        authToken,
                        userId,
                    },
                }}
                observersConfig={{
                    observeMessages: (messages: FlowiseMessage[]) => {
                        console.log("FLOWISE MESSAGES:", messages);

                        if (!Array.isArray(messages) || messages.length === 0) {
                            return;
                        }

                        const hasLogoutToken = messages.some((m) => {
                            let text: string | undefined;

                            if (typeof m === "string") {
                                text = m;
                            } else {
                                text =
                                    m.message ??
                                    m.text ??
                                    m.data?.text;
                            }

                            return text?.trim() === "PORTAL_LOGOUT";
                        });

                        if (hasLogoutToken) {
                            void logout();
                        }
                    },
                }}
                theme={{
                    button: {
                        backgroundColor: "#3B81F6",
                        right: 20,
                        bottom: 20,
                        size: 48,
                        dragAndDrop: true,
                        iconColor: "white",
                        customIconSrc:
                            "https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/svg/google-messages.svg",
                        autoWindowOpen: {
                            autoOpen: true,
                            openDelay: 2,
                            autoOpenOnMobile: false,
                        },
                    },
                    tooltip: {
                        showTooltip: true,
                        tooltipMessage: "Hi There 👋!",
                        tooltipBackgroundColor: "black",
                        tooltipTextColor: "white",
                        tooltipFontSize: 16,
                    },
                    customCSS: ``,
                    chatWindow: {
                        showTitle: true,
                        showAgentMessages: true,
                        title: "Flowise Bot",
                        titleAvatarSrc:
                            "https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/svg/google-messages.svg",
                        welcomeMessage:
                            "Hello! This is custom welcome message",
                        errorMessage: "This is a custom error message",
                        backgroundColor: "#ffffff",
                        backgroundImage: "enter image path or link",
                        height: 550,
                        width: 1000,
                        fontSize: 16,
                        starterPrompts: ["What is a bot?", "Who are you?"],
                        starterPromptFontSize: 15,
                        clearChatOnReload: true,
                        sourceDocsTitle: "Sources:",
                        renderHTML: true,
                        botMessage: {
                            backgroundColor: "#f7f8ff",
                            textColor: "#303235",
                            showAvatar: true,
                            avatarSrc:
                                "https://raw.githubusercontent.com/zahidkhawaja/langchain-chat-nextjs/main/public/parroticon.png",
                        },
                        userMessage: {
                            backgroundColor: "#3B81F6",
                            textColor: "#ffffff",
                            showAvatar: true,
                            avatarSrc:
                                "https://raw.githubusercontent.com/zahidkhawaja/langchain-chat-nextjs/main/public/usericon.png",
                        },
                        textInput: {
                            placeholder: "Type your question",
                            backgroundColor: "#ffffff",
                            textColor: "#303235",
                            sendButtonColor: "#3B81F6",
                            maxChars: 50,
                            maxCharsWarningMessage:
                                "You exceeded the characters limit. Please input less than 50 characters.",
                            autoFocus: true,
                            sendMessageSound: false,
                            sendSoundLocation: "send_message.mp3",
                            receiveMessageSound: false,
                            receiveSoundLocation: "receive_message.mp3",
                        },
                        feedback: {
                            color: "#303235",
                        },
                        dateTimeToggle: {
                            date: true,
                            time: true,
                        },
                        footer: {
                            textColor: "#303235",
                            text: "",
                            company: "",
                            companyLink: "https://flowiseai.com",
                        },
                    },
                }}
            />
        </div>
    );
}
// src/app/lib/logout.ts
export async function logout() {
    try {
        await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include",
        });
    } catch (e) {
        console.error("Logout error:", e);
    } finally {
        window.location.href = "/auth/login";
    }
}

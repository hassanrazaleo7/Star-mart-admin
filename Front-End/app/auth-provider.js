"use client";

import { useEffect } from "react";
import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";

function reportAuthMessage(message) {
    window.dispatchEvent(new CustomEvent("shopery:auth-message", { detail: message }));
}

function setFormBusy(form, busy) {
    const button = form.querySelector('button[type="submit"], button:not([type])');
    if (!button) {
        return () => {};
    }

    const originalText = button.dataset.originalText ?? button.textContent;
    button.dataset.originalText = originalText;
    button.disabled = busy;
    button.textContent = busy ? "Please wait..." : originalText;
    return () => {
        button.disabled = false;
        button.textContent = originalText;
    };
}

function AuthBridge() {
    const { data: session, status, update } = useSession();

    useEffect(() => {
        if (status === "loading") {
            return;
        }

        window.shoperyAuthUser = session?.user ?? null;
        window.dispatchEvent(new CustomEvent("shopery:auth-state", {
            detail: session?.user ?? null,
        }));
    }, [session, status]);

    useEffect(() => {
        async function handleSubmit(event) {
            const form = event.target;
            if (!(form instanceof HTMLFormElement) || !["login-form", "register-form"].includes(form.id)) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            const values = new FormData(form);
            const email = String(values.get("email") ?? "").trim();
            const password = String(values.get("password") ?? "");
            const restoreButton = setFormBusy(form, true);

            try {
                if (form.id === "register-form") {
                    const name = String(values.get("name") ?? "").trim();
                    if (password !== values.get("confirm")) {
                        reportAuthMessage("Passwords do not match.");
                        return;
                    }
                    if (password.length < 12) {
                        reportAuthMessage("Use a password with at least 12 characters.");
                        return;
                    }

                    const response = await fetch("/api/register", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name, email, password }),
                    });
                    const result = await response.json();

                    if (!response.ok) {
                        reportAuthMessage(result.error ?? "Unable to create your account.");
                        return;
                    }
                }

                const result = await signIn("credentials", {
                    email,
                    password,
                    redirect: false,
                });

                if (!result?.ok || result.error) {
                    reportAuthMessage(
                        form.id === "register-form"
                            ? "Your account was created. Please sign in to continue."
                            : "Unable to sign in. Check your email and password, or wait before trying again.",
                    );
                    if (form.id === "register-form") {
                        window.location.assign("/sign-in");
                    }
                    return;
                }

                await update();
                window.location.assign("/dashboard");
            } catch (error) {
                console.error("Customer authentication request failed", error);
                reportAuthMessage("Authentication is temporarily unavailable. Please try again.");
            } finally {
                restoreButton();
            }
        }

        async function handleLogout(event) {
            const target = event.target instanceof Element
                ? event.target
                : event.target instanceof Node
                    ? event.target.parentElement
                    : null;
            const link = target?.closest("[data-logout]");
            if (!link) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            try {
                await signOut({ redirect: false });
                await update();
                window.location.assign("/sign-in");
            } catch (error) {
                console.error("Customer sign-out failed", error);
                reportAuthMessage("Unable to sign out right now. Please try again.");
            }
        }

        document.addEventListener("submit", handleSubmit, true);
        document.addEventListener("click", handleLogout, true);

        return () => {
            document.removeEventListener("submit", handleSubmit, true);
            document.removeEventListener("click", handleLogout, true);
        };
    }, [update]);

    return null;
}

export default function AuthProvider({ children }) {
    return (
        <SessionProvider>
            <AuthBridge />
            {children}
        </SessionProvider>
    );
}

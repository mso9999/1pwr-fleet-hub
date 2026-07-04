"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * Nexus SSO receiver.
 *
 * Nexus redirects here with ?sso_token=<Firebase custom token>&nonce=...&from=nexus
 * (minted by the Nexus mintSSOToken Cloud Function — same pr-system-4ea55
 * project). We exchange it via signInWithCustomToken; AuthProvider's
 * onAuthStateChanged then loads the fleet user and we land on the app.
 */
export default function SsoPage(): React.ReactElement {
  const handled = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("sso_token");
    const from = params.get("from");
    if (!token || from !== "nexus") {
      setError("Invalid sign-on link.");
      return;
    }

    signInWithCustomToken(auth, token)
      .then(() => {
        window.location.replace("/");
      })
      .catch((err) => {
        console.error("[Nexus SSO] sign-in failed:", err);
        setError("Your sign-in link is invalid or expired.");
      });
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="text-center max-w-md px-4">
        {error ? (
          <>
            <p className="text-red-600 text-sm mb-2">{error}</p>
            <p className="text-slate-500 text-sm">
              Relaunch Fleet from{" "}
              <a href="https://nexus.1pwrafrica.com" className="text-blue-600 underline">
                Nexus
              </a>{" "}
              or{" "}
              <a href="/login?fallback=1" className="text-blue-600 underline">
                sign in manually
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Signing you in via Nexus…</p>
          </>
        )}
      </div>
    </div>
  );
}

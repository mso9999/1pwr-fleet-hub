"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

const PR_SYSTEM_URL = "https://pr.1pwrafrica.com";

export default function LoginPage() {
  const { signIn, isLoading, error } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [destination, setDestination] = useState<"fleet" | "pr">("fleet");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await signIn(email, password);
      if (destination === "pr") {
        window.location.href = PR_SYSTEM_URL;
      } else {
        router.push("/");
      }
    } catch {
      // error is set in auth context
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900">1PWR</h1>
            <p className="text-slate-500 mt-1">Sign in to continue</p>
          </div>

          {/* Destination Toggle */}
          <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => setDestination("fleet")}
              className={`flex-1 py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
                destination === "fleet"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              🚛 Fleet Management
            </button>
            <button
              type="button"
              onClick={() => setDestination("pr")}
              className={`flex-1 py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
                destination === "pr"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              📋 PR System
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                placeholder="name@1pwr.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-xl text-white font-semibold text-lg transition-all ${
                destination === "fleet"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              } disabled:opacity-50`}
            >
              {isLoading
                ? "Signing in..."
                : destination === "fleet"
                  ? "Open Fleet Hub"
                  : "Open PR System"}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Same credentials for both systems
          </p>
        </div>
      </div>
    </div>
  );
}

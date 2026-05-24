"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";

interface FleetUser {
  id: string;
  firebaseUid: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  department: string;
  organizationId: string;
  permissionLevel: number;
  isActive: boolean;
}

interface AuthContextValue {
  user: FleetUser | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  error: string | null;
  organizationId: string;
  setOrganizationId: (orgId: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactNode {
  const [user, setUser] = useState<FleetUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState("1pwr_lesotho");

  useEffect(() => {
    const saved = localStorage.getItem("fleet_org_id");
    if (saved) setOrganizationId(saved);
  }, []);

  function persistOrg(orgId: string): void {
    setOrganizationId(orgId);
    localStorage.setItem("fleet_org_id", orgId);
  }

  function mapServerUserToFleetUser(input: {
    id: string;
    email: string;
    name: string;
    role: string;
    department?: string;
    organizationId?: string;
    firebaseUid?: string;
  }): FleetUser {
    const name = String(input.name || "").trim();
    const parts = name ? name.split(/\s+/) : [];
    const firstName = parts.slice(0, 1).join(" ");
    const lastName = parts.slice(1).join(" ");
    const org = String(input.organizationId || "1pwr_lesotho").toLowerCase().replace(/\s+/g, "_");
    return {
      id: input.id,
      firebaseUid: input.firebaseUid || input.id,
      email: input.email || "",
      firstName,
      lastName,
      name: name || input.email || "",
      role: input.role || "driver",
      department: input.department || "",
      organizationId: org,
      permissionLevel: 5,
      isActive: true,
    };
  }

  async function loadServerProfile(fbUser: FirebaseUser): Promise<FleetUser | null> {
    const token = await fbUser.getIdToken();
    if (!token) return null;
    const res = await fetch("/api/me/whoami", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      ok?: boolean;
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        department?: string;
        organizationId?: string;
      };
    };
    if (!payload.ok || !payload.user) return null;
    return mapServerUserToFleetUser({
      ...payload.user,
      firebaseUid: fbUser.uid,
    });
  }

  useEffect(() => {
    const PROFILE_MS = 12_000;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const userDoc = await Promise.race([
          getDoc(doc(firestore, "users", fbUser.uid)),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("profile-timeout")), PROFILE_MS);
          }),
        ]);
        if (userDoc.exists()) {
          const data = userDoc.data();
          const fleetUser: FleetUser = {
            id: fbUser.uid,
            firebaseUid: fbUser.uid,
            email: data.email || fbUser.email || "",
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.email || "",
            role: data.role || "REQ",
            department: data.department || "",
            organizationId: data.organization
              ? data.organization.toLowerCase().replace(/\s+/g, "_")
              : "1pwr_lesotho",
            permissionLevel: data.permissionLevel || 5,
            isActive: data.isActive !== false,
          };
          setUser(fleetUser);
          if (fleetUser.organizationId) {
            persistOrg(fleetUser.organizationId);
          }

          fetch("/api/users/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fleetUser),
          }).catch(() => {});
        } else {
          const fallback = await loadServerProfile(fbUser);
          if (fallback) {
            setUser(fallback);
            if (fallback.organizationId) persistOrg(fallback.organizationId);
          } else {
            setUser(null);
          }
        }
      } catch {
        const fallback = await loadServerProfile(fbUser);
        if (fallback) {
          setUser(fallback);
          if (fallback.organizationId) persistOrg(fallback.organizationId);
        } else {
          setUser(null);
        }
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  async function handleSignIn(email: string, password: string): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      if (msg.includes("invalid-credential")) {
        setError("Invalid email or password");
      } else if (msg.includes("user-disabled")) {
        setError("Your account is disabled. Contact Fleet Hub admin.");
      } else if (msg.includes("too-many-requests")) {
        setError("Too many attempts. Try again later.");
      } else {
        setError(msg);
      }
      setIsLoading(false);
      throw err;
    }
  }

  async function handleSignOut(): Promise<void> {
    await firebaseSignOut(auth);
    setUser(null);
    setFirebaseUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isLoading,
        error,
        organizationId,
        setOrganizationId: persistOrg,
        signIn: handleSignIn,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

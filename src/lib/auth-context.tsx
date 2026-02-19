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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const userDoc = await getDoc(doc(firestore, "users", fbUser.uid));
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

            // Also sync this user to our local API
            fetch("/api/users/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(fleetUser),
            }).catch(() => {});
          } else {
            setUser(null);
          }
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
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

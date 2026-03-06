import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import type { WorkspaceUser, SystemRole } from "../types";

interface AuthContextValue {
  /** null = still loading, "register" = first time, "login" = needs login, user = logged in */
  state: "loading" | "register" | "login" | WorkspaceUser;
  login: (email: string) => Promise<void>;
  register: (email: string) => Promise<void>;
  logout: () => void;
  /** Convenience: true when state is a user object */
  isLoggedIn: boolean;
  currentUser: WorkspaceUser | null;
  systemRole: SystemRole | null;
}

const AuthContext = createContext<AuthContextValue>({
  state: "loading",
  login: async () => {},
  register: async () => {},
  logout: () => {},
  isLoggedIn: false,
  currentUser: null,
  systemRole: null,
});

const STORAGE_KEY = "auth_email";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "register" | "login" | WorkspaceUser>("loading");

  const boot = useCallback(async () => {
    try {
      const { initialized } = await api.getAuthStatus();
      if (!initialized) {
        setState("register");
        return;
      }

      const savedEmail = localStorage.getItem(STORAGE_KEY);
      if (savedEmail) {
        try {
          const user = await api.login(savedEmail);
          setState(user);
          return;
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      setState("login");
    } catch {
      setState("login");
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  const login = async (email: string) => {
    const user = await api.login(email);
    localStorage.setItem(STORAGE_KEY, email);
    setState(user);
  };

  const register = async (email: string) => {
    const user = await api.register(email);
    localStorage.setItem(STORAGE_KEY, email);
    setState(user);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState("login");
  };

  const isLoggedIn = typeof state === "object";
  const currentUser = isLoggedIn ? (state as WorkspaceUser) : null;
  const systemRole = currentUser?.system_role as SystemRole | null;

  return (
    <AuthContext.Provider value={{ state, login, register, logout, isLoggedIn, currentUser, systemRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

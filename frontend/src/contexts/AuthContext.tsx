import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, SESSION_KEY } from "../api/client";
import type { WorkspaceUser, SystemRole } from "../types";

interface AuthContextValue {
  /** null = still loading, "register" = first time, "login" = needs login, user = logged in */
  state: "loading" | "register" | "login" | WorkspaceUser;
  login: (email: string, password?: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Convenience: true when state is a user object */
  isLoggedIn: boolean;
  currentUser: WorkspaceUser | null;
  systemRole: SystemRole | null;
  /** True immediately after register() — used to trigger onboarding flow */
  justRegistered: boolean;
  clearJustRegistered: () => void;
  /** Refresh current user from /auth/me (e.g. after change-password) */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  state: "loading",
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  isLoggedIn: false,
  currentUser: null,
  systemRole: null,
  justRegistered: false,
  clearJustRegistered: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "register" | "login" | WorkspaceUser>(
    "loading"
  );
  const [justRegistered, setJustRegistered] = useState(false);

  const boot = useCallback(async () => {
    try {
      const { initialized } = await api.getAuthStatus();
      if (!initialized) {
        setState("register");
        return;
      }

      const token = localStorage.getItem(SESSION_KEY);
      if (token) {
        try {
          const user = await api.getMe();
          setState(user);
          return;
        } catch {
          // Token invalid / expired — clear it
          localStorage.removeItem(SESSION_KEY);
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

  const login = async (email: string, password?: string) => {
    const { user, token } = await api.login(email, password);
    localStorage.setItem(SESSION_KEY, token);
    setState(user);
  };

  const register = async (email: string, password: string) => {
    const { user, token } = await api.register(email, password);
    localStorage.setItem(SESSION_KEY, token);
    setJustRegistered(true);
    setState(user);
  };

  const logout = async () => {
    try {
      await api.logoutSession();
    } catch {
      // Ignore errors on logout — token may already be invalid
    }
    localStorage.removeItem(SESSION_KEY);
    setState("login");
  };

  const refreshUser = async () => {
    try {
      const user = await api.getMe();
      setState(user);
    } catch {
      // Session gone — force re-login
      localStorage.removeItem(SESSION_KEY);
      setState("login");
    }
  };

  const clearJustRegistered = () => setJustRegistered(false);

  const isLoggedIn = typeof state === "object";
  const currentUser = isLoggedIn ? (state as WorkspaceUser) : null;
  const systemRole = currentUser?.system_role as SystemRole | null;

  return (
    <AuthContext.Provider
      value={{
        state,
        login,
        register,
        logout,
        isLoggedIn,
        currentUser,
        systemRole,
        justRegistered,
        clearJustRegistered,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
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
  /** True when running on the hosted demo instance (fly.dev) */
  isHostedDemo: boolean;
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
  isHostedDemo: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "register" | "login" | WorkspaceUser>(
    "loading"
  );
  const [justRegistered, setJustRegistered] = useState(false);
  const [isHostedDemo, setIsHostedDemo] = useState(false);

  const boot = useCallback(async () => {
    try {
      // Check if this is a hosted demo instance before anything else
      const appConfig = await api.getAppConfig();
      if (appConfig.hosted_demo) {
        setIsHostedDemo(true);
        // Auto-login as the shared demo guest user (creates a session cookie)
        const user = await api.guestSession();
        setState(user);
        return;
      }
    } catch {
      // If app-config fails (e.g. local dev without this endpoint), fall through to normal auth
    }

    try {
      const { initialized } = await api.getAuthStatus();
      if (!initialized) {
        setState("register");
        return;
      }

      // Session is cookie-backed — just call /auth/me.
      // The browser sends the HttpOnly cookie automatically.
      try {
        const user = await api.getMe();
        setState(user);
        return;
      } catch {
        // No valid session cookie
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
    // Backend sets HttpOnly cookie; response token kept for API clients but not stored in browser
    const { user } = await api.login(email, password);
    setState(user);
  };

  const register = async (email: string, password: string) => {
    const { user } = await api.register(email, password);
    setJustRegistered(true);
    setState(user);
  };

  const logout = async () => {
    try {
      await api.logoutSession();
    } catch {
      // Ignore errors on logout — cookie may already be expired
    }
    setState("login");
  };

  const refreshUser = async () => {
    try {
      const user = await api.getMe();
      setState(user);
    } catch {
      // Session gone — force re-login
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
        isHostedDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

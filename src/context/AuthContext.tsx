import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ID, OAuthProvider, account } from "../lib/appwrite";
import type { Models } from "../lib/appwrite";
import { accessStateFor, isAdmin } from "../api/access";
import type { AccessState } from "../api/access";

type User = Models.User<Models.Preferences>;

interface AuthValue {
  user: User | null;
  access: AccessState;
  admin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => void;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await account.get());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      await account.createEmailPasswordSession({ email, password });
      await refresh();
    },
    [refresh],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      await account.create({ userId: ID.unique(), email, password, name });
      await account.createEmailPasswordSession({ email, password });
      // El correo de verificacion dispara la funcion que encola la solicitud de acceso.
      await account.createEmailVerification({ url: `${window.location.origin}/verify` });
      await refresh();
    },
    [refresh],
  );

  const loginWithGoogle = useCallback(() => {
    account.createOAuth2Session({
      provider: OAuthProvider.Google,
      success: `${window.location.origin}/`,
      failure: `${window.location.origin}/login?error=oauth`,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await account.deleteSession({ sessionId: "current" });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      access: accessStateFor(user),
      admin: isAdmin(user),
      loading,
      refresh,
      login,
      loginWithGoogle,
      register,
      logout,
    }),
    [user, loading, refresh, login, loginWithGoogle, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return value;
}

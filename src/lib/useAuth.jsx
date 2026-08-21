import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [presidency, setPresidency] = useState(null); // row from presidency_members
  const [ready, setReady] = useState(false);

  const loadPresidency = useCallback(async (sess) => {
    if (!sess) {
      setPresidency(null);
      return;
    }
    // If this select returns nothing, the account exists but isn't presidency —
    // RLS will block every presidency table regardless of what the UI shows.
    const { data } = await supabase
      .from("presidency_members")
      .select("*")
      .eq("user_id", sess.user.id)
      .maybeSingle();
    setPresidency(data || null);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data.session);
      await loadPresidency(data.session);
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      loadPresidency(sess);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadPresidency]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message || null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthCtx.Provider
      value={{ session, presidency, isPresidency: !!presidency, ready, signIn, signOut }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

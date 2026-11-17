import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const DEMO_SESSION_KEY = "nutritrack_demo_session";

function getDemoSession() {
  const stored = localStorage.getItem(DEMO_SESSION_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored);
    if (!parsed?.user) return null;
    return parsed.session ?? { user: parsed.user };
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const demoSession = getDemoSession();
    if (demoSession?.user) {
      setSession(demoSession as Session);
      setUser(demoSession.user as User);
      setLoading(false);
      return;
    }

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    localStorage.removeItem(DEMO_SESSION_KEY);
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return { user, session, loading, signOut };
}

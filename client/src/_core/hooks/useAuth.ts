import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, refreshSupabaseSession } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false } = options ?? {};
  const utils = trpc.useUtils();
  const [sessionReady, setSessionReady] = useState(!supabase);
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: sessionReady,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => utils.auth.me.setData(undefined, null),
  });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void refreshSupabaseSession().finally(() => {
      if (active) setSessionReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void refreshSupabaseSession().then(() => utils.auth.me.invalidate());
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [utils]);

  const logout = useCallback(async () => {
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [utils]);

  const state = useMemo(() => ({
    user: meQuery.data ?? null,
    loading: !sessionReady || meQuery.isLoading || logoutMutation.isPending,
    error: meQuery.error ?? logoutMutation.error ?? null,
    isAuthenticated: Boolean(meQuery.data),
  }), [meQuery.data, meQuery.error, meQuery.isLoading, logoutMutation.error, logoutMutation.isPending, sessionReady]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || state.loading || state.user) return;
    window.dispatchEvent(new Event("supabase-auth-required"));
  }, [redirectOnUnauthenticated, state.loading, state.user]);

  return {
    ...state,
    refresh: async () => {
      await refreshSupabaseSession();
      return meQuery.refetch();
    },
    logout,
  };
}

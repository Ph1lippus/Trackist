import { create } from 'zustand'
import { supabase } from '../services/supabaseClient'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  accessToken: string | null
  isAdmin: boolean
  approved: boolean | null
  approvalLoading: boolean
  aal: 'aal1' | 'aal2' | null
  loading: boolean
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setAccessToken: (token: string | null) => void
  setIsAdmin: (isAdmin: boolean) => void
  setApproved: (approved: boolean | null) => void
  setApprovalLoading: (loading: boolean) => void
  setAal: (aal: 'aal1' | 'aal2' | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  accessToken: null,
  isAdmin: false,
  approved: null,
  approvalLoading: true,
  aal: null,
  loading: true,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setApproved: (approved) => set({ approved }),
  setApprovalLoading: (approvalLoading) => set({ approvalLoading }),
  setAal: (aal) => set({ aal }),
  setLoading: (loading) => set({ loading }),
}))

export const initializeAuth = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  useAuthStore.getState().setUser(session?.user ?? null)
  useAuthStore.getState().setSession(session ?? null)
  useAuthStore.getState().setAccessToken(session?.access_token ?? null)
  useAuthStore.getState().setAal(session?.user?.app_metadata?.aal as 'aal1' | 'aal2' | null ?? null)
  await refreshApproval(session?.user?.id ?? null)
  useAuthStore.getState().setLoading(false)

  // Approval is a stable per-account flag. Re-query it only when the identity
  // can actually have changed (sign in/out, or the signed-in user id changed).
  // Normal token refreshes (e.g. a background `TOKEN_REFRESHED` when the tab
  // comes back into focus) fire `onAuthStateChange` for the same user — a
  // re-check there would flip `approved` to null and `approvalLoading` to true,
  // flashing the full-screen "Checking account approval..." on every tab return
  // for no reason. Guard on identity so focus returns never re-verify approval.
  let lastUserId = session?.user?.id ?? null

  supabase.auth.onAuthStateChange((event, session) => {
    const nextUserId = session?.user?.id ?? null
    useAuthStore.getState().setUser(session?.user ?? null)
    useAuthStore.getState().setSession(session ?? null)
    useAuthStore.getState().setAccessToken(session?.access_token ?? null)
    useAuthStore.getState().setAal(session?.user?.app_metadata?.aal as 'aal1' | 'aal2' | null ?? null)

    const identityChanged =
      event === 'SIGNED_OUT' ||
      nextUserId !== lastUserId
    lastUserId = nextUserId

    if (identityChanged) {
      useAuthStore.getState().setApproved(null)
      void refreshApproval(nextUserId)
    }
  })
}

const refreshApproval = async (userId: string | null) => {
  useAuthStore.getState().setApprovalLoading(true)
  if (!userId) {
    useAuthStore.getState().setApproved(null)
    useAuthStore.getState().setApprovalLoading(false)
    return
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('approved')
    .eq('id', userId)
    .maybeSingle()

  // Fail closed if the profile cannot be read or does not exist.
  useAuthStore.getState().setApproved(error ? null : data?.approved === true)
  useAuthStore.getState().setApprovalLoading(false)
}

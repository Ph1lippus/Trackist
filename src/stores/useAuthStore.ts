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

  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setUser(session?.user ?? null)
    useAuthStore.getState().setSession(session ?? null)
    useAuthStore.getState().setAccessToken(session?.access_token ?? null)
    useAuthStore.getState().setAal(session?.user?.app_metadata?.aal as 'aal1' | 'aal2' | null ?? null)
    useAuthStore.getState().setApproved(null)
    void refreshApproval(session?.user?.id ?? null)
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

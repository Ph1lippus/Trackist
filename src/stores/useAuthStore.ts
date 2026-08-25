import { create } from 'zustand'
import { supabase } from '../services/supabaseClient'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  accessToken: string | null
  isAdmin: boolean
  loading: boolean
  setUser: (user: User | null) => void
  setAccessToken: (token: string | null) => void
  setIsAdmin: (isAdmin: boolean) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAdmin: false,
  loading: true,
  setUser: (user) => set({ user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setLoading: (loading) => set({ loading }),
}))

export const initializeAuth = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  useAuthStore.getState().setUser(session?.user ?? null)
  useAuthStore.getState().setAccessToken(session?.access_token ?? null)
  useAuthStore.getState().setLoading(false)

  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setUser(session?.user ?? null)
    useAuthStore.getState().setAccessToken(session?.access_token ?? null)
  })
}

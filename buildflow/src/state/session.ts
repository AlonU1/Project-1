import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionState {
  userId: string | null
  theme: 'light' | 'dark'
  lastProjectId: string | null
  login: (userId: string) => void
  logout: () => void
  setTheme: (t: 'light' | 'dark') => void
  setLastProject: (id: string) => void
}

export const useSession = create<SessionState>()(
  persist(
    set => ({
      userId: null,
      theme: 'light',
      lastProjectId: null,
      login: userId => set({ userId }),
      logout: () => set({ userId: null }),
      setTheme: theme => set({ theme }),
      setLastProject: lastProjectId => set({ lastProjectId }),
    }),
    { name: 'bf-session' },
  ),
)

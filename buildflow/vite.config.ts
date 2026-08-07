import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      manifest: {
        name: 'BuildFlow — ניהול פרויקטי בנייה',
        short_name: 'BuildFlow',
        dir: 'rtl',
        lang: 'he',
        display: 'standalone',
        theme_color: '#1d5c8f',
        background_color: '#f1f5f9',
        icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
})

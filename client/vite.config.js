import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default {
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Open Plant IQ',
        short_name: 'Plant IQ',
        description: 'Mobile-first plant reference and schedule tool for landscape architects',
        theme_color: '#166534',
        background_color: '#0f1f12',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="%230f1f12"/><path d="M96 38 C75 57 60 85 96 128 C132 85 117 57 96 38Z" fill="%234caf50" opacity="0.9"/><path d="M96 50 L96 110" stroke="%23e8f5e9" stroke-width="4" fill="none"/><path d="M96 75 L76 58" stroke="%23e8f5e9" stroke-width="3" fill="none"/><path d="M96 95 L116 78" stroke="%23e8f5e9" stroke-width="3" fill="none"/></svg>',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="110" fill="%230f1f12"/><path d="M256 102 C202 153 160 227 256 341 C352 227 310 153 256 102Z" fill="%234caf50" opacity="0.9"/><path d="M256 133 L256 293" stroke="%23e8f5e9" stroke-width="10" fill="none"/><path d="M256 200 L203 155" stroke="%23e8f5e9" stroke-width="8" fill="none"/><path d="M256 253 L309 208" stroke="%23e8f5e9" stroke-width="8" fill="none"/></svg>',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ],
        screenshots: [
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 720"><rect width="540" height="720" fill="%230f1f12"/><text x="270" y="360" font-size="32" fill="%234caf50" text-anchor="middle">Open Plant IQ</text></svg>',
            sizes: '540x720',
            form_factor: 'narrow'
          }
        ]
      }
    })
  ],
  server: {
    port: 5189,
    proxy: {
      '/api': {
        target: 'http://localhost:3021',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
};

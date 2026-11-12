import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages는 https://xoniekim.github.io/nail-app/ 아래에서 열리므로 배포 빌드에서만 경로 앞에 /nail-app/ 를 붙인다.
// (로컬 개발·Capacitor 앱 빌드는 그대로 /)
const base = process.env.GITHUB_PAGES ? '/nail-app/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    // 홈 화면에 추가하면 앱처럼 열리고, 한 번 열어둔 뒤에는 인터넷 없이도 실행되게
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '네일 조합',
        short_name: '네일 조합',
        description: '레퍼런스 네일을 모아 이달의 아트를 미리 조합해보는 앱',
        lang: 'ko',
        theme_color: '#fdf7f8',
        background_color: '#fdf7f8',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // 구글 로그인 스크립트·드라이브 API는 캐시하지 않음
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
})

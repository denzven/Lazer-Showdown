import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

let commitHash = '';
try {
  commitHash = execSync('git rev-parse HEAD').toString().trim();
} catch (e) {
  console.warn("Could not get git commit hash", e);
}

function dojoPlugin() {
  return {
    name: 'dojo-export',
    configureServer(server) {
      server.middlewares.use('/api/dojo-export', (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const dojoPath = path.resolve(__dirname, 'public/models/ai-bot/dojo_buffer.json');
            
            let existingInputs = [];
            let existingLabels = [];
            
            if (fs.existsSync(dojoPath)) {
              try {
                const existing = JSON.parse(fs.readFileSync(dojoPath, 'utf8'));
                if (existing.inputs && existing.labels) {
                  existingInputs = existing.inputs;
                  existingLabels = existing.labels;
                }
              } catch (e) { console.error("Error reading existing dojo buffer", e); }
            }
            
            existingInputs.push(...payload.inputs);
            existingLabels.push(...payload.labels);
            
            fs.writeFileSync(dojoPath, JSON.stringify({ inputs: existingInputs, labels: existingLabels }));
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, totalStates: existingInputs.length }));
          } catch (e) {
            console.error("Dojo export failed", e);
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash)
  },
  base: '/Lazer-Showdown/', // Absolute base path for GitHub Pages to fix Service Worker registration
  plugins: [
    react(),
    mkcert(),
    dojoPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-32x32.png', 'favicon-16x16.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/?source=pwa',
        name: 'Lazer Showdown WebRTC',
        short_name: 'LazerShowdown',
        description: 'Play Lazer Showdown: A futuristic, real-time peer-to-peer WebRTC laser reflection strategy board game.',
        theme_color: '#07080e',
        background_color: '#07080e',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        start_url: '/Lazer-Showdown/',
        scope: '/Lazer-Showdown/',
        lang: 'en-US',
        dir: 'ltr',
        categories: ['games', 'entertainment', 'board', 'strategy'],
        iarc_rating_id: 'e84b0728-71af-4c31-97af-500ef4608c02', // Placeholder UUID for IARC
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          {
            name: "Play Bot",
            short_name: "Bot Match",
            description: "Play against an AI bot",
            url: "/#/bot",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }]
          },
          {
            name: "Play Local",
            short_name: "Local",
            description: "Start a local pass-and-play game",
            url: "/#/local",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }]
          },
          {
            name: "Play Online",
            short_name: "Online",
            description: "Play against a friend online",
            url: "/#/online",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }]
          },
          {
            name: "Devs Corner",
            short_name: "Devs Corner",
            description: "Explore the developer tools",
            url: "/#/devs-corner",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }]
          },
          {
            name: "Lore",
            short_name: "Lore",
            description: "Read the Lazer Showdown lore",
            url: "/#/lore",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }]
          }
        ],
        widgets: [
          {
            name: "Lazer Showdown Match",
            description: "View recent match stats or quick join",
            tag: "lazer-widget",
            ms_ac_template: "assets/widget-template.json",
            data: "assets/widget-data.json",
            type: "application/json"
          }
        ],
        related_applications: [
          {
            platform: "webapp",
            url: "https://denzven.github.io/Lazer-Showdown/manifest.webmanifest"
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,md}'],
        maximumFileSizeToCacheInBytes: 15000000, // 15 MB to handle large lore images
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.github\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'github-api-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  server: {
    https: true,
    host: true // Exposes server on network
  }
})


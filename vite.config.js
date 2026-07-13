import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'

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
  base: './', // Generates relative asset paths for GitHub Pages
  plugins: [
    react(),
    mkcert(),
    dojoPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-32x32.png', 'favicon-16x16.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Lazer Showdown WebRTC',
        short_name: 'LazerShowdown',
        description: 'Play Lazer Showdown: A futuristic, real-time peer-to-peer WebRTC laser reflection strategy board game.',
        theme_color: '#07080e',
        background_color: '#07080e',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
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


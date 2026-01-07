
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          devOptions: {
            enabled: true
          },
          manifest: {
            name: "Brilliant Attendance",
            short_name: "Attendance",
            start_url: "/",
            display: "standalone",
            background_color: "#ffffff",
            theme_color: "#000000",
            icons: [
              {
                "src": "https://i.ibb.co/KRGPG28/brilliant-chemical-logo-ollk04m5z92plr7shhb2ucypq3dw4edq2t01ppwfl0.png",
                "sizes": "192x192",
                "type": "image/png"
              },
              {
                "src": "https://i.ibb.co/KRGPG28/brilliant-chemical-logo-ollk04m5z92plr7shhb2ucypq3dw4edq2t01ppwfl0.png",
                "sizes": "512x512",
                "type": "image/png"
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

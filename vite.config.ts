import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  if (mode === 'development') {
    const { loadServerEnv } = await import('./server/config/loadServerEnv');
    loadServerEnv(process.cwd());
  }

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const supabasePublishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    '';

  return {
    plugins: [
      react(),
      {
        name: 'ezrab-ai-backend-plugin',
        configureServer: mode === 'development' ? async (server) => {
          const { handleAiApiRequest } = await import('./server/api/aiRoutes');
          const { handleProjectRabApiRequest } = await import('./server/api/projectRabRoutes');
          const { handleWizardApiRequest } = await import('./server/api/wizardRoutes');

          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/api/projects')) {
              void handleProjectRabApiRequest(req, res).then((handled) => { if (!handled && !res.writableEnded) next(); });
              return;
            }
            if (req.url && req.url.startsWith('/api/assistant/wizard')) {
              void handleWizardApiRequest(req, res).then((handled) => { if (!handled && !res.writableEnded) next(); });
              return;
            }
            if (req.url && req.url.startsWith('/api/ai')) {
              handleAiApiRequest(req, res, next);
            } else {
              next();
            }
          });
        } : undefined,
      },
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabasePublishableKey),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
        },
      },
    },
    server: {
      host: true,
      port: 3000,
      open: false,
      watch: {
        usePolling: true,
        interval: 300,
      },
    },
  };
});
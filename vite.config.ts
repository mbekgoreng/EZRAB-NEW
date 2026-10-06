import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { loadServerEnv } from './server/config/loadServerEnv';
import { handleAiApiRequest } from './server/api/aiRoutes';
import { handleProjectRabApiRequest } from './server/api/projectRabRoutes';
import { handleWizardApiRequest } from './server/api/wizardRoutes';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Populate process.env for server-side route handlers (vite's loadEnv does not).
  loadServerEnv(process.cwd());

  // Strictly expose ONLY public URL and Publishable/Anon key to client.
  // NEVER expose SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.
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
        configureServer(server) {
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
        },
      },
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabasePublishableKey),
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

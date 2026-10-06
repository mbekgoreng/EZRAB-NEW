import http from 'http';
import { handleAiApiRequest } from './api/aiRoutes';
import { handleProjectRabApiRequest } from './api/projectRabRoutes';
import { handleTemplateApiRequest } from './api/templateRoutes';

const PORT = parseInt(process.env.PORT || '3001', 10);

const server = http.createServer(async (req, res) => {
  if (await handleProjectRabApiRequest(req, res)) return;
  if (await handleTemplateApiRequest(req, res)) return;
  await handleAiApiRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`[EZRAB AI Backend] Server running on http://localhost:${PORT}`);
  console.log(`[EZRAB AI Backend] Health check available at http://localhost:${PORT}/api/ai/health`);
  console.log(`[EZRAB AI Backend] Template API available at http://localhost:${PORT}/api/templates`);
});


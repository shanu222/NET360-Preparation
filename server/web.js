import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 10000);
const app = express();
const distDir = path.resolve(__dirname, '../dist');

app.disable('x-powered-by');

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(express.static(distDir, {
  maxAge: '1h',
  etag: true,
}));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NET360 web server listening on port ${PORT}`);
});

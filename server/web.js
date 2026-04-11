import express from 'express';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 10000);
const app = express();
const distDir = path.resolve(__dirname, '../dist');
const indexHtmlPath = path.join(distDir, 'index.html');
const distHasIndex = fs.existsSync(indexHtmlPath);
const publicDir = path.resolve(__dirname, '../public');
const googleVerificationFile = 'google408182c27152cb87.html';
const sitemapFile = 'sitemap.xml';
const robotsFile = 'robots.txt';

app.disable('x-powered-by');
app.use(compression());

if (!distHasIndex) {
  console.warn(
    '[NET360 web] dist/index.html not found. For local preview run: npm run dev (Vite, hot reload). ' +
      'To use this static server instead, run: npm run build',
  );
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(
  express.static(distDir, {
    etag: true,
    setHeaders(res, filePath) {
      const base = path.basename(filePath);
      if (base === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return;
      }
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      if (/\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(base)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=3600');
    },
  }),
);

app.get(`/${googleVerificationFile}`, (_req, res) => {
  const distFilePath = path.join(distDir, googleVerificationFile);
  if (fs.existsSync(distFilePath)) {
    res.sendFile(distFilePath);
    return;
  }

  const publicFilePath = path.join(publicDir, googleVerificationFile);
  if (fs.existsSync(publicFilePath)) {
    res.sendFile(publicFilePath);
    return;
  }

  res.status(404).send('Verification file not found.');
});

app.get('/sitemap.xml', (_req, res) => {
  const distFilePath = path.join(distDir, sitemapFile);
  if (fs.existsSync(distFilePath)) {
    res.type('application/xml');
    res.sendFile(distFilePath);
    return;
  }

  const publicFilePath = path.join(publicDir, sitemapFile);
  if (fs.existsSync(publicFilePath)) {
    res.type('application/xml');
    res.sendFile(publicFilePath);
    return;
  }

  res.status(404).send('Sitemap file not found.');
});

app.get('/robots.txt', (_req, res) => {
  const distFilePath = path.join(distDir, robotsFile);
  if (fs.existsSync(distFilePath)) {
    res.type('text/plain');
    res.sendFile(distFilePath);
    return;
  }

  const publicFilePath = path.join(publicDir, robotsFile);
  if (fs.existsSync(publicFilePath)) {
    res.type('text/plain');
    res.sendFile(publicFilePath);
    return;
  }

  res.status(404).send('Robots file not found.');
});

app.get('*', (_req, res) => {
  if (!distHasIndex) {
    res
      .status(503)
      .type('html')
      .send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>NET360 — build required</title></head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:2rem auto;padding:0 1rem;line-height:1.5">
<h1>No production build yet</h1>
<p>This server only serves the <code>dist/</code> folder. There is no <code>dist/index.html</code> yet.</p>
<p><strong>For live development</strong> (recommended), stop this process and run:</p>
<pre style="background:#f4f4f5;padding:0.75rem;border-radius:8px">npm run dev</pre>
<p>Then open the URL Vite prints (default <code>http://127.0.0.1:3000</code> unless the port is in use).</p>
<p><strong>To use this server</strong>, run <code>npm run build</code> first, then start again.</p>
</body></html>`);
    return;
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(indexHtmlPath);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NET360 web server listening on port ${PORT}`);
});

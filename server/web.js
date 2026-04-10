import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 10000);
const app = express();
const distDir = path.resolve(__dirname, '../dist');
const publicDir = path.resolve(__dirname, '../public');
const googleVerificationFile = 'google408182c27152cb87.html';
const sitemapFile = 'sitemap.xml';
const robotsFile = 'robots.txt';

app.disable('x-powered-by');

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(express.static(distDir, {
  maxAge: '1h',
  etag: true,
}));

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
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NET360 web server listening on port ${PORT}`);
});

#!/usr/bin/env node
/**
 * Pre-commit verification for NET360 ops (Railway + Vercel architecture).
 * Usage: node scripts/verify-ops-precommit.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..');

const results = [];

function pass(id, detail) {
  results.push({ id, status: 'PASS', detail });
  console.log(`PASS  ${id} — ${detail}`);
}

function fail(id, detail) {
  results.push({ id, status: 'FAIL', detail });
  console.error(`FAIL  ${id} — ${detail}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await httpGetJson(`${baseUrl}/api/health`);
      if (res.status === 200) return true;
    } catch {
      // retry
    }
    await sleep(500);
  }
  return false;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, json: JSON.parse(data) });
        } catch {
          reject(new Error(`Invalid JSON from ${url}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', (error) => reject(error));
    req.setTimeout(10_000, () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
  });
}

async function main() {
  console.log('== NET360 ops pre-commit verification (Railway) ==\n');

  // 1. Railway config present
  if (existsSync(path.join(REPO_DIR, 'railway.toml'))) {
    const railway = readFileSync(path.join(REPO_DIR, 'railway.toml'), 'utf8');
    if (railway.includes('build-for-host') && railway.includes('server/index.js')) {
      pass('railway-toml', 'API-only build + node server/index.js start');
    } else {
      fail('railway-toml', 'missing expected build/start commands');
    }
  } else {
    fail('railway-toml', 'railway.toml missing');
  }

  // 2. No direct AWS runtime deps in package.json
  const pkg = JSON.parse(readFileSync(path.join(REPO_DIR, 'package.json'), 'utf8'));
  const depNames = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const awsDeps = depNames.filter((n) => n.startsWith('@aws-sdk') || n === 'aws-sdk' || n === 'multer-s3');
  if (awsDeps.length === 0) {
    pass('no-aws-runtime-deps', 'package.json has no AWS SDK / multer-s3');
  } else {
    fail('no-aws-runtime-deps', `found: ${awsDeps.join(', ')}`);
  }

  // 3. EC2 deploy scripts removed
  const banned = [
    'scripts/deploy-api-production.sh',
    'scripts/setup-pm2-production.sh',
    'scripts/rollback-api-production.sh',
    'scripts/pm2-health-monitor.sh',
    'deploy/cloudwatch/install-cloudwatch-agent.sh',
  ];
  const stillPresent = banned.filter((rel) => existsSync(path.join(REPO_DIR, rel)));
  if (stillPresent.length === 0) {
    pass('ec2-scripts-removed', 'legacy EC2/PM2/CloudWatch install scripts absent');
  } else {
    fail('ec2-scripts-removed', stillPresent.join(', '));
  }

  // 4. Health endpoints via local server
  const testPort = 51998;
  const testBase = `http://127.0.0.1:${testPort}`;
  writeFileSync(path.join(REPO_DIR, 'deploy/build-info.json'), JSON.stringify({
    service: 'net360-api',
    commit: 'verify-test-commit',
    branch: 'verify',
    deployedAt: new Date().toISOString(),
    buildHost: 'verify-host',
  }, null, 2));

  const serverProc = spawn(process.execPath, ['server/index.js'], {
    cwd: REPO_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      API_PORT: String(testPort),
      PORT: String(testPort),
      MONGODB_URI: '',
      DATABASE_URL: '',
      MONGO_URI: '',
      JWT_SECRET: 'verify-test-jwt-secret-with-enough-length',
      JWT_REFRESH_SECRET: 'verify-test-refresh-secret-with-enough-length',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverLog = '';
  serverProc.stdout?.on('data', (d) => { serverLog += d.toString(); });
  serverProc.stderr?.on('data', (d) => { serverLog += d.toString(); });

  try {
    const up = await waitForServer(testBase);
    if (!up) {
      fail('health-endpoints', `server did not start on ${testBase}\n${serverLog.slice(-500)}`);
    } else {
      await sleep(1000);
      const health = await httpGetJson(`${testBase}/api/health`);
      const ready = await httpGetJson(`${testBase}/api/health/ready`);
      const version = await httpGetJson(`${testBase}/api/version`);

      const healthOk = health.status === 200
        && health.json.status === 'ok'
        && health.json.mongo
        && health.json.build;
      const readyOk = ready.status === 200
        && ready.json.status === 'ready'
        && ready.json.mongo?.configured === false;
      const versionOk = version.status === 200
        && version.json.commit === 'verify-test-commit'
        && version.json.service === 'net360-api';

      if (healthOk && readyOk && versionOk) {
        pass('health-endpoints', '/api/health + /api/health/ready + /api/version OK');
      } else {
        fail('health-endpoints', JSON.stringify({ health: health.status, ready: ready.status, version: version.json }));
      }
    }
  } catch (error) {
    fail('health-endpoints', `${error.message}\n${serverLog.slice(-400)}`);
  } finally {
    serverProc.kill('SIGTERM');
    await sleep(500);
    if (!serverProc.killed) serverProc.kill('SIGKILL');
  }

  // 5. Server syntax
  const { spawnSync } = await import('node:child_process');
  const syntax = spawnSync(process.execPath, ['--check', 'server/index.js'], { cwd: REPO_DIR });
  if (syntax.status === 0) {
    pass('server-syntax', 'node --check server/index.js');
  } else {
    fail('server-syntax', syntax.stderr?.toString() || 'syntax check failed');
  }

  console.log('\n== PASS/FAIL REPORT ==');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`Total: ${results.length} | PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log('\nFailed checks:');
    results.filter((r) => r.status === 'FAIL').forEach((r) => console.log(`  - ${r.id}: ${r.detail}`));
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

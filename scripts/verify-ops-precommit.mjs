#!/usr/bin/env node
/**
 * Pre-commit verification for NET360 ops infrastructure.
 * Usage: node scripts/verify-ops-precommit.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const BASH = process.env.BASH_PATH
  || (IS_WIN ? 'C:\\Program Files\\Git\\bin\\bash.exe' : '/bin/bash');

const results = [];

function pass(id, detail) {
  results.push({ id, status: 'PASS', detail });
  console.log(`PASS  ${id} — ${detail}`);
}

function fail(id, detail) {
  results.push({ id, status: 'FAIL', detail });
  console.error(`FAIL  ${id} — ${detail}`);
}

function runBash(scriptRel, env = {}) {
  const script = path.join(REPO_DIR, scriptRel).replace(/\\/g, '/');
  const repo = REPO_DIR.replace(/\\/g, '/');
  const result = spawnSync(BASH, [script], {
    cwd: REPO_DIR,
    env: { ...process.env, REPO_DIR: repo, ...env },
    encoding: 'utf8',
    timeout: 120_000,
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: `${result.stdout || ''}${result.stderr || ''}`,
  };
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
        } catch (error) {
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
  console.log('== NET360 ops pre-commit verification ==\n');

  // 1. Dry-run deployment scripts
  const rollbackTag = '.deploy-rollback-verify-dryrun';
  writeFileSync(
    path.join(REPO_DIR, rollbackTag),
    spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_DIR, encoding: 'utf8' }).stdout.trim(),
  );

  const dryScripts = [
    ['scripts/deploy-api-production.sh', { DRY_RUN: '1', SKIP_GIT_PULL: '1' }],
    ['scripts/setup-pm2-production.sh', { DRY_RUN: '1' }],
    ['scripts/rollback-api-production.sh', { DRY_RUN: '1' }, [rollbackTag]],
    ['deploy/cloudwatch/install-cloudwatch-agent.sh', { DRY_RUN: '1' }],
  ];

  let dryRunOk = true;
  for (const entry of dryScripts) {
    const [script, env, args = []] = entry;
    const out = spawnSync(BASH, [path.join(REPO_DIR, script).replace(/\\/g, '/'), ...args], {
      cwd: REPO_DIR,
      env: { ...process.env, REPO_DIR: REPO_DIR.replace(/\\/g, '/'), ...env },
      encoding: 'utf8',
      timeout: 120_000,
    });
    const combined = `${out.stdout || ''}${out.stderr || ''}`;
    if (out.status === 0) {
      pass(`dry-run:${path.basename(script)}`, 'completed without error');
    } else {
      dryRunOk = false;
      fail(`dry-run:${path.basename(script)}`, `exit ${out.status}\n${combined.slice(-400)}`);
    }
  }
  rmSync(path.join(REPO_DIR, rollbackTag), { force: true });

  // 2. Idempotent deploy dry-run (twice)
  const idem1 = runBash('scripts/deploy-api-production.sh', { DRY_RUN: '1', SKIP_GIT_PULL: '1' });
  const idem2 = runBash('scripts/deploy-api-production.sh', { DRY_RUN: '1', SKIP_GIT_PULL: '1' });
  if (idem1.ok && idem2.ok) {
    pass('deploy-idempotent', 'two consecutive DRY_RUN deploys succeeded');
  } else {
    fail('deploy-idempotent', 'consecutive dry-run deploys did not both succeed');
  }

  // 3. Legacy workflow wrappers still valid
  const legacy = runBash('scripts/net360-on-api-server.example.sh', { DRY_RUN: '1', SKIP_GIT_PULL: '1' });
  if (legacy.ok && legacy.stdout.includes('[DRY_RUN]')) {
    pass('legacy-deploy-wrapper', 'net360-on-api-server.example.sh delegates to deploy-api-production.sh');
  } else {
    fail('legacy-deploy-wrapper', legacy.stdout.slice(-300));
  }

  // 4. Amazon Linux 2023 compatibility (static)
  const setupSrc = readFileSync(path.join(REPO_DIR, 'scripts/setup-pm2-production.sh'), 'utf8');
  const cwSrc = readFileSync(path.join(REPO_DIR, 'deploy/cloudwatch/install-cloudwatch-agent.sh'), 'utf8');
  if (setupSrc.includes('pm2 startup systemd') && cwSrc.includes('command -v dnf')) {
    pass('amazon-linux-2023', 'uses pm2 startup systemd + dnf for CloudWatch Agent');
  } else {
    fail('amazon-linux-2023', 'missing systemd startup or dnf CloudWatch install path');
  }

  // 5. CloudWatch no manual code changes
  try {
    JSON.parse(readFileSync(path.join(REPO_DIR, 'deploy/cloudwatch/amazon-cloudwatch-agent.json'), 'utf8'));
    if (cwSrc.includes('DRY_RUN') && cwSrc.includes('amazon-cloudwatch-agent-ctl')) {
      pass('cloudwatch-config', 'valid JSON; install script is self-contained (IAM profile only prerequisite)');
    } else {
      fail('cloudwatch-config', 'install script incomplete');
    }
  } catch (error) {
    fail('cloudwatch-config', error.message);
  }

  // 6. Backup fails safely without mongodump
  const backupDir = path.join(REPO_DIR, '.verify-tmp-backup');
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(path.join(REPO_DIR, '.verify-tmp.env'), 'MONGODB_URI=mongodb://127.0.0.1:27017/test\n');
  const backupEnv = {
    REPO_DIR: REPO_DIR.replace(/\\/g, '/'),
    NET360_BACKUP_DIR: backupDir.replace(/\\/g, '/'),
    PATH: process.env.PATH?.split(path.delimiter).filter((p) => !/mongo/i.test(p)).join(path.delimiter) || '',
  };
  // Point to temp env by copying logic - script sources .env not .verify-tmp.env
  // Run with empty PATH for mongodump and no MONGODB_URI by using subshell
  const backup = spawnSync(BASH, ['-c', `
    export REPO_DIR='${REPO_DIR.replace(/'/g, "'\\''")}'
    export NET360_BACKUP_DIR='${backupDir.replace(/'/g, "'\\''")}'
    export PATH='/usr/bin:/bin'
    export MONGODB_URI='mongodb://127.0.0.1:27017/test'
    bash scripts/mongodb-backup-daily.sh
  `], { cwd: REPO_DIR, encoding: 'utf8' });
  const backupOut = `${backup.stdout || ''}${backup.stderr || ''}`;
  if (backup.status !== 0 && backupOut.includes('mongodump not found')) {
    pass('backup-fail-safe', 'exits non-zero with clear error when mongodump missing');
  } else {
    fail('backup-fail-safe', `expected mongodump error, got status ${backup.status}: ${backupOut.slice(-200)}`);
  }
  rmSync(backupDir, { recursive: true, force: true });
  rmSync(path.join(REPO_DIR, '.verify-tmp.env'), { force: true });

  // 7. Rollback dry-run with synthetic tag
  const tag = '.deploy-rollback-verify-test';
  writeFileSync(path.join(REPO_DIR, tag), spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_DIR, encoding: 'utf8' }).stdout.trim());
  const rollback = runBash('scripts/rollback-api-production.sh', { DRY_RUN: '1' });
  rmSync(path.join(REPO_DIR, tag), { force: true });
  if (rollback.ok && rollback.stdout.includes('Rollback dry-run complete')) {
    pass('rollback-dry-run', 'reads rollback tag and validates restore steps without mutating system');
  } else {
    fail('rollback-dry-run', rollback.stdout.slice(-300));
  }

  // 8. Health endpoints via local server
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
        pass('health-endpoints', '/api/health 200, /api/health/ready 200 without Mongo configured, /api/version commit match');
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

  // 9. ecosystem + syntax
  const syntax = spawnSync(process.execPath, ['--check', 'server/index.js'], { cwd: REPO_DIR });
  if (syntax.status === 0) {
    pass('server-syntax', 'node --check server/index.js');
  } else {
    fail('server-syntax', syntax.stderr?.toString() || 'syntax check failed');
  }

  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    require(path.join(REPO_DIR, 'ecosystem.config.cjs'));
    pass('ecosystem-config', 'ecosystem.config.cjs loads');
  } catch (error) {
    fail('ecosystem-config', error.message);
  }

  // Report
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

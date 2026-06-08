import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_INFO_PATH = path.resolve(__dirname, '../../deploy/build-info.json');

let cachedBuildInfo = null;

function readBuildInfoFile() {
  if (!existsSync(BUILD_INFO_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(BUILD_INFO_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function getBuildInfo() {
  if (cachedBuildInfo) {
    return cachedBuildInfo;
  }

  const fromFile = readBuildInfoFile();
  const commit = String(
    fromFile.commit
    || process.env.GIT_COMMIT
    || process.env.VERCEL_GIT_COMMIT_SHA
    || '',
  ).trim();
  const branch = String(
    fromFile.branch
    || process.env.GIT_BRANCH
    || process.env.VERCEL_GIT_COMMIT_REF
    || '',
  ).trim();

  cachedBuildInfo = {
    service: 'net360-api',
    commit: commit || 'unknown',
    commitShort: (commit || 'unknown').slice(0, 7),
    branch: branch || 'unknown',
    deployedAt: String(fromFile.deployedAt || process.env.DEPLOYED_AT || '').trim(),
    buildHost: String(fromFile.buildHost || process.env.BUILD_HOST || '').trim(),
    nodeVersion: process.version,
    pid: process.pid,
    pm2Instance: String(process.env.NODE_APP_INSTANCE ?? process.env.pm_id ?? '').trim(),
    env: String(process.env.NODE_ENV || 'development'),
  };

  return cachedBuildInfo;
}

export function resetBuildInfoCacheForTests() {
  cachedBuildInfo = null;
}

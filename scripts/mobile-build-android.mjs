import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { buildAndroidViteEnv } from './merge-android-vite-env.mjs';

const workspaceRoot = process.cwd();

const androidEnv = buildAndroidViteEnv(workspaceRoot);

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')),
      ),
      ...androidEnv,
    },
    shell: false,
  });
  if (result.error) {
    console.error(`[mobile:build] Failed to execute ${command}:`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const nodeCommand = process.execPath;
const viteEntrypoint = path.join(workspaceRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const capacitorCliEntrypoint = path.join(workspaceRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');

run(nodeCommand, ['scripts/validate-mobile-env.mjs']);
run(nodeCommand, [viteEntrypoint, 'build', '--mode', 'android']);
run(nodeCommand, ['scripts/strip-bundled-cdn-media-from-dist.mjs']);
run(nodeCommand, [capacitorCliEntrypoint, 'sync', 'android']);

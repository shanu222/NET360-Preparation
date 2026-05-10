import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const androidDir = resolve(root, 'android');

const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
run(npmCommand, ['run', 'mobile:build']);
run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['clean', 'assembleRelease', 'bundleRelease'], androidDir);

const apkPath = resolve(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const aabPath = resolve(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
console.log(`[android:release] APK: ${apkPath}`);
console.log(`[android:release] AAB: ${aabPath}`);

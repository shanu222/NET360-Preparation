import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const androidDir = resolve(root, 'android');

const quoteWinArg = (value) => {
  const text = String(value);
  if (!/[\s"]/g.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
};

const run = (command, args, cwd = root) => {
  const result = process.platform === 'win32'
    ? spawnSync(
      'cmd.exe',
      ['/d', '/s', '/c', [command, ...args].map((part) => quoteWinArg(part)).join(' ')],
      { cwd, stdio: 'inherit', shell: false },
    )
    : spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) {
    console.error(`[android:release] Failed to run ${command}:`, result.error.message);
    process.exit(1);
  }
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

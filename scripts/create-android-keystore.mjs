import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const androidDir = resolve(root, 'android');
const appDir = resolve(androidDir, 'app');
const keystorePath = resolve(appDir, 'net360-release.jks');
const keystorePropertiesPath = resolve(androidDir, 'keystore.properties');

const keyAlias = String(process.env.ANDROID_KEY_ALIAS || 'net360-release-key').trim();
const storePassword = String(process.env.ANDROID_KEYSTORE_PASSWORD || '').trim();
const keyPassword = String(process.env.ANDROID_KEY_PASSWORD || storePassword).trim();
const dname = String(
  process.env.ANDROID_KEY_DNAME
  || 'CN=NET360 Preparation, OU=Mobile, O=NET360, L=Islamabad, ST=Federal, C=PK',
).trim();
const keytoolCandidates = [
  process.env.KEYTOOL_PATH,
  process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : '',
  process.platform === 'win32' ? 'C:\\Program Files\\Java\\jdk-21\\bin\\keytool.exe' : '',
  process.platform === 'win32' ? 'C:\\Program Files\\Java\\jdk-17.0.2\\bin\\keytool.exe' : '',
  'keytool',
].filter(Boolean);

if (!storePassword) {
  console.error(
    '[android:keystore] Missing ANDROID_KEYSTORE_PASSWORD. ' +
      'Set it in your shell/CI before creating release keystore.',
  );
  process.exit(1);
}

if (!keyPassword) {
  console.error('[android:keystore] Missing ANDROID_KEY_PASSWORD.');
  process.exit(1);
}

mkdirSync(appDir, { recursive: true });

if (!existsSync(keystorePath)) {
  const keytool = keytoolCandidates.find((candidate) => candidate === 'keytool' || existsSync(candidate));
  if (!keytool) {
    console.error(
      '[android:keystore] keytool not found. ' +
        'Set KEYTOOL_PATH or JAVA_HOME so keytool can be executed.',
    );
    process.exit(1);
  }
  const keytoolArgs = [
    '-genkeypair',
    '-v',
    '-storetype',
    'JKS',
    '-keyalg',
    'RSA',
    '-keysize',
    '4096',
    '-validity',
    '10000',
    '-alias',
    keyAlias,
    '-keystore',
    keystorePath,
    '-storepass',
    storePassword,
    '-keypass',
    keyPassword,
    '-dname',
    dname,
  ];

  const generated = spawnSync(keytool, keytoolArgs, { stdio: 'inherit', shell: false });
  if (generated.status !== 0) {
    process.exit(generated.status || 1);
  }
}

writeFileSync(
  keystorePropertiesPath,
  [
    `storeFile=net360-release.jks`,
    `storePassword=${storePassword}`,
    `keyAlias=${keyAlias}`,
    `keyPassword=${keyPassword}`,
    '',
  ].join('\n'),
  'utf8',
);

console.log(`[android:keystore] Keystore ready: ${keystorePath}`);
console.log(`[android:keystore] Properties ready: ${keystorePropertiesPath}`);

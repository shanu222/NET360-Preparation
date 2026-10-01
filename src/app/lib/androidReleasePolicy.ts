export type AndroidUpdateDecision = 'allow' | 'update';

/**
 * Compare the installed Android versionCode with the remote minimum.
 * A failed or empty check allows the app so a temporary outage does not lock anyone out.
 */
export function decideAndroidUpdate(
  installedVersionCode: number,
  remoteMinVersionCode: number | null | undefined,
  versionCheckSucceeded: boolean,
): AndroidUpdateDecision {
  if (!versionCheckSucceeded) return 'allow';
  if (remoteMinVersionCode == null || !Number.isFinite(remoteMinVersionCode) || remoteMinVersionCode <= 0) {
    return 'allow';
  }
  if (!Number.isFinite(installedVersionCode) || installedVersionCode <= 0) return 'allow';
  return installedVersionCode < remoteMinVersionCode ? 'update' : 'allow';
}

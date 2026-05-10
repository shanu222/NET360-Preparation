import { useMemo, useState } from 'react';
import { shouldUseLocalMediaFallback, userGuideVideoUrl } from '../lib/publicMedia';
import { isNativeRuntime, logNativeEvent } from '../lib/nativeDiagnostics';

/**
 * User guide video: primary URL from `userGuideVideoUrl()` (S3). Optional local `<source>` in dev or when
 * `VITE_MEDIA_LOCAL_FALLBACK=true`.
 */
export function Net360UserGuideVideoSection() {
  const remote = userGuideVideoUrl();
  const localFallback = shouldUseLocalMediaFallback() ? '/assets/videos/net360-guide.mp4' : null;
  const [retryCount, setRetryCount] = useState(0);
  const remoteWithRetry = useMemo(() => {
    if (!remote || retryCount <= 0 || !/^https?:\/\//i.test(remote)) return remote;
    const sep = remote.includes('?') ? '&' : '?';
    return `${remote}${sep}android_retry=${retryCount}`;
  }, [remote, retryCount]);

  return (
    <div className="mx-auto mb-6 w-full max-w-[900px] px-1 text-center sm:mb-8">
      <h2 className="text-lg font-semibold tracking-tight text-slate-800 sm:text-xl">
        User Guide – How to Use NET360
      </h2>
      <p className="mt-1 text-sm text-slate-600">Watch this quick guide to get started</p>

      <div className="relative mx-auto mt-4 w-full max-w-full overflow-hidden rounded-xl bg-slate-900 shadow-[0_8px_25px_rgba(0,0,0,0.2)] aspect-video">
        <video
          className="h-full w-full object-contain object-center"
          controls
          preload="metadata"
          playsInline
          onError={() => {
            logNativeEvent('media', 'guide-video-error', {
              remote,
              retryCount,
            }, 'warn');
            if (isNativeRuntime() && retryCount < 2) {
              setRetryCount((current) => current + 1);
            }
          }}
        >
          <source src={remoteWithRetry} type="video/mp4" />
          {localFallback ? <source src={localFallback} type="video/mp4" /> : null}
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
}

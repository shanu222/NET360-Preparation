import { useMemo, useState } from 'react';
import { userGuideVideoUrl } from '../lib/publicMedia';
import { isNativeRuntime, logNativeEvent } from '../lib/nativeDiagnostics';

const BUNDLED_GUIDE_VIDEO = '/assets/videos/net360-guide.mp4';

/**
 * User guide video — bundled at `public/assets/videos/net360-guide.mp4` (Vercel / Android).
 * No S3 / CloudFront dependency.
 */
export function Net360UserGuideVideoSection() {
  const primary = userGuideVideoUrl() || BUNDLED_GUIDE_VIDEO;
  const [retryCount, setRetryCount] = useState(0);
  const srcWithRetry = useMemo(() => {
    if (!primary || retryCount <= 0 || !/^https?:\/\//i.test(primary)) return primary;
    const sep = primary.includes('?') ? '&' : '?';
    return `${primary}${sep}android_retry=${retryCount}`;
  }, [primary, retryCount]);

  const showBundledFallback = srcWithRetry !== BUNDLED_GUIDE_VIDEO;

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
              primary,
              retryCount,
            }, 'warn');
            if (isNativeRuntime() && retryCount < 2) {
              setRetryCount((current) => current + 1);
            }
          }}
        >
          <source src={srcWithRetry} type="video/mp4" />
          {showBundledFallback ? <source src={BUNDLED_GUIDE_VIDEO} type="video/mp4" /> : null}
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
}

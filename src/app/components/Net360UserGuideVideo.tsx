import { useEffect, useRef, useState } from 'react';

const VIDEO_SRC = '/assets/videos/net360-guide.mp4';

/**
 * Login-area user guide video: loads source only after the block is near the viewport (IntersectionObserver).
 * Native controls; preload metadata only; playsInline for mobile.
 */
export function Net360UserGuideVideoSection() {
  const observeTargetRef = useRef<HTMLDivElement>(null);
  const [loadVideo, setLoadVideo] = useState(false);

  useEffect(() => {
    const el = observeTargetRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setLoadVideo(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLoadVideo(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: '100px 0px', threshold: 0.01 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto mb-6 w-full max-w-[900px] px-1 text-center sm:mb-8">
      <h2 className="text-lg font-semibold tracking-tight text-slate-800 sm:text-xl">
        User Guide – How to Use NET360
      </h2>
      <p className="mt-1 text-sm text-slate-600">Watch this quick guide to get started</p>

      <div
        ref={observeTargetRef}
        className="relative mx-auto mt-4 w-full max-w-full overflow-hidden rounded-xl bg-slate-100 shadow-[0_8px_25px_rgba(0,0,0,0.2)] aspect-video"
      >
        {loadVideo ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            controls
            preload="metadata"
            playsInline
          >
            <source src={VIDEO_SRC} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
            Loading video…
          </div>
        )}
      </div>
    </div>
  );
}

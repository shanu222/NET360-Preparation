/** Public folder: `public/assets/videos/net360-guide.mp4` (Vite serves `public/` at site root). */
const VIDEO_SRC = `${import.meta.env.BASE_URL}assets/videos/net360-guide.mp4`;

/**
 * Login-area user guide: native HTML5 video for broad mobile/desktop support.
 * Always mount the element (no IntersectionObserver) so WebViews still get a valid src immediately.
 * playsInline keeps iOS from forcing fullscreen on tap before the user chooses fullscreen.
 */
export function Net360UserGuideVideoSection() {
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
          src={VIDEO_SRC}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
}

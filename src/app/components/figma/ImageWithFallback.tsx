import { useEffect, useState, memo, type ImgHTMLAttributes, type ReactEventHandler } from 'react';
import { logMediaLoadFailure } from '../../lib/publicMediaRuntime';
import { isNativeRuntime, logNativeEvent } from '../../lib/nativeDiagnostics';

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg=='

export type ImageWithFallbackProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Tried after `src` fails (e.g. same-origin file when S3 object is missing or blocked). */
  fallbackSrc?: string;
};

export const ImageWithFallback = memo(function ImageWithFallback(props: ImageWithFallbackProps) {
  const { fallbackSrc, src, alt, style, className, loading, decoding, onError, ...rest } = props
  const [phase, setPhase] = useState<'primary' | 'fallback' | 'error'>('primary')
  const [retryCount, setRetryCount] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setPhase('primary')
    setRetryCount(0)
    setIsLoaded(false)
  }, [src, fallbackSrc])

  const handleError: ReactEventHandler<HTMLImageElement> = (e) => {
    logMediaLoadFailure('img', { url: String(src || '') })
    logNativeEvent('media', 'image-load-failed', {
      src: String(src || ''),
      phase,
      retryCount,
    }, 'warn')
    onError?.(e)
    if (isNativeRuntime() && phase === 'primary' && retryCount < 2) {
      setRetryCount((current) => current + 1)
      return
    }
    if (phase === 'primary' && fallbackSrc) {
      setPhase('fallback')
      return
    }
    setPhase('error')
  }

  const activeSrcBase = phase === 'fallback' && fallbackSrc ? fallbackSrc : String(src || '')
  const activeSrc = (() => {
    if (!activeSrcBase) return ''
    if (!isNativeRuntime() || retryCount <= 0) return activeSrcBase
    if (!/^https?:\/\//i.test(activeSrcBase)) return activeSrcBase
    const sep = activeSrcBase.includes('?') ? '&' : '?'
    return `${activeSrcBase}${sep}android_retry=${retryCount}`
  })()

  useEffect(() => {
    if (!isNativeRuntime() || !activeSrc || !/^https?:\/\//i.test(activeSrc)) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = activeSrc;
  }, [activeSrc]);

  return phase === 'error' ? (
    <div
      className={`inline-block bg-gray-100 text-center align-middle ${className ?? ''}`}
      style={style}
    >
      <div className="flex items-center justify-center w-full h-full">
        <img
          src={ERROR_IMG_SRC}
          alt="Error loading image"
          width={88}
          height={88}
          loading={loading ?? 'lazy'}
          decoding={decoding ?? 'async'}
          {...rest}
          data-original-url={src}
        />
      </div>
    </div>
  ) : (
    <img
      src={activeSrc}
      alt={alt}
      className={`${className ?? ''} transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
      style={style}
      loading={loading ?? 'lazy'}
      decoding={decoding ?? 'async'}
      {...rest}
      onLoad={() => {
        setIsLoaded(true)
        logNativeEvent('media', 'image-load-success', { src: activeSrc, phase, retryCount })
      }}
      onError={handleError}
    />
  )
})

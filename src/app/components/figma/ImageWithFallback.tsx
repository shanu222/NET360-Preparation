import React, { useEffect, useState } from 'react'

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg=='

export type ImageWithFallbackProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  /** Tried after `src` fails (e.g. same-origin file when S3 object is missing or blocked). */
  fallbackSrc?: string;
};

export function ImageWithFallback(props: ImageWithFallbackProps) {
  const { fallbackSrc, src, alt, style, className, loading, decoding, onError, ...rest } = props
  const [phase, setPhase] = useState<'primary' | 'fallback' | 'error'>('primary')

  useEffect(() => {
    setPhase('primary')
  }, [src, fallbackSrc])

  const handleError: React.ReactEventHandler<HTMLImageElement> = (e) => {
    onError?.(e)
    if (phase === 'primary' && fallbackSrc) {
      setPhase('fallback')
      return
    }
    setPhase('error')
  }

  const activeSrc =
    phase === 'fallback' && fallbackSrc ? fallbackSrc : String(src || '')

  return phase === 'error' ? (
    <div
      className={`inline-block bg-gray-100 text-center align-middle ${className ?? ''}`}
      style={style}
    >
      <div className="flex items-center justify-center w-full h-full">
        <img
          src={ERROR_IMG_SRC}
          alt="Error loading image"
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
      className={className}
      style={style}
      loading={loading ?? 'lazy'}
      decoding={decoding ?? 'async'}
      {...rest}
      onError={handleError}
    />
  )
}

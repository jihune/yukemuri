'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { hotelImageCandidates } from '@/lib/hotel-images';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'onError' | 'onLoad'> & {
  src: string;
  alt: string;
  alternatives?: string[];
  onSourceChange?: (src:string)=>void;
};

const RETRY_DELAYS = [1000, 2000, 4000];

function RetryingImage({ src, alternatives, alt, className, onSourceChange, ...props }: Props) {
  const candidates = hotelImageCandidates(src, alternatives);
  const [requestSrc, setRequestSrc] = useState(candidates[0] ?? '');
  const [failed, setFailed] = useState(candidates.length === 0);
  const [revision, setRevision] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  const attempts = useRef(0);
  const candidate = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(()=>{onSourceChange?.(requestSrc)},[requestSrc,onSourceChange]);

  const clearRetry = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const retry = useCallback(() => {
    if (timer.current !== null) return;
    if (candidate.current + 1 < candidates.length) {
      candidate.current += 1;
      attempts.current = 0;
      setRequestSrc(candidates[candidate.current]);
      setRevision(v => v + 1);
      return;
    }
    const delay = RETRY_DELAYS[attempts.current];
    if (delay === undefined) {
      setFailed(true);
      return;
    }

    timer.current = setTimeout(() => {
      timer.current = null;
      attempts.current += 1;
      // Remount the image for a bounded retry.
      // Leave source queries intact; appending parameters can break CDN URLs.
      setRequestSrc(candidates[candidate.current]);
      setRevision(v => v + 1);
    }, delay);
  }, [src, alternatives]); // Candidates are deterministic for these props.

  useEffect(() => {
    // Also recover images that failed before hydration attached onError.
    if (image.current?.complete && image.current.naturalWidth === 0) retry();
    return clearRetry;
  }, [clearRetry, retry]);

  if (failed) {
    return (
      <span className={`image-unavailable ${className ?? ''}`} role="img" aria-label={alt}>
        <ImageOff size={22} aria-hidden="true" />
        <span>사진을 불러오지 못했어요</span>
      </span>
    );
  }

  return (
    <img
      {...props}
      ref={image}
      key={revision}
      src={requestSrc}
      alt={alt}
      className={className}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={retry}
      onLoad={clearRetry}
    />
  );
}

export default function RetryImage(props: Props) {
  // A different accommodation starts with a fresh retry budget and cancels old timers.
  return <RetryingImage key={[props.src,...(props.alternatives ?? [])].join('|')} {...props} />;
}

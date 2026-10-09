import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { photo } from '../lib/img';

/** Full-screen photo viewer: arrows, keyboard, swipe and a thumbnail strip. */
export function PhotoViewer({ images, start = 0, title, onClose }: { images: string[]; start?: number; title: string; onClose: () => void }) {
  const [i, setI] = useState(start);
  const touchX = useRef<number | null>(null);
  const n = images.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rendered on <body> so transformed ancestors (hovering cards) can't trap the fixed overlay
  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`${title} photos`} onClick={onClose}>
      <div className="viewer-top" onClick={(e) => e.stopPropagation()}>
        <span>
          <b>{title}</b> · {i + 1} / {n}
        </span>
        <button className="viewer-btn" onClick={onClose} aria-label="Close photos">
          <X size={20} />
        </button>
      </div>
      <div
        className="viewer-stage"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        {n > 1 && (
          <button className="viewer-btn nav prev" onClick={() => go(-1)} aria-label="Previous photo">
            <ChevronLeft size={26} />
          </button>
        )}
        <img key={images[i]} src={photo(images[i], 1600)} alt={`${title} — photo ${i + 1} of ${n}`} />
        {n > 1 && (
          <button className="viewer-btn nav next" onClick={() => go(1)} aria-label="Next photo">
            <ChevronRight size={26} />
          </button>
        )}
      </div>
      {n > 1 && (
        <div className="viewer-thumbs" onClick={(e) => e.stopPropagation()}>
          {images.map((src, k) => (
            <button key={src} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}>
              <img src={photo(src, 200)} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

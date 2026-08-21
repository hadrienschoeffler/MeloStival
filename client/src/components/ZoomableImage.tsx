import { useEffect, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import { createPortal } from "react-dom";

interface ZoomableImageProps {
  src: string;
  alt: string;
  gallery?: Array<{ src: string; alt: string }>;
  initialIndex?: number;
}

export function ZoomableImage({ src, alt, gallery, initialIndex = 0 }: ZoomableImageProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const images = gallery?.length ? gallery : [{ src, alt }];
  const activeImage = images[activeIndex] ?? images[0];

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft" && images.length > 1) selectImage(activeIndex - 1);
      if (event.key === "ArrowRight" && images.length > 1) selectImage(activeIndex + 1);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeIndex, images.length, open]);

  function close() {
    setOpen(false);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }

  function selectImage(index: number) {
    setActiveIndex((index + images.length) % images.length);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }

  function changeZoom(nextZoom: number) {
    const clampedZoom = Math.min(4, Math.max(1, nextZoom));
    setZoom(clampedZoom);
    if (clampedZoom === 1) setPosition({ x: 0, y: 0 });
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
  }

  function startDrag(event: PointerEvent<HTMLImageElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  }

  function drag(event: PointerEvent<HTMLImageElement>) {
    if (!dragStart.current) return;
    setPosition({
      x: dragStart.current.originX + event.clientX - dragStart.current.x,
      y: dragStart.current.originY + event.clientY - dragStart.current.y,
    });
  }

  function stopDrag() {
    dragStart.current = null;
  }

  return (
    <>
      <button className="zoomable-image-trigger" type="button" onClick={() => {
        setActiveIndex(initialIndex);
        setOpen(true);
      }} aria-label={`Agrandir : ${alt}`}>
        <img src={src} alt={alt} />
        <span aria-hidden="true">Agrandir</span>
      </button>

      {open && createPortal(
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={activeImage.alt} onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <div className="lightbox-toolbar">
            <button type="button" onClick={() => changeZoom(zoom - 0.25)} disabled={zoom === 1} aria-label="Dézoomer">−</button>
            <output>{Math.round(zoom * 100)} %</output>
            <button type="button" onClick={() => changeZoom(zoom + 0.25)} disabled={zoom === 4} aria-label="Zoomer">+</button>
            <button type="button" onClick={() => changeZoom(1)}>Réinitialiser</button>
            <button type="button" onClick={close} aria-label="Fermer">Fermer</button>
          </div>
          <div className="lightbox-stage" onWheel={handleWheel}>
            {images.length > 1 && (
              <button className="lightbox-arrow previous" type="button" onClick={() => selectImage(activeIndex - 1)} aria-label="Image précédente">←</button>
            )}
            <img
              src={activeImage.src}
              alt={activeImage.alt}
              draggable={false}
              className={`is-draggable ${zoom > 1 ? "is-zoomed" : ""}`}
              style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})` }}
              onPointerDown={startDrag}
              onPointerMove={drag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            />
            {images.length > 1 && (
              <button className="lightbox-arrow next" type="button" onClick={() => selectImage(activeIndex + 1)} aria-label="Image suivante">→</button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

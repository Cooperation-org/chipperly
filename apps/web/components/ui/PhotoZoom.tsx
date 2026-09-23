'use client';

import { useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './PhotoZoom.module.css';

export interface PhotoZoomProps {
  url: string;
  name: string;
  /** The small tile that opens the viewer. */
  children: ReactNode;
}

/**
 * Tap a photo to see it large. A native modal <dialog> gives Escape, focus
 * trapping and the backdrop for free; a tap on the backdrop (the dialog box
 * itself, outside the image) closes it, and so does the X.
 */
export function PhotoZoom({ url, name, children }: PhotoZoomProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={styles.trigger} aria-label={`View photo: ${name}`} onClick={() => dialogRef.current?.showModal()}>
        {children}
      </button>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-label={name}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, images served by our API */}
        <img src={url} alt={name} className={styles.img} />
        <button type="button" className={styles.close} aria-label="Close" onClick={() => dialogRef.current?.close()}>
          <Icon name="close" size={24} />
        </button>
      </dialog>
    </>
  );
}

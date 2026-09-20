'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import styles from './QrCode.module.css';

export interface QrCodeProps {
  value: string;
  size?: number;
}

/** Renders `value` (typically a link) as a scannable QR code -- any phone's stock camera app opens the link, no in-app scanner needed. */
export function QrCode({ value, size = 200 }: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(value, { width: size, margin: 1 }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) return <div className={styles.placeholder} style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not a static-export asset
  return <img src={dataUrl} alt="QR code" width={size} height={size} className={styles.code} />;
}

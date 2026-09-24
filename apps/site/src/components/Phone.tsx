import Image, { type StaticImageData } from 'next/image';

// A product screenshot in a simple device frame. Screens are 1170x2532
// captures (scripts/capture-screens.mjs).
export function Phone({ src, alt, priority, className }: { src: StaticImageData; alt: string; priority?: boolean; className?: string }) {
  return (
    <div className={`phone ${className ?? ''}`}>
      <Image src={src} alt={alt} priority={priority} sizes="(max-width: 700px) 70vw, 320px" placeholder="blur" />
    </div>
  );
}

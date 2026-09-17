import { spawn } from 'node:child_process';
import sharp from 'sharp';

export interface ProcessedImage {
  readonly buffer: Buffer;
  readonly width: number;
  readonly height: number;
  readonly content_type: 'image/webp';
}

/** sharp: rotate to upright, fit inside 1600x1600 without upscaling, WebP q80, EXIF stripped by default. */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const buffer = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const { width, height } = await sharp(buffer).metadata();
  return { buffer, width: width ?? 0, height: height ?? 0, content_type: 'image/webp' };
}

/** ffmpeg: scale to fit 720p without upscaling, H.264/AAC, faststart. Exact args from technical-plan.md 7b. */
export function processVideo(inPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i',
      inPath,
      '-vf',
      "scale='min(iw,-2)':'min(720,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '26',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-y',
      outPath,
    ];
    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

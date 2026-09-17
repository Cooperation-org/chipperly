import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getVideoDurationMs, processVideo } from '../src/media/pipeline.js';

describe('media pipeline: video duration', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'chipperly-pipeline-'));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('transcodes a synthetic clip and reports its duration in ms', async () => {
    const inPath = path.join(tmpDir, 'in.mp4');
    const outPath = path.join(tmpDir, 'out.mp4');
    // 2s of test pattern + tone, no external fixture needed.
    const gen = spawnSync('ffmpeg', [
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=64x64:rate=10',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=2',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-y',
      inPath,
    ]);
    expect(gen.status).toBe(0);

    const result = await processVideo(inPath, outPath);
    expect(result.duration_ms).not.toBeNull();
    expect(result.duration_ms!).toBeGreaterThan(1500);
    expect(result.duration_ms!).toBeLessThan(2500);
  });

  it('resolves null instead of throwing when ffprobe cannot read the file', async () => {
    const bogusPath = path.join(tmpDir, 'does-not-exist.mp4');
    await expect(getVideoDurationMs(bogusPath)).resolves.toBeNull();
  });
});

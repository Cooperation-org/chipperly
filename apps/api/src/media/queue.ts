import PQueue from 'p-queue';

/** ffmpeg is CPU-heavy on a shared VM; one video transcode at a time. */
export const videoQueue = new PQueue({ concurrency: 1 });

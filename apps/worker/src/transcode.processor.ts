import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { Logger } from "@nestjs/common";
import ffmpeg from "fluent-ffmpeg";
import * as ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import * as path from "path";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { ITranscodeResult } from "@musical/shared-types";

import { KmsService } from "./kms/kms.service";
import { StorageService } from "./storage/storage.service";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface TranscodeJobData {
  songId: string;
  originalFilePath: string;
  uploadedBy: string;
  checksum: string;
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

@Processor("transcode-queue", {
  concurrency: 2, // tránh overload CPU
})
export class TranscodeProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscodeProcessor.name);

  constructor(
    private readonly kmsService: KmsService,
    private readonly storageService: StorageService,
  ) {
    super();
  }

  async process(job: Job<TranscodeJobData>): Promise<ITranscodeResult> {
    const { songId, originalFilePath, uploadedBy, checksum } = job.data;

    // ================= VALIDATE =================
    if (!songId || !originalFilePath || !uploadedBy || !checksum) {
      this.logger.error(`Invalid job data: ${JSON.stringify(job.data)}`);
      throw new Error("Invalid job data");
    }

    this.logger.log(`🎵 START JOB: ${songId}`);

    let duration = 0;
    let coverUrl: string | null = null;

    // ================= STEP 1: METADATA =================
    try {
      const mm = await import("music-metadata");
      const metadata = await mm.parseFile(originalFilePath);

      duration = Math.round(metadata.format.duration || 0);

      const coverData = metadata.common.picture?.[0];

      if (coverData) {
        const coverPath = path.join(
          process.cwd(),
          "uploads",
          `${songId}-${Date.now()}-cover.jpg`,
        );

        await sharp(coverData.data)
          .resize(500, 500)
          .jpeg({ quality: 80 })
          .toFile(coverPath);

        coverUrl = await this.storageService.uploadFile(
          coverPath,
          `library/${checksum}/cover.jpg`,
        );

        // cleanup cover
        await fs.unlink(coverPath).catch(() => {});
      }
    } catch (error) {
      this.logger.warn(`Metadata fail: ${toErrorMessage(error)}`);
    }

    // ================= STEP 2: PREPARE =================
    const outputDir = path.join(
      process.cwd(),
      "uploads",
      "hls",
      `${songId}-${randomUUID()}`,
    );

    await fs.mkdir(outputDir, { recursive: true });

    this.logger.log(`🔑 Generating key...`);
    const keyData = await this.kmsService.generateKey(songId, uploadedBy);

    const keyBuffer = Buffer.from(keyData.key);
    const ivHex = Buffer.from(keyData.iv).toString("hex");

    const keyFilePath = path.join(outputDir, "encryption.key");
    const keyInfoPath = path.join(outputDir, "encryption.keyinfo");

    await fs.writeFile(keyFilePath, keyBuffer);

    const keyUrl = `http://localhost:9999/api/v1/songs/${songId}/key`;
    const keyInfoContent = `${keyUrl}\n${keyFilePath}\n${ivHex}`;

    await fs.writeFile(keyInfoPath, keyInfoContent);

    // ================= STEP 3: FFMPEG =================
    const masterPlaylistPath = path.join(outputDir, "master.m3u8");

    return new Promise<ITranscodeResult>((resolve, reject) => {
      ffmpeg(originalFilePath)
        .outputOptions([
          "-vn",
          "-c:a aac",
          "-b:a 128k",
          "-hls_time 4",
          "-hls_list_size 0",
          `-hls_key_info_file ${keyInfoPath}`,
          `-hls_segment_filename ${path.join(outputDir, "segment_%03d.ts")}`,
        ])
        .output(masterPlaylistPath)

        // DEBUG
        .on("start", (cmd) => {
          this.logger.log(`FFmpeg: ${cmd}`);
        })

        .on("progress", (p) => {
          this.logger.log(`Progress: ${p.percent?.toFixed(2)}%`);
        })

        .on("end", () => {
          void (async () => {
            this.logger.log(`🚀 Uploading to storage...`);

            try {
              const masterUrl = await this.retry(() =>
                this.storageService.uploadDirectory(
                  outputDir,
                  `library/${checksum}/hls`,
                ),
              );

              // cleanup
              await fs.unlink(originalFilePath).catch(() => {});
              await fs
                .rm(outputDir, { recursive: true, force: true })
                .catch(() => {});

              this.logger.log(`✅ DONE: ${songId}`);

              resolve({
                success: true,
                songId,
                duration,
                hlsMasterPath: masterUrl,
                hlsKeyId: keyData.key_id,
                coverUrl,
              });
            } catch (error) {
              this.logger.error(`Upload fail: ${toErrorMessage(error)}`);
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          })();
        })

        .on("error", (error) => {
          void (async () => {
            this.logger.error(`❌ FFMPEG FAIL: ${error.message}`);

            await this.safeCleanup(originalFilePath, outputDir);

            reject(error);
          })();
        })

        .run();
    });
  }

  // ================= HELPER =================

  private async safeCleanup(file: string, dir: string) {
    await fs.unlink(file).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  private async retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) {
          throw error instanceof Error ? error : new Error(String(error));
        }
        this.logger.warn(`Retry ${i + 1}...`);
      }
    }

    throw new Error("Retry exhausted");
  }
}

import { http } from "@/lib/api/http";

export type ReportKind = "ISSUE" | "FEEDBACK";

export const REPORT_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
export const REPORT_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export function getReportAttachmentContentType(file: File) {
  if (file.name.toLowerCase().endsWith(".mov")) return "video/quicktime";
  return file.type.toLowerCase();
}

type UploadResponse = {
  attachment: { id: string };
  uploadUrl: string;
};

export async function getFileChecksum(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function uploadReportAttachment(file: File, checksum?: string) {
  const contentType = getReportAttachmentContentType(file);
  const kind = REPORT_IMAGE_TYPES.has(contentType) ? "IMAGE" : "VIDEO";
  const { data } = await http.post<UploadResponse>(
    "/reports/attachments/uploads",
    {
      kind,
      filename: file.name,
      contentType,
      checksum: checksum ?? (await getFileChecksum(file)),
      sizeBytes: file.size,
    },
  );

  const upload = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!upload.ok) throw new Error("REPORT_ATTACHMENT_UPLOAD_FAILED");

  await http.post(`/reports/attachments/${data.attachment.id}/finalize`);
  return data.attachment.id;
}

export function createReport(input: {
  type: ReportKind;
  content: string;
  attachmentIds: string[];
  pageUrl: string;
  clientContext: Record<string, string>;
}) {
  return http.post("/reports", input);
}

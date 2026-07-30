import { UPLOAD_LIMITS } from "./config.ts";

export function validateImageHeader(bytes: Uint8Array, mime: string) {
  if (!UPLOAD_LIMITS.acceptedMimeTypes.includes(mime as never)) return false;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.slice(0, 8).every((value, i) => value === [137, 80, 78, 71, 13, 10, 26, 10][i]);
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return (mime === "image/jpeg" && jpeg) || (mime === "image/png" && png) || (mime === "image/webp" && webp);
}

export function isSafeUpload(file: { size: number; type: string }, header: Uint8Array) {
  return file.size > 0 && file.size <= UPLOAD_LIMITS.maxBytes && validateImageHeader(header, file.type);
}

import { databaseRead, databaseWrite } from "./database";

// Only embedded raster images are accepted in imports and network messages.
export function validImageData(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 4_000_000 &&
    /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(
      value,
    )
  );
}
export async function cachedImage(id: string) {
  try {
    const data = await databaseRead<string | undefined>("images", id);
    return validImageData(data) ? data : undefined;
  } catch {
    return undefined;
  }
}
export async function cacheImage(id: string, data: string) {
  if (!validImageData(data)) throw new Error("Invalid image received.");
  // Cache failure must not prevent a player from seeing a received image.
  try {
    await databaseWrite("images", data, id);
  } catch {
    /* Storage may be full or unavailable. */
  }
}
export async function compressImage(
  file: File,
): Promise<{ id: string; data: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Choose an image smaller than 25 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error(
        "This image format cannot be read by your browser. Try PNG, JPEG, or WebP.",
      );
    }
    const scale = Math.min(
      1,
      800 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image processing is not available in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.78);
    if (!validImageData(data))
      throw new Error("This image is too large after compression.");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(data),
    );
    const id = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return { id, data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

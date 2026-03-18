import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { put } from "@vercel/blob";

const IMAGES_DIR = path.join(process.cwd(), "resources", "images");

function slugFromFilename(filename) {
  return filename.replace(/\.[^.]+$/, "").toLowerCase();
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("Missing BLOB_READ_WRITE_TOKEN in environment.");
  }

  const files = await fs.readdir(IMAGES_DIR);
  const imageFiles = files.filter((file) => /\.(png|jpg|jpeg|webp)$/i.test(file));

  console.log("Uploading avatars from:", IMAGES_DIR);
  console.log("");

  const uploaded = [];

  for (const file of imageFiles) {
    const fullPath = path.join(IMAGES_DIR, file);
    const originalBuffer = await fs.readFile(fullPath);
    const originalKB = (originalBuffer.length / 1024).toFixed(1);

    const webpBuffer = await sharp(originalBuffer)
      .rotate()
      .resize(256, 256, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 6, alphaQuality: 80 })
      .toBuffer();

    const compressedKB = (webpBuffer.length / 1024).toFixed(1);
    const baseName = slugFromFilename(file);
    const blobPath = `avatars/${baseName}.webp`;

    const blob = await put(blobPath, webpBuffer, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
      token,
    });

    uploaded.push({
      original: file,
      originalKB,
      compressedKB,
      url: blob.url,
      baseName,
    });
  }

  console.table(
    uploaded.map((item) => ({
      file: item.original,
      original_kb: item.originalKB,
      compressed_kb: item.compressedKB,
      url: item.url,
    }))
  );

  console.log("\n-- SQL UPDATE statements --\n");

  for (const item of uploaded) {
    if (item.baseName === "default") continue;

    console.log(
      `UPDATE profiles SET picture = '${item.url}' WHERE LOWER(REPLACE(name, ' ', '_')) = '${item.baseName}';`
    );
  }

  const defaultItem = uploaded.find((item) => item.baseName === "default");
  if (defaultItem) {
    console.log(
      `\nALTER TABLE profiles ALTER COLUMN picture SET DEFAULT '${defaultItem.url}';`
    );
  }
}

main().catch((err) => {
  console.error("Batch upload failed:", err.message);
  process.exit(1);
});
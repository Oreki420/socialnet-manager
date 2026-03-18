import Busboy from "busboy";
import sharp from "sharp";
import crypto from "node:crypto";
import { put } from "@vercel/blob";

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: "10mb",
  },
};

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    let fileBuffer = null;
    let mimeType = "";
    let filename = "";

    bb.on("file", (_fieldname, file, info) => {
      mimeType = info.mimeType;
      filename = info.filename;

      const chunks = [];
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on("finish", () => {
      resolve({ fileBuffer, mimeType, filename });
    });

    bb.on("error", reject);
    req.pipe(bb);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fileBuffer, mimeType, filename } = await parseMultipart(req);

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!mimeType.startsWith("image/")) {
      return res.status(415).json({ error: "Only image uploads are allowed" });
    }

    const processedBuffer = await sharp(fileBuffer)
      .rotate()
      .resize(256, 256, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 6, alphaQuality: 80 })
      .toBuffer();

    const safeName = filename
      ? filename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()
      : "avatar";

    const blobPath = `avatars/${safeName}-${crypto.randomUUID()}.webp`;

    const blob = await put(blobPath, processedBuffer, {
      access: "public",
      contentType: "image/webp",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return res.status(200).json({ url: blob.url });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Upload failed",
    });
  }
}
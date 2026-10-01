import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPPORTED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type SupportedImageMime = keyof typeof SUPPORTED_IMAGE_TYPES;

let supabaseAdmin: SupabaseClient | null = null;

function getStorageConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    "statusfly-products";

  if (!url || !secretKey) {
    throw new Error(
      "Supabase storage is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }

  return { url, secretKey, bucket };
}

function getSupabaseAdmin() {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const { url, secretKey } = getStorageConfig();

  supabaseAdmin = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseAdmin;
}

function getExtension(mimeType: string) {
  return SUPPORTED_IMAGE_TYPES[mimeType as SupportedImageMime] ?? null;
}

export function assertSupportedImageBuffer(
  buffer: Buffer,
  mimeType: string,
) {
  const type = mimeType as SupportedImageMime;

  if (!getExtension(type)) {
    throw new Error("Only JPG, PNG or WebP images are supported.");
  }

  if (type === "image/jpeg") {
    if (
      buffer.length < 3 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[2] !== 0xff
    ) {
      throw new Error("The uploaded JPEG image is invalid.");
    }

    return;
  }

  if (type === "image/png") {
    const signature = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);

    if (
      buffer.length < signature.length ||
      !buffer.subarray(0, signature.length).equals(signature)
    ) {
      throw new Error("The uploaded PNG image is invalid.");
    }

    return;
  }

  if (
    buffer.length < 12 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("The uploaded WebP image is invalid.");
  }
}

export interface StoredProductImage {
  storageKey: string;
  publicUrl: string;
}

export async function uploadProductImage(
  productPageId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<StoredProductImage> {
  const extension = getExtension(mimeType);

  if (!extension) {
    throw new Error("Only JPG, PNG or WebP images are supported.");
  }

  assertSupportedImageBuffer(buffer, mimeType);

  const { bucket } = getStorageConfig();
  const storageKey =
    `product-pages/${productPageId}/` +
    `${randomBytes(12).toString("hex")}.${extension}`;

  const { error } = await getSupabaseAdmin()
    .storage
    .from(bucket)
    .upload(storageKey, buffer, {
      cacheControl: "31536000",
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    console.error("Supabase image upload error:", error);

    throw new Error("Unable to upload product image.");
  }

  const { data } = getSupabaseAdmin()
    .storage
    .from(bucket)
    .getPublicUrl(storageKey);

  if (!data.publicUrl) {
    await deleteStoredProductImage(storageKey);
    throw new Error("Unable to create the public product image URL.");
  }

  return {
    storageKey,
    publicUrl: data.publicUrl,
  };
}

export async function deleteStoredProductImage(
  storageKey: string,
) {
  const { bucket } = getStorageConfig();

  const { error } = await getSupabaseAdmin()
    .storage
    .from(bucket)
    .remove([storageKey]);

  if (error) {
    console.error("Supabase image deletion error:", error);
  }
}

import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import {
  createProductPage,
  getPublishedProductPageBySlug,
  getProductPageByEditToken,
  publishProductPageByEditToken,
  updateProductPageByEditToken,
  type ProductPageAvailability,
  type UpdateProductPageInput,
} from "../services/productPages.js";
import {
  listProductPageItems,
  getProductPageItemForEditToken,
  replaceProductPageItemImages,
  type ProductPageItemInput,
  type ProductPageItemOption,
} from "../services/productPageCollections.js";
import { hashPrivateEditToken } from "../services/productPages.js";
import {
  deleteAllProductPageImages,
  listProductPageImages,
  addProductPageImage,
  type ProductPageImage,
} from "../services/productPageImages.js";
import {
  deleteStoredProductImage,
  uploadProductImage,
} from "../services/supabaseStorage.js";

const router = Router();

const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_COLLECTION_ITEMS = 10;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_COLLECTION_OPTION_TOKEN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} &'()./+_%+-]{0,39}$/u;

const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 3,
    fileSize: MAX_PRODUCT_IMAGE_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        file.mimetype,
      )
    ) {
      callback(
        new Error("Only JPG, PNG or WebP images are supported."),
      );
      return;
    }

    callback(null, true);
  },
});


const collectionImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 3, fileSize: MAX_PRODUCT_IMAGE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(new Error("Only JPG, PNG or WebP images are supported."));
      return;
    }
    callback(null, true);
  },
});

const imageUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(429).json({ error: "Too many image upload attempts. Please wait and try again." });
  },
});

function withImageUploadErrorHandling(upload: RequestHandler): RequestHandler {
  return (req, res, next) => {
    upload(req, res, (error?: unknown) => {
      if (!error) {
        next();
        return;
      }

      res.setHeader("Cache-Control", "no-store");

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "Each image must be 10MB or smaller." });
          return;
        }

        if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
          res.status(400).json({ error: "You can upload a maximum of 3 images per request." });
          return;
        }

        res.status(400).json({ error: "Invalid image upload request." });
        return;
      }

      if (error instanceof Error && error.message === "Only JPG, PNG or WebP images are supported.") {
        res.status(400).json({ error: error.message });
        return;
      }

      console.error("Image upload middleware failed:", error instanceof Error ? error.name : "UnknownError");
      res.status(500).json({ error: "Unable to process uploaded images." });
    });
  };
}

function isInvalidImageError(error: unknown): error is Error {
  return error instanceof Error && (
    error.message === "Only JPG, PNG or WebP images are supported." ||
    error.message.startsWith("The uploaded ")
  );
}

const VALID_AVAILABILITIES: ProductPageAvailability[] = [
  "available",
  "low_stock",
  "sold_out",
  "coming_soon",
  "preorder",
];

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

function isSafeCollectionOptionToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 40 && SAFE_COLLECTION_OPTION_TOKEN.test(value.trim());
}

function isValidSellingPoints(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 3 &&
    value.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0 &&
        item.trim().length <= 120,
    )
  );
}

function isValidPrice(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 1_000_000_000
  );
}

function isValidWhatsAppNumber(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateProductPageItems(value: unknown): ProductPageItemInput[] | string {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_COLLECTION_ITEMS) {
    return "A collection must contain between 2 and 10 items.";
  }

  const normalized: ProductPageItemInput[] = [];
  const seenIds = new Set<string>();
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return `Item ${index + 1} has invalid details.`;
    }
    const item = raw as Record<string, unknown>;
    let id: string | undefined;
    if (item.id !== undefined) {
      if (typeof item.id !== "string" || !UUID_PATTERN.test(item.id)) {
        return `Item ${index + 1} has an invalid identifier. Save the collection again and retry.`;
      }
      id = item.id;
    }
    if (id && seenIds.has(id)) return "Each collection item must be unique.";
    if (id) seenIds.add(id);
    if (!isNonEmptyString(item.productName, 120)) return `Enter a name for item ${index + 1}.`;
    if (!isNonEmptyString(item.category, 50)) return `Choose a category for item ${index + 1}.`;
    if (!isNonEmptyString(item.description, 1000)) return `Enter a description for item ${index + 1}.`;
    if (!isValidPrice(item.priceNaira)) return `Enter a valid price for item ${index + 1}.`;
    if (item.originalPriceNaira !== undefined && item.originalPriceNaira !== null && !isValidPrice(item.originalPriceNaira)) {
      return `Enter a valid original price for item ${index + 1}.`;
    }
    if (item.originalPriceNaira !== undefined && item.originalPriceNaira !== null && item.originalPriceNaira <= item.priceNaira) {
      return `The original price for item ${index + 1} must exceed its current price.`;
    }
    if (!Array.isArray(item.sellingPoints) || item.sellingPoints.length > 3 || !item.sellingPoints.every((point) => typeof point === "string" && point.trim().length <= 120)) {
      return `Item ${index + 1} can have up to 3 selling points.`;
    }
    if (typeof item.availability !== "string" || !VALID_AVAILABILITIES.includes(item.availability as ProductPageAvailability)) {
      return `Choose a valid availability for item ${index + 1}.`;
    }
    if (item.promotionText !== undefined && item.promotionText !== null && !isNonEmptyString(item.promotionText, 180)) {
      return `The promotion for item ${index + 1} must be 180 characters or fewer.`;
    }
    if (item.promotionEndAt !== undefined && item.promotionEndAt !== null && item.promotionEndAt !== "" && !isValidDateOnly(item.promotionEndAt)) {
      return `The promotion date for item ${index + 1} is invalid.`;
    }

    const rawOptions = item.options ?? [];
    if (!Array.isArray(rawOptions) || rawOptions.length > 3) return `Item ${index + 1} can have up to 3 options.`;
    const options: ProductPageItemOption[] = [];
    const optionNames = new Set<string>();
    for (const optionValue of rawOptions) {
      if (!optionValue || typeof optionValue !== "object" || Array.isArray(optionValue)) return `An option for item ${index + 1} is invalid.`;
      const option = optionValue as Record<string, unknown>;
      if (!isSafeCollectionOptionToken(option.name) || !Array.isArray(option.values) || option.values.length < 1 || option.values.length > 10 || !option.values.every(isSafeCollectionOptionToken)) {
        return `Each option for item ${index + 1} needs a short, valid attribute name and 1–10 valid single-value choices.`;
      }
      const name = option.name.trim();
      const normalizedName = name.toLocaleLowerCase();
      if (optionNames.has(normalizedName)) return `Option names for item ${index + 1} must be unique.`;
      optionNames.add(normalizedName);
      const values = option.values.map((choice) => (choice as string).trim());
      if (new Set(values.map((choice) => choice.toLocaleLowerCase())).size !== values.length) {
        return `Option values for item ${index + 1} must not repeat.`;
      }
      options.push({ name, values });
    }

    normalized.push({
      id,
      productName: item.productName.trim(),
      category: item.category.trim(),
      description: item.description.trim(),
      sellingPoints: item.sellingPoints.map((point) => point.trim()).filter(Boolean),
      priceNaira: item.priceNaira,
      originalPriceNaira: item.originalPriceNaira ?? null,
      promotionText: typeof item.promotionText === "string" ? item.promotionText.trim() || null : null,
      promotionEndAt: typeof item.promotionEndAt === "string" && item.promotionEndAt ? item.promotionEndAt : null,
      availability: item.availability as ProductPageAvailability,
      options,
    });
  }
  return normalized;
}

function validateProductPageInput(body: unknown): UpdateProductPageInput | string {
  const source = (body ?? {}) as Record<string, unknown>;
  const requestedPageType = source.pageType;
  if (requestedPageType !== undefined && requestedPageType !== "single" && requestedPageType !== "collection") {
    return "Invalid page type.";
  }
  const items = requestedPageType === "collection" ? validateProductPageItems(source.items) : undefined;
  if (typeof items === "string") return items;
  if (requestedPageType === "collection" && !isNonEmptyString(source.collectionTitle, 140)) {
    return "Enter a title for your collection.";
  }
  const firstItem = requestedPageType === "collection" && Array.isArray(items) ? items[0] : undefined;
  const {
    brandName,
    whatsappNumber,
    deliveryInfo,
    productName: rawProductName,
    category: rawCategory,
    description: rawDescription,
    sellingPoints: rawSellingPoints,
    priceNaira: rawPriceNaira,
    originalPriceNaira: rawOriginalPriceNaira,
    promotionText: rawPromotionText,
    promotionEndAt: rawPromotionEndAt,
    availability: rawAvailability,
  } = source;
  const productName = firstItem?.productName ?? rawProductName;
  const category = firstItem?.category ?? rawCategory;
  const description = firstItem?.description ?? rawDescription;
  const sellingPoints = firstItem?.sellingPoints ?? rawSellingPoints;
  const priceNaira = firstItem?.priceNaira ?? rawPriceNaira;
  const originalPriceNaira = firstItem?.originalPriceNaira ?? rawOriginalPriceNaira;
  const promotionText = firstItem?.promotionText ?? rawPromotionText;
  const promotionEndAt = firstItem?.promotionEndAt ?? rawPromotionEndAt;
  const availability = firstItem?.availability ?? rawAvailability;

  if (!isNonEmptyString(brandName, 100)) {
    return "Brand or business name is required.";
  }

  if (!isNonEmptyString(whatsappNumber, 30)) {
    return "WhatsApp number is required.";
  }
  if (!isValidWhatsAppNumber(whatsappNumber)) {
    return "Enter a valid WhatsApp number with 8–15 digits.";
  }

  if (!isNonEmptyString(deliveryInfo, 500)) {
    return "Delivery information is required.";
  }

  if (!isNonEmptyString(productName, 120)) {
    return "Product name is required.";
  }

  if (!isNonEmptyString(category, 50)) {
    return "Category is required.";
  }

  if (!isNonEmptyString(description, 1000)) {
    return "Product description is required.";
  }

  if (!isValidSellingPoints(sellingPoints)) {
    return "Provide up to 3 selling points.";
  }

  if (!isValidPrice(priceNaira)) {
    return "A valid product price is required.";
  }

  if (
    originalPriceNaira !== undefined &&
    originalPriceNaira !== null &&
    !isValidPrice(originalPriceNaira)
  ) {
    return "Original price must be a valid price.";
  }

  if (
    originalPriceNaira !== undefined &&
    originalPriceNaira !== null &&
    originalPriceNaira <= priceNaira
  ) {
    return "Original price must be greater than the current price.";
  }

  if (
    promotionText !== undefined &&
    promotionText !== null &&
    !isNonEmptyString(promotionText, 180)
  ) {
    return "Promotion text must be 180 characters or fewer.";
  }

  if (
    promotionEndAt !== undefined &&
    promotionEndAt !== null &&
    promotionEndAt !== "" &&
    !isValidDateOnly(promotionEndAt)
  ) {
    return "Promotion end date must be a valid date.";
  }

  if (
    typeof availability !== "string" ||
    !VALID_AVAILABILITIES.includes(availability as ProductPageAvailability)
  ) {
    return "Invalid availability status.";
  }

  return {
    brandName: brandName.trim(),
    whatsappNumber: whatsappNumber.trim(),
    deliveryInfo: deliveryInfo.trim(),
    productName: productName.trim(),
    category: category.trim(),
    description: description.trim(),
    sellingPoints: sellingPoints.map((point) => point.trim()),
    priceNaira,
    originalPriceNaira: originalPriceNaira ?? null,
    promotionText: promotionText?.trim() || null,
    promotionEndAt: promotionEndAt || null,
    availability: availability as ProductPageAvailability,
    pageType: requestedPageType as "single" | "collection" | undefined,
    collectionTitle: requestedPageType === "collection" ? (source.collectionTitle as string).trim() : null,
    collectionDescription: typeof source.collectionDescription === "string" ? source.collectionDescription.trim().slice(0, 1000) || null : null,
    items: Array.isArray(items) ? items : undefined,
  };
}


router.post(
  "/edit/:token/items/:itemId/images",
  imageUploadLimiter,
  withImageUploadErrorHandling(collectionImageUpload.array("images", 3)),
  async (req, res) => {
    const { token, itemId } = req.params;
    const files = Array.isArray(req.files) ? req.files : [];
    const uploaded: Array<{ storageKey: string; publicUrl: string }> = [];
    try {
      if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) || typeof itemId !== "string" || !UUID_PATTERN.test(itemId)) {
        return res.status(400).json({ error: "Invalid collection item edit request." });
      }
      if (!files.length || files.length > 3) {
        return res.status(400).json({ error: "Each item needs 1–3 images." });
      }
      const ownedItem = await getProductPageItemForEditToken(hashPrivateEditToken(token), itemId);
      if (!ownedItem) return res.status(404).json({ error: "Collection item not found." });

      for (const file of files) {
        const stored = await uploadProductImage(ownedItem.pageId, file.buffer, file.mimetype);
        uploaded.push(stored);
      }
      const saved = await replaceProductPageItemImages(itemId, uploaded);
      await Promise.allSettled(saved.replacedStorageKeys.map((storageKey) => deleteStoredProductImage(storageKey)));
      return res.status(201).json({ message: "Collection item images uploaded.", images: saved.images });
    } catch (error) {
      await Promise.all(uploaded.map((image) => deleteStoredProductImage(image.storageKey)));
      if (isInvalidImageError(error)) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Collection item image upload error:", error instanceof Error ? error.name : "UnknownError");
      return res.status(500).json({ error: "Unable to upload collection item images." });
    }
  },
);

router.post(
  "/edit/:token/images",
  imageUploadLimiter,
  withImageUploadErrorHandling(productImageUpload.array("images", 3)),
  async (req, res) => {
    try {
      const { token } = req.params;

      if (
        typeof token !== "string" ||
        !/^[a-f0-9]{64}$/.test(token)
      ) {
        return res.status(400).json({
          error: "Invalid edit token.",
        });
      }

      const productPage = await getProductPageByEditToken(token);

      if (!productPage) {
        return res.status(404).json({
          error: "Product page not found.",
        });
      }

      if (typeof productPage.id !== "string") {
        throw new Error("Product page has an invalid ID.");
      }

      const files = Array.isArray(req.files)
        ? req.files
        : [];

      if (!files.length) {
        return res.status(400).json({
          error: "At least one product image is required.",
        });
      }

      if (files.length > 3) {
        return res.status(400).json({
          error: "You can upload a maximum of 3 images.",
        });
      }

      const uploaded: Array<{
        storageKey: string;
        publicUrl: string;
        position: number;
      }> = [];

      try {
        for (const [index, file] of files.entries()) {
          const stored = await uploadProductImage(
            productPage.id,
            file.buffer,
            file.mimetype,
          );

          uploaded.push({
            ...stored,
            position: index + 1,
          });
        }
      } catch (uploadError) {
        await Promise.all(
          uploaded.map((image) =>
            deleteStoredProductImage(image.storageKey),
          ),
        );

        throw uploadError;
      }

      const previousImages =
        await listProductPageImages(productPage.id);

      try {
        if (previousImages.length) {
          await deleteAllProductPageImages(productPage.id);
        }

        const savedImages: ProductPageImage[] = [];

        for (const image of uploaded) {
          savedImages.push(
            await addProductPageImage(
              productPage.id,
              image.storageKey,
              image.publicUrl,
              image.position,
            ),
          );
        }

        await Promise.all(
          previousImages.map((image) =>
            deleteStoredProductImage(image.storage_key),
          ),
        );

        return res.status(201).json({
          message: "Product images uploaded.",
          images: savedImages,
        });
      } catch (databaseError) {
        await Promise.all(
          uploaded.map((image) =>
            deleteStoredProductImage(image.storageKey),
          ),
        );

        throw databaseError;
      }
    } catch (error) {
      console.error("Product image upload error:", error);

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: "Each image must be 10MB or smaller.",
          });
        }

        if (error.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            error: "You can upload a maximum of 3 images.",
          });
        }
      }

      if (
        error instanceof Error &&
        (
          error.message ===
            "Only JPG, PNG or WebP images are supported." ||
          error.message.startsWith("The uploaded ")
        )
      ) {
        return res.status(400).json({
          error: error.message,
        });
      }

      if (isInvalidImageError(error)) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(500).json({
        error: "Unable to upload product images.",
      });
    }
  },
);

router.post("/edit/:token/publish", async (req, res) => {
  try {
    const { token } = req.params;

    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/.test(token)
    ) {
      return res.status(400).json({
        error: "Invalid edit token.",
      });
    }

    const existingPage = await getProductPageByEditToken(token);

    if (!existingPage) {
      return res.status(404).json({
        error: "Product page not found.",
      });
    }

    if (existingPage.archived_at) {
      return res.status(409).json({
        error:
          "This product page has been archived by StatusFly. The platform owner must restore it before it can be published again.",
      });
    }

    if (existingPage.admin_unpublished) {
      return res.status(409).json({
        error:
          "This product page has been unpublished by StatusFly. Contact support if you believe it should be restored.",
      });
    }

    if (existingPage.page_type === "collection") {
      const items = await listProductPageItems(String(existingPage.id));
      if (items.length < 2 || items.length > MAX_COLLECTION_ITEMS || items.some((item) => !item.images?.length)) {
        return res.status(400).json({
          error: "A collection needs 2–10 items, and every item must have at least one saved photo before it can be published.",
        });
      }
    }

    const productPage = await publishProductPageByEditToken(token);

    if (!productPage) {
      return res.status(402).json({
        error: "A successful payment is required before publishing.",
      });
    }

    return res.status(200).json({
      message: "Product page published.",
      productPage,
    });
  } catch (error) {
    console.error("Publish product page error:", error);

    return res.status(500).json({
      error: "Unable to publish product page.",
    });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    if (
      typeof slug !== "string" ||
      slug.length < 6 ||
      slug.length > 80 ||
      !/^[A-Za-z0-9-]+$/.test(slug)
    ) {
      return res.status(400).json({
        error: "Invalid product page URL.",
      });
    }

    const productPage = await getPublishedProductPageBySlug(slug);

    if (!productPage) {
      return res.status(404).json({
        error: "Product page not found.",
      });
    }

    if (typeof productPage.id !== "string") {
      throw new Error("Published product page has an invalid ID.");
    }

    if (typeof productPage.id !== "string") {
      throw new Error("Product page has an invalid ID.");
    }

    const images = await listProductPageImages(productPage.id);
    const items = productPage.page_type === "collection"
      ? await listProductPageItems(productPage.id, false)
      : [];

    return res.status(200).json({
      productPage: {
        ...productPage,
        images,
        items,
      },
    });
  } catch (error) {
    console.error("Get product page error:", error);

    return res.status(500).json({
      error: "Unable to load product page.",
    });
  }
});

router.get("/edit/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/.test(token)
    ) {
      return res.status(400).json({
        error: "Invalid edit token.",
      });
    }

    const productPage = await getProductPageByEditToken(token);

    if (!productPage) {
      return res.status(404).json({
        error: "Product page not found.",
      });
    }

    if (typeof productPage.id !== "string") {
      throw new Error("Product page has an invalid ID.");
    }

    const images = await listProductPageImages(productPage.id);
    const items = productPage.page_type === "collection"
      ? await listProductPageItems(productPage.id, true)
      : [];

    return res.status(200).json({
      productPage: {
        ...productPage,
        images,
        items,
      },
    });
  } catch (error) {
    console.error("Get editable product page error:", error);

    return res.status(500).json({
      error: "Unable to load product page.",
    });
  }
});

router.patch("/edit/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/.test(token)
    ) {
      return res.status(400).json({
        error: "Invalid edit token.",
      });
    }

    const validated = validateProductPageInput(req.body);

    if (typeof validated === "string") {
      return res.status(400).json({
        error: validated,
      });
    }

    const existingPage = await getProductPageByEditToken(token);
    if (!existingPage) {
      return res.status(404).json({ error: "Product page not found." });
    }
    if (validated.pageType && existingPage.page_type && validated.pageType !== existingPage.page_type) {
      return res.status(409).json({ error: "A page's type cannot be changed after creation." });
    }

    const existingItems = existingPage.page_type === "collection" && Array.isArray(validated.items)
      ? await listProductPageItems(String(existingPage.id), true)
      : [];
    const retainedItemIds = new Set((validated.items ?? []).flatMap((item) => item.id ? [item.id] : []));
    const removedStorageKeys = existingItems
      .filter((item) => !retainedItemIds.has(item.id))
      .flatMap((item) => item.images ?? [])
      .map((image) => image.storage_key)
      .filter((key): key is string => Boolean(key));

    const productPage = await updateProductPageByEditToken(
      token,
      validated,
    );

    if (!productPage) {
      return res.status(404).json({
        error: "Product page not found.",
      });
    }

    // Removing a collection item removes its DB image metadata via FK cascade;
    // also clean the corresponding Supabase objects after the DB transaction succeeds.
    if (removedStorageKeys.length) {
      await Promise.allSettled(removedStorageKeys.map((storageKey) => deleteStoredProductImage(storageKey)));
    }

    const items = productPage.page_type === "collection"
      ? await listProductPageItems(String(productPage.id), true)
      : [];
    return res.status(200).json({
      message: "Product page updated.",
      productPage: { ...productPage, items },
    });
  } catch (error) {
    console.error("Update product page error:", error);

    return res.status(500).json({
      error: "Unable to update product page.",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const validated = validateProductPageInput(req.body);
    if (typeof validated === "string") {
      return res.status(400).json({ error: validated });
    }

    if (validated.pageType === "collection" && validated.items) {
      // Collection requests store the first item in legacy columns as a compatibility mirror.
      const firstItem = validated.items[0];
      if (!firstItem) return res.status(400).json({ error: "Add at least two collection items." });
    }

    const productPage = await createProductPage(validated);
    return res.status(201).json({
      message: "Product page created.",
      productPage,
    });
  } catch (error) {
    console.error("Create product page error:", error);
    return res.status(500).json({
      error: "Unable to create product page.",
    });
  }
});

export default router;
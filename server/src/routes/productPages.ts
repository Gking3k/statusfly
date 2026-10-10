import { Router } from "express";
import multer from "multer";
import {
  createProductPage,
  getPublishedProductPageBySlug,
  getProductPageByEditToken,
  publishProductPageByEditToken,
  updateProductPageByEditToken,
  type CreateProductPageInput,
  type ProductPageAvailability,
  type UpdateProductPageInput,
} from "../services/productPages.js";
import {
  deleteAllProductPageImages,
  listProductPageImages,
  addProductPageImage,
} from "../services/productPageImages.js";
import {
  deleteStoredProductImage,
  uploadProductImage,
} from "../services/supabaseStorage.js";

const router = Router();

const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;

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
    value > 0 &&
    value <= 1_000_000_000
  );
}

function validateProductPageInput(body: unknown): UpdateProductPageInput | string {
  const {
    brandName,
    whatsappNumber,
    deliveryInfo,
    productName,
    category,
    description,
    sellingPoints,
    priceNaira,
    originalPriceNaira,
    promotionText,
    promotionEndAt,
    availability,
  } = (body ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(brandName, 100)) {
    return "Brand or business name is required.";
  }

  if (!isNonEmptyString(whatsappNumber, 30)) {
    return "WhatsApp number is required.";
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
    typeof promotionEndAt !== "string"
  ) {
    return "Promotion end date must be a valid date string.";
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
  };
}


router.post(
  "/edit/:token/images",
  productImageUpload.array("images", 3),
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

        const savedImages = [];

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

      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Unable to upload product images.",
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

    return res.status(200).json({
      productPage: {
        ...productPage,
        images,
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

    return res.status(200).json({
      productPage: {
        ...productPage,
        images,
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

    const productPage = await updateProductPageByEditToken(
      token,
      validated,
    );

    if (!productPage) {
      return res.status(404).json({
        error: "Product page not found.",
      });
    }

    return res.status(200).json({
      message: "Product page updated.",
      productPage,
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
    const {
      brandName,
      whatsappNumber,
      deliveryInfo,
      productName,
      category,
      description,
      sellingPoints,
      priceNaira,
      originalPriceNaira,
      promotionText,
      promotionEndAt,
      availability,
    } = req.body ?? {};

    if (!isNonEmptyString(brandName, 100)) {
      return res.status(400).json({
        error: "Brand or business name is required.",
      });
    }

    if (!isNonEmptyString(whatsappNumber, 30)) {
      return res.status(400).json({
        error: "WhatsApp number is required.",
      });
    }

    if (!isNonEmptyString(deliveryInfo, 500)) {
      return res.status(400).json({
        error: "Delivery information is required.",
      });
    }

    if (!isNonEmptyString(productName, 120)) {
      return res.status(400).json({
        error: "Product name is required.",
      });
    }

    if (!isNonEmptyString(category, 50)) {
      return res.status(400).json({
        error: "Category is required.",
      });
    }

    if (!isNonEmptyString(description, 1000)) {
      return res.status(400).json({
        error: "Product description is required.",
      });
    }

    if (!isValidSellingPoints(sellingPoints)) {
      return res.status(400).json({
        error: "Provide up to 3 selling points.",
      });
    }

    if (!isValidPrice(priceNaira)) {
      return res.status(400).json({
        error: "A valid product price is required.",
      });
    }

    if (
      originalPriceNaira !== undefined &&
      originalPriceNaira !== null &&
      !isValidPrice(originalPriceNaira)
    ) {
      return res.status(400).json({
        error: "Original price must be a valid price.",
      });
    }

    if (
      originalPriceNaira !== undefined &&
      originalPriceNaira !== null &&
      originalPriceNaira <= priceNaira
    ) {
      return res.status(400).json({
        error: "Original price must be greater than the current price.",
      });
    }

    if (
      promotionText !== undefined &&
      promotionText !== null &&
      !isNonEmptyString(promotionText, 180)
    ) {
      return res.status(400).json({
        error: "Promotion text must be 200 characters or fewer.",
      });
    }

    if (
      promotionEndAt !== undefined &&
      promotionEndAt !== null &&
      typeof promotionEndAt !== "string"
    ) {
      return res.status(400).json({
        error: "Promotion end date must be a valid date string.",
      });
    }

    if (
      typeof availability !== "string" ||
      !VALID_AVAILABILITIES.includes(availability as ProductPageAvailability)
    ) {
      return res.status(400).json({
        error: "Invalid availability status.",
      });
    }

    const validatedAvailability = availability as ProductPageAvailability;

    const input: CreateProductPageInput = {
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
      availability: validatedAvailability,
    };

    const productPage = await createProductPage(input);

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
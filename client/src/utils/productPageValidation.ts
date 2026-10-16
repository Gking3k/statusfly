import type { ProductPageBuilderForm } from "../types/productPage";

export type ProductPageValidationErrors = Record<string, string>;

function trimmed(value: string) {
  return value.trim();
}

function parseNaira(value: string) {
  const normalized = value.trim().replace(/[\s,₦]/g, "");
  if (!/^\d+$/.test(normalized)) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function isValidWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function validateProductPage(
  form: ProductPageBuilderForm,
  imageCount: number,
): ProductPageValidationErrors {
  const errors: ProductPageValidationErrors = {};

  if (imageCount < 1) {
    errors.images = "Add at least one product image.";
  }

  if (imageCount > 3) {
    errors.images = "You can add a maximum of three product images.";
  }

  if (!trimmed(form.productName)) {
    errors.productName = "Add your product name.";
  } else if (form.productName.length > 120) {
    errors.productName = "Product name must be 120 characters or fewer.";
  }

  const currentPrice = parseNaira(form.price);
  if (!trimmed(form.price) || currentPrice <= 0 || currentPrice > 1_000_000_000) {
    errors.price = "Add a valid product price between ₦1 and ₦1,000,000,000.";
  }

  if (!trimmed(form.description)) {
    errors.description = "Add a product description.";
  } else if (form.description.length > 1000) {
    errors.description = "Description must be 1,000 characters or fewer.";
  }

  if (!trimmed(form.brandName)) {
    errors.brandName = "Add your business or brand name.";
  } else if (form.brandName.length > 100) {
    errors.brandName = "Business name must be 100 characters or fewer.";
  }

  if (!trimmed(form.whatsappNumber)) {
    errors.whatsappNumber = "Add your WhatsApp number.";
  } else if (!isValidWhatsAppNumber(form.whatsappNumber)) {
    errors.whatsappNumber = "Enter a valid WhatsApp number with 8–15 digits, including the country code if needed.";
  }

  if (!trimmed(form.deliveryInfo)) {
    errors.deliveryInfo = "Add your delivery information.";
  } else if (form.deliveryInfo.length > 500) {
    errors.deliveryInfo = "Delivery information must be 500 characters or fewer.";
  }

  if (form.category.length > 50) {
    errors.category = "Category must be 50 characters or fewer.";
  }

  form.sellingPoints.forEach((point, index) => {
    if (point.length > 120) {
      errors[`sellingPoints.${index}`] =
        "Selling point must be 120 characters or fewer.";
    }
  });

  if (form.originalPrice.trim()) {
    const originalPrice = parseNaira(form.originalPrice);

    if (originalPrice <= 0 || originalPrice > 1_000_000_000) {
      errors.originalPrice = "Enter a valid original price.";
    } else if (originalPrice <= currentPrice) {
      errors.originalPrice =
        "Original price must be greater than the current price.";
    }
  }

  if (form.promotionText.length > 180) {
    errors.promotionText =
      "Promotion text must be 180 characters or fewer.";
  }

  if (form.promotionEndAt.trim()) {
    const value = form.promotionEndAt.trim();
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      errors.promotionEndAt = "Enter a valid promotion end date.";
    }
  }

  return errors;
}

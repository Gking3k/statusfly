import type { ProductPageBuilderForm } from "../types/productPage";

export type ProductPageValidationErrors = Record<string, string>;

function trimmed(value: string) {
  return value.trim();
}

function parseNaira(value: string) {
  const amount = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
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

  if (!trimmed(form.price) || parseNaira(form.price) <= 0) {
    errors.price = "Add a valid product price.";
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
    const currentPrice = parseNaira(form.price);
    const originalPrice = parseNaira(form.originalPrice);

    if (originalPrice <= currentPrice) {
      errors.originalPrice =
        "Original price must be greater than the current price.";
    }
  }

  if (form.promotionText.length > 180) {
    errors.promotionText =
      "Promotion text must be 180 characters or fewer.";
  }

  return errors;
}

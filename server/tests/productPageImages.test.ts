import "dotenv/config";

import test from "node:test";
import assert from "node:assert/strict";

import {
  addProductPageImage,
  listProductPageImages,
  deleteProductPageImage,
} from "../src/services/productPageImages.js";
import { createProductPage } from "../src/services/productPages.js";

test("product page image records can be created and listed", async () => {
  const productPage = await createProductPage({
    brandName: "Image Test Store",
    whatsappNumber: "+2348012345678",
    deliveryInfo: "Lagos delivery.",
    productName: "Image Test Product",
    category: "Fashion",
    description: "Image record test.",
    sellingPoints: ["Quality"],
    priceNaira: 10000,
    availability: "available",
  });

  const image = await addProductPageImage(
    productPage.id,
    "products/test/hero.jpg",
    "https://example.com/hero.jpg",
    1,
  );

  assert.ok(image.id);
  assert.equal(image.position, 1);

  const images = await listProductPageImages(productPage.id);

  assert.equal(images.length, 1);
  assert.equal(images[0]?.storage_key, "products/test/hero.jpg");
});

test("product page image position cannot exceed 3", async () => {
  const productPage = await createProductPage({
    brandName: "Image Limit Test",
    whatsappNumber: "+2348012345678",
    deliveryInfo: "Lagos delivery.",
    productName: "Image Limit Product",
    category: "Fashion",
    description: "Image position test.",
    sellingPoints: ["Quality"],
    priceNaira: 10000,
    availability: "available",
  });

  await assert.rejects(
    () =>
      addProductPageImage(
        productPage.id,
        "products/test/fourth.jpg",
        "https://example.com/fourth.jpg",
        4,
      ),
    /Image position must be between 1 and 3/,
  );
});

test("product page image position is unique per product", async () => {
  const productPage = await createProductPage({
    brandName: "Image Unique Test",
    whatsappNumber: "+2348012345678",
    deliveryInfo: "Lagos delivery.",
    productName: "Image Unique Product",
    category: "Fashion",
    description: "Image uniqueness test.",
    sellingPoints: ["Quality"],
    priceNaira: 10000,
    availability: "available",
  });

  await addProductPageImage(
    productPage.id,
    "products/test/one.jpg",
    "https://example.com/one.jpg",
    1,
  );

  await assert.rejects(
    () =>
      addProductPageImage(
        productPage.id,
        "products/test/another.jpg",
        "https://example.com/another.jpg",
        1,
      ),
  );
});

test("product page image can be deleted", async () => {
  const productPage = await createProductPage({
    brandName: "Image Delete Test",
    whatsappNumber: "+2348012345678",
    deliveryInfo: "Lagos delivery.",
    productName: "Image Delete Product",
    category: "Fashion",
    description: "Image deletion test.",
    sellingPoints: ["Quality"],
    priceNaira: 10000,
    availability: "available",
  });

  const image = await addProductPageImage(
    productPage.id,
    "products/test/delete.jpg",
    "https://example.com/delete.jpg",
    1,
  );

  const deleted = await deleteProductPageImage(
    productPage.id,
    image.id,
  );

  assert.equal(deleted, true);

  const images = await listProductPageImages(productPage.id);

  assert.equal(images.length, 0);
});
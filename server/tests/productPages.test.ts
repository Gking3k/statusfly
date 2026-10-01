import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import app from "../src/app.js";

test("POST /api/product-pages rejects an invalid product name", async () => {
  const response = await request(app)
    .post("/api/product-pages")
    .send({
      brandName: "Test Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Delivery available within Lagos.",
      productName: "",
      category: "Fashion",
      description: "Test product.",
      sellingPoints: ["Quality"],
      priceNaira: 25000,
      availability: "available",
    });

  assert.equal(response.status, 400);
});

test("POST /api/product-pages rejects more than 3 selling points", async () => {
  const response = await request(app)
    .post("/api/product-pages")
    .send({
      brandName: "Test Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Delivery available within Lagos.",
      productName: "Test Product",
      category: "Fashion",
      description: "Test product.",
      sellingPoints: [
        "Point one",
        "Point two",
        "Point three",
        "Point four",
      ],
      priceNaira: 25000,
      availability: "available",
    });

  assert.equal(response.status, 400);
});

test("POST /api/product-pages rejects an invalid availability value", async () => {
  const response = await request(app)
    .post("/api/product-pages")
    .send({
      brandName: "Test Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Delivery available within Lagos.",
      productName: "Test Product",
      category: "Fashion",
      description: "Test product.",
      sellingPoints: ["Quality"],
      priceNaira: 25000,
      availability: "something_invalid",
    });

  assert.equal(response.status, 400);
});

test("POST /api/product-pages creates a valid draft product page", async () => {
  const response = await request(app)
    .post("/api/product-pages")
    .send({
      brandName: "Automated Test Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Delivery available within Lagos.",
      productName: "Automated Test Product",
      category: "Fashion",
      description: "Created by the automated API test.",
      sellingPoints: [
        "Premium quality",
        "Fast delivery",
        "Good value",
      ],
      priceNaira: 25000,
      originalPriceNaira: 30000,
      promotionText: "Test promotion",
      availability: "available",
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.message, "Product page created.");

  assert.ok(response.body.productPage.id);
  assert.ok(response.body.productPage.publicSlug);
  assert.ok(response.body.productPage.editToken);
});

test("GET /api/product-pages/:slug returns 404 for an unpublished page", async () => {
  const createResponse = await request(app)
    .post("/api/product-pages")
    .send({
      brandName: "Draft Test Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Delivery available within Lagos.",
      productName: "Draft Product",
      category: "Fashion",
      description: "This page must not be public yet.",
      sellingPoints: ["Quality"],
      priceNaira: 15000,
      availability: "available",
    });

  assert.equal(createResponse.status, 201);

  const slug = createResponse.body.productPage.publicSlug;

  const response = await request(app).get(
    `/api/product-pages/${slug}`,
  );

  assert.equal(response.status, 404);
});

test("GET /api/product-pages/:slug rejects an invalid slug", async () => {
  const response = await request(app).get(
    "/api/product-pages/invalid%20slug",
  );

  assert.equal(response.status, 400);
});

test("POST /api/product-pages accepts the preorder availability value", async () => {
  const response = await request(app)
    .post("/api/product-pages")
    .send({
      brandName: "Preorder Test Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Delivery available within Lagos.",
      productName: "Preorder Product",
      category: "Fashion",
      description: "A preorder product for testing.",
      sellingPoints: ["Made to order"],
      priceNaira: 50000,
      availability: "preorder",
    });

  assert.equal(response.status, 201);
  assert.ok(response.body.productPage.id);
  assert.ok(response.body.productPage.publicSlug);
  assert.ok(response.body.productPage.editToken);
});

test("GET /api/product-pages/edit/:token returns a private product page", async () => {
  const createResponse = await request(app)
    .post("/api/product-pages")
    .send({
      brandName: "Private Test Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Delivery available within Lagos.",
      productName: "Private Product",
      category: "Fashion",
      description: "Private editing test.",
      sellingPoints: ["Quality"],
      priceNaira: 20000,
      availability: "available",
    });

  assert.equal(createResponse.status, 201);

  const { editToken, publicSlug } = createResponse.body.productPage;

  const response = await request(app).get(
    `/api/product-pages/edit/${editToken}`,
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.body.productPage.public_slug,
    publicSlug,
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      response.body.productPage,
      "edit_token_hash",
    ),
    false,
  );
  assert.ok(Array.isArray(response.body.productPage.images));
});

test("PATCH /api/product-pages/edit/:token updates a product page", async () => {
  const createResponse = await request(app)
    .post("/api/product-pages")
    .send({
      brandName: "Update Test Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Lagos delivery.",
      productName: "Original Product Name",
      category: "Fashion",
      description: "Original description.",
      sellingPoints: ["Original point"],
      priceNaira: 20000,
      availability: "available",
    });

  assert.equal(createResponse.status, 201);

  const { editToken, publicSlug } =
    createResponse.body.productPage;

  const updateResponse = await request(app)
    .patch(`/api/product-pages/edit/${editToken}`)
    .send({
      brandName: "Updated Store",
      whatsappNumber: "+2348098765432",
      deliveryInfo: "Nationwide delivery.",
      productName: "Updated Product Name",
      category: "Fashion",
      description: "Updated product description.",
      sellingPoints: [
        "Better quality",
        "Faster delivery",
      ],
      priceNaira: 25000,
      originalPriceNaira: 30000,
      promotionText: "Limited offer",
      availability: "low_stock",
    });

  assert.equal(updateResponse.status, 200);
  assert.equal(
    updateResponse.body.productPage.product_name,
    "Updated Product Name",
  );
  assert.equal(
    updateResponse.body.productPage.public_slug,
    publicSlug,
  );
});

test("PATCH /api/product-pages/edit/:token rejects an invalid edit token", async () => {
  const response = await request(app)
    .patch(
      `/api/product-pages/edit/${"a".repeat(64)}`,
    )
    .send({
      brandName: "Test Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Lagos delivery.",
      productName: "Attempted Update",
      category: "Fashion",
      description: "Testing an invalid edit token.",
      sellingPoints: ["Quality"],
      priceNaira: 20000,
      availability: "available",
    });

  assert.equal(response.status, 404);
});

test("POST /api/product-pages/edit/:token/publish requires successful payment", async () => {
  const createResponse = await request(app)
    .post("/api/product-pages")
    .send({
      brandName: "Unpaid Store",
      whatsappNumber: "+2348012345678",
      deliveryInfo: "Lagos delivery.",
      productName: "Unpaid Product",
      category: "Fashion",
      description: "This page has not been paid for.",
      sellingPoints: ["Quality"],
      priceNaira: 20000,
      availability: "available",
    });

  assert.equal(createResponse.status, 201);

  const { editToken } = createResponse.body.productPage;

  const response = await request(app)
    .post(`/api/product-pages/edit/${editToken}/publish`);

  assert.equal(response.status, 402);
});
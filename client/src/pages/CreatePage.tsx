
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import ProductPagePreview from "../components/ProductPagePreview";
import {
  createProductPage,
  uploadProductPageImages,
  type CreatedProductPage,
} from "../api/productPages";
import type {
  BuilderImage,
  ProductPageAvailability,
  ProductPageBuilderForm,
} from "../types/productPage";
import { validateProductPage } from "../utils/productPageValidation";
import { initializeProductPagePayment } from "../api/productPagePayments";
import { trackPlatformEvent } from "../api/platformAnalytics";
import {
  clearProductPageDraftHandoff,
  saveProductPageDraftHandoff,
} from "../utils/productPageDraft";

const INITIAL_FORM: ProductPageBuilderForm = {
  brandName: "",
  productName: "",
  category: "Fashion",
  description: "",
  price: "",
  originalPrice: "",
  promotionText: "",
  promotionEndAt: "",
  availability: "available",
  sellingPoints: ["", "", ""],
  whatsappNumber: "",
  deliveryInfo: "",
};

const LOCAL_FORM_DRAFT_KEY = "statusfly:create-form-draft";

function hasMeaningfulFormData(form: ProductPageBuilderForm): boolean {
  return Boolean(
    form.brandName.trim() ||
      form.productName.trim() ||
      form.description.trim() ||
      form.price.trim() ||
      form.originalPrice.trim() ||
      form.promotionText.trim() ||
      form.promotionEndAt.trim() ||
      form.whatsappNumber.trim() ||
      form.deliveryInfo.trim() ||
      form.sellingPoints.some((point) => point.trim()),
  );
}

const CATEGORIES = [
  "Fashion",
  "Shoes",
  "Hair & Wigs",
  "Beauty",
  "Perfume",
  "Food",
  "Jewelry",
  "Electronics",
  "Home",
  "Other",
];

const AVAILABILITY_OPTIONS: Array<{
  value: ProductPageAvailability;
  label: string;
}> = [
  { value: "available", label: "Available" },
  { value: "low_stock", label: "Low stock" },
  { value: "sold_out", label: "Sold out" },
  { value: "coming_soon", label: "Coming soon" },
  { value: "preorder", label: "Pre-order" },
];

function cleanWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("0")) {
    return `234${digits.slice(1)}`;
  }

  return digits;
}

function parseNaira(value: string) {
  const amount = Number(value.replace(/[^\d]/g, ""));

  return Number.isFinite(amount) ? amount : 0;
}

function CreatePage() {
  useEffect(() => {
    trackPlatformEvent("create_view");
  }, []);

  const [form, setForm] =
    useState<ProductPageBuilderForm>(INITIAL_FORM);

  const [storedFormDraft, setStoredFormDraft] =
    useState<ProductPageBuilderForm | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftPromptHandled, setDraftPromptHandled] = useState(false);

  const [images, setImages] = useState<BuilderImage[]>([]);
  const [activeImage, setActiveImage] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createdPage, setCreatedPage] =
    useState<CreatedProductPage | null>(null);
  const [imagesUploaded, setImagesUploaded] = useState(false);
  const [paymentEmail, setPaymentEmail] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  const imagesRef = useRef<BuilderImage[]>([]);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(LOCAL_FORM_DRAFT_KEY);

      if (!rawDraft) {
        setDraftHydrated(true);
        return;
      }

      const parsed = JSON.parse(rawDraft) as Partial<ProductPageBuilderForm>;
      const savedSellingPoints = Array.isArray(parsed.sellingPoints)
        ? parsed.sellingPoints
            .filter((point): point is string => typeof point === "string")
            .slice(0, 3)
        : [];

      while (savedSellingPoints.length < 3) {
        savedSellingPoints.push("");
      }

      const availability =
        AVAILABILITY_OPTIONS.find(
          (option) => option.value === parsed.availability,
        )?.value ?? INITIAL_FORM.availability;

      const restoredDraft: ProductPageBuilderForm = {
        brandName:
          typeof parsed.brandName === "string"
            ? parsed.brandName
            : INITIAL_FORM.brandName,
        productName:
          typeof parsed.productName === "string"
            ? parsed.productName
            : INITIAL_FORM.productName,
        category:
          typeof parsed.category === "string"
            ? parsed.category
            : INITIAL_FORM.category,
        description:
          typeof parsed.description === "string"
            ? parsed.description
            : INITIAL_FORM.description,
        price:
          typeof parsed.price === "string"
            ? parsed.price
            : INITIAL_FORM.price,
        originalPrice:
          typeof parsed.originalPrice === "string"
            ? parsed.originalPrice
            : INITIAL_FORM.originalPrice,
        promotionText:
          typeof parsed.promotionText === "string"
            ? parsed.promotionText
            : INITIAL_FORM.promotionText,
        promotionEndAt:
          typeof parsed.promotionEndAt === "string"
            ? parsed.promotionEndAt
            : INITIAL_FORM.promotionEndAt,
        availability,
        sellingPoints: savedSellingPoints,
        whatsappNumber:
          typeof parsed.whatsappNumber === "string"
            ? parsed.whatsappNumber
            : INITIAL_FORM.whatsappNumber,
        deliveryInfo:
          typeof parsed.deliveryInfo === "string"
            ? parsed.deliveryInfo
            : INITIAL_FORM.deliveryInfo,
      };

      if (hasMeaningfulFormData(restoredDraft)) {
        setStoredFormDraft(restoredDraft);
      } else {
        window.localStorage.removeItem(LOCAL_FORM_DRAFT_KEY);
      }
    } catch {
      try {
        window.localStorage.removeItem(LOCAL_FORM_DRAFT_KEY);
      } catch {
        // Ignore local storage failures.
      }
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (
      !draftHydrated ||
      (storedFormDraft && !draftPromptHandled)
    ) {
      return;
    }

    try {
      if (hasMeaningfulFormData(form)) {
        window.localStorage.setItem(
          LOCAL_FORM_DRAFT_KEY,
          JSON.stringify(form),
        );
      } else {
        window.localStorage.removeItem(LOCAL_FORM_DRAFT_KEY);
      }
    } catch {
      // Ignore local storage failures.
    }
  }, [
    form,
    draftHydrated,
    draftPromptHandled,
    storedFormDraft,
  ]);

  function restoreSavedForm() {
    if (!storedFormDraft) {
      return;
    }

    setForm(storedFormDraft);
    setStoredFormDraft(null);
    setDraftPromptHandled(true);
    setMessage("Saved details restored.");
    setError("");
    setFieldErrors({});
    setCreatedPage(null);
    setImagesUploaded(false);
    clearProductPageDraftHandoff();
  }

  function discardSavedForm() {
    try {
      window.localStorage.removeItem(LOCAL_FORM_DRAFT_KEY);
    } catch {
      // Ignore local storage failures.
    }

    setStoredFormDraft(null);
    setDraftPromptHandled(true);
    setForm(INITIAL_FORM);
    setMessage("");
    setError("");
    setFieldErrors({});
    setCreatedPage(null);
    setImagesUploaded(false);
    clearProductPageDraftHandoff();
  }

  const completion = useMemo(() => {
    const required = [
      form.brandName.trim(),
      form.productName.trim(),
      form.description.trim(),
      form.price.trim(),
      form.whatsappNumber.trim(),
      form.deliveryInfo.trim(),
      images.length > 0,
    ];

    const complete = required.filter(Boolean).length;

    return Math.round((complete / required.length) * 100);
  }, [form, images.length]);

  const validPoints = form.sellingPoints.filter((point) =>
    point.trim(),
  );

  function updateField(
    field: keyof ProductPageBuilderForm,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setMessage("");
    setError("");
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
    setCreatedPage(null);
    setImagesUploaded(false);
    clearProductPageDraftHandoff();
  }

  function updatePoint(index: number, value: string) {
    setForm((current) => {
      const sellingPoints = [...current.sellingPoints];
      sellingPoints[index] = value;

      return {
        ...current,
        sellingPoints,
      };
    });

    setMessage("");
    setError("");
    setFieldErrors((current) => {
      const key = `sellingPoints.${index}`;

      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
    setCreatedPage(null);
    setImagesUploaded(false);
    clearProductPageDraftHandoff();
  }

  function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    replaceIndex?: number,
  ) {
    const selectedFiles = Array.from(
      event.target.files ?? [],
    );

    if (!selectedFiles.length) {
      return;
    }

    const validFiles: File[] = [];

    for (const file of selectedFiles) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(
          file.type,
        )
      ) {
        setError("Use JPG, PNG or WebP images only.");
        setFieldErrors((current) => ({
          ...current,
          images: "Use JPG, PNG or WebP images only.",
        }));
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError("Each image must be 10MB or smaller.");
        setFieldErrors((current) => ({
          ...current,
          images: "Each image must be 10MB or smaller.",
        }));
        continue;
      }

      validFiles.push(file);
    }

    if (!validFiles.length) {
      return;
    }

    setImages((current) => {
      const next = [...current];

      if (
        typeof replaceIndex === "number" &&
        replaceIndex >= 0 &&
        replaceIndex < next.length
      ) {
        const previous = next[replaceIndex];

        if (previous) {
          URL.revokeObjectURL(previous.url);
        }

        next[replaceIndex] = {
          file: validFiles[0],
          url: URL.createObjectURL(validFiles[0]),
        };
      } else {
        for (const file of validFiles) {
          if (next.length >= 3) {
            break;
          }

          next.push({
            file,
            url: URL.createObjectURL(file),
          });
        }
      }

      return next.slice(0, 3);
    });

    setMessage("");
    setError("");
    setFieldErrors((current) => {
      if (!current.images) {
        return current;
      }

      const next = { ...current };
      delete next.images;
      return next;
    });
    setCreatedPage(null);
    setImagesUploaded(false);
    clearProductPageDraftHandoff();

    event.target.value = "";
  }

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  function removeImage(index: number) {
    setImages((current) => {
      const image = current[index];

      if (image) {
        URL.revokeObjectURL(image.url);
      }

      return current.filter(
        (_, itemIndex) => itemIndex !== index,
      );
    });

    setActiveImage((current) => {
      if (index === current) {
        return Math.max(0, current - 1);
      }

      if (index < current) {
        return current - 1;
      }

      return current;
    });

    setCreatedPage(null);
    setFieldErrors((current) => {
      if (!current.images) {
        return current;
      }

      const next = { ...current };
      delete next.images;
      return next;
    });
    clearProductPageDraftHandoff();
  }

  function validateBeforeSubmit() {
    return validateProductPage(form, images.length);
  }

  async function handleContinue() {
    setMessage("");
    setError("");

    const validationErrors = validateBeforeSubmit();

    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setError(
        Object.values(validationErrors)[0] ??
          "Check the highlighted fields before continuing.",
      );
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const response =
        createdPage && !imagesUploaded
          ? { productPage: createdPage }
          : await createProductPage({
              brandName: form.brandName.trim(),
              whatsappNumber: cleanWhatsAppNumber(
                form.whatsappNumber,
              ),
              deliveryInfo: form.deliveryInfo.trim(),
              productName: form.productName.trim(),
              category: form.category.trim(),
              description: form.description.trim(),
              sellingPoints: validPoints,
              priceNaira: parseNaira(form.price),
              originalPriceNaira: form.originalPrice.trim()
                ? parseNaira(form.originalPrice)
                : null,
              promotionText: form.promotionText.trim() || null,
              promotionEndAt:
                form.promotionEndAt.trim() || null,
              availability: form.availability,
            });

      const page = response.productPage;

      trackPlatformEvent("draft_created");
      saveProductPageDraftHandoff(page);
      setCreatedPage(page);

      await uploadProductPageImages(
        page.editToken,
        images.map((image) => image.file),
      );

      setImagesUploaded(true);
      setMessage(
        "Your draft and product images are saved. Enter your email below to continue to secure payment.",
      );
    } catch (requestError) {
      setImagesUploaded(false);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save your product page and images.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayment() {
    setMessage("");
    setError("");

    if (!createdPage || !imagesUploaded) {
      setError("Save your product page and images before paying.");
      return;
    }

    const email = paymentEmail.trim().toLowerCase();

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      setError("Enter a valid email address for your payment receipt.");
      return;
    }

    setPaymentSubmitting(true);
    trackPlatformEvent("payment_started");

    try {
      const response = await initializeProductPagePayment(
        createdPage.editToken,
        email,
      );

      window.location.assign(response.authorizationUrl);
    } catch (requestError) {
      trackPlatformEvent("payment_init_failed");
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to start payment right now.",
      );
    } finally {
      setPaymentSubmitting(false);
    }
  }

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.url);
      });
    };
  }, []);

  function fieldState(field: string) {
    return fieldErrors[field] ? "has-error" : "";
  }

  const shouldPromptForDraft =
    draftHydrated && Boolean(storedFormDraft) && !draftPromptHandled;

  return (
    <main className="builder-page">
      {!draftHydrated ? null : shouldPromptForDraft ? (
        <div className="builder-shell">
          <div
            className="preview-note"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-draft-title"
          >
            <strong id="saved-draft-title">Saved details found</strong>
            <span>
              You have an unfinished product page from an earlier session.
              Restore the saved details or start fresh. Product images need to
              be selected again after a full page refresh.
            </span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                marginTop: "4px",
              }}
            >
              <button
                type="button"
                className="button button-primary"
                onClick={restoreSavedForm}
              >
                Restore details
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={discardSavedForm}
              >
                Start fresh
              </button>
            </div>
          </div>
        </div>
      ) : (
      <div className="builder-shell">
        <header className="builder-topbar">
          <div className="builder-topbar-left">
            <Link className="brand brand-mark" to="/">
              StatusFly
            </Link>

            <Link className="builder-back" to="/">
              ← Back
            </Link>
          </div>

          <span className="builder-step-note">
            One product · One page · ₦3,000
          </span>
        </header>

        <section className="builder-heading">
          <div>
            <h1>Build your product page.</h1>
            <p>
              Give customers the information they need, then send them
              straight into a WhatsApp conversation with you.
            </p>
          </div>

          <div className="builder-progress">
            <div className="builder-progress-top">
              <span>Page readiness</span>
              <strong>{completion}%</strong>
            </div>

            <div className="builder-progress-track">
              <div
                className="builder-progress-fill"
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>
        </section>

        <div className="builder-layout">
          <section className="builder-form">
            <div className="form-card">
              <div className="form-card-inner">
                <div className="form-card-header">
                  <span className="form-card-number">01</span>
                  <div>
                    <h2>Product images</h2>
                    <p>
                      Upload up to three images. Your first image becomes the
                      main product image. At least one image is required.
                    </p>
                  </div>
                </div>

                <div className="image-grid">
                  {Array.from({ length: 3 }).map((_, index) => {
                    const image = images[index];
                    const isNextSlot = index === images.length;
                    const isLockedEmpty = !image && !isNextSlot;

                    return (
                      <div
                        key={index}
                        className={`image-slot ${
                          index === 0 ? "primary" : ""
                        } ${image ? "" : "empty"} ${
                          isLockedEmpty ? "locked" : ""
                        }`}
                      >
                        {image ? (
                          <>
                            <img
                              src={image.url}
                              alt={`Product view ${index + 1}`}
                            />

                            <span className="image-slot-label">
                              {index === 0
                                ? "Main image"
                                : `Image ${index + 1}`}
                            </span>

                            <button
                              type="button"
                              className="image-slot-remove"
                              aria-label={`Remove image ${index + 1}`}
                              onClick={() => removeImage(index)}
                              disabled={submitting}
                            >
                              ×
                            </button>

                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(event) =>
                                handleImageChange(event, index)
                              }
                              disabled={submitting}
                            />
                          </>
                        ) : isLockedEmpty ? (
                          <div className="image-slot-empty image-slot-empty-locked">
                            <span className="image-slot-empty-icon">
                              {index + 1}
                            </span>
                            <strong>Available next</strong>
                            <span>Add the previous image first.</span>
                          </div>
                        ) : (
                          <>
                            <div className="image-slot-empty">
                              <span className="image-slot-empty-icon">
                                +
                              </span>

                              <strong>
                                {index === 0
                                  ? "Add main image"
                                  : `Add image ${index + 1}`}
                              </strong>

                              <span>
                                {index === 0
                                  ? "Choose up to 3 images at once"
                                  : "JPG, PNG or WebP · up to 10MB"}
                              </span>
                            </div>

                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple={index === 0}
                              onChange={(event) =>
                                handleImageChange(event, index)
                              }
                              disabled={submitting}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="image-count-row">
                  <strong>{images.length}/3 images added</strong>
                  <span>Recommended: 1:1 square images · e.g. 1080 × 1080px</span>
                </div>

                <p className="field-note">
                  Your images are previewed locally first, then uploaded
                  securely when you continue. We recommend 1:1 square images
                  such as 1080 × 1080px.
                </p>

                {fieldErrors.images ? (
                  <p className="field-error" role="alert">
                    {fieldErrors.images}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="form-card">
              <div className="form-card-inner">
                <div className="form-card-header">
                  <span className="form-card-number">02</span>
                  <div>
                    <h2>Product details</h2>
                    <p>
                      Keep the information clear. Customers should understand
                      the offer without asking basic questions first.
                    </p>
                  </div>
                </div>

                <div className="field-grid">
                  <label className={`field full ${fieldState("productName")}`}>
                    <span className="field-label">
                      Product name
                      <small className="field-hint">Required</small>
                    </span>

                    <input
                      type="text"
                      maxLength={120}
                      value={form.productName}
                      placeholder="e.g. Premium Leather Sneakers"
                      onChange={(event) =>
                        updateField(
                          "productName",
                          event.target.value,
                        )
                      }
                      aria-invalid={Boolean(fieldErrors.productName)}
                      aria-describedby={
                        fieldErrors.productName
                          ? "product-name-error"
                          : undefined
                      }
                    />
                    {fieldErrors.productName ? (
                      <span className="field-error" id="product-name-error">
                        {fieldErrors.productName}
                      </span>
                    ) : null}
                  </label>

                  <label className={`field ${fieldState("category")}`}>
                    <span className="field-label">
                      Category
                    </span>

                    <select
                      value={form.category}
                      onChange={(event) =>
                        updateField(
                          "category",
                          event.target.value,
                        )
                      }
                      aria-invalid={Boolean(fieldErrors.category)}
                      aria-describedby={
                        fieldErrors.category
                          ? "category-error"
                          : undefined
                      }
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.category ? (
                      <span className="field-error" id="category-error">
                        {fieldErrors.category}
                      </span>
                    ) : null}
                  </label>

                  <label className={`field ${fieldState("price")}`}>
                    <span className="field-label">
                      Current price
                      <small className="field-hint">
                        Required
                      </small>
                    </span>

                    <div className="price-field">
                      <span className="price-prefix">₦</span>

                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.price}
                        placeholder="25,000"
                        onChange={(event) =>
                          updateField(
                            "price",
                            event.target.value.replace(
                              /[^\d]/g,
                              "",
                            ),
                          )
                        }
                        aria-invalid={Boolean(fieldErrors.price)}
                        aria-describedby={
                          fieldErrors.price
                            ? "price-error"
                            : undefined
                        }
                      />
                    </div>
                    {fieldErrors.price ? (
                      <span className="field-error" id="price-error">
                        {fieldErrors.price}
                      </span>
                    ) : null}
                  </label>

                  <label className={`field full ${fieldState("description")}`}>
                    <span className="field-label">
                      Description
                      <small className="field-hint">
                        {form.description.length}/1000
                      </small>
                    </span>

                    <textarea
                      maxLength={1000}
                      value={form.description}
                      placeholder="Explain what the product is, who it is for, and why someone should buy it."
                      onChange={(event) =>
                        updateField(
                          "description",
                          event.target.value,
                        )
                      }
                      aria-invalid={Boolean(fieldErrors.description)}
                      aria-describedby={
                        fieldErrors.description
                          ? "description-error"
                          : undefined
                      }
                    />

                    {fieldErrors.description ? (
                      <span className="field-error" id="description-error">
                        {fieldErrors.description}
                      </span>
                    ) : null}

                    <span className="field-counter">
                      {form.description.length}/1000
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="form-card">
              <div className="form-card-inner">
                <div className="form-card-header">
                  <span className="form-card-number">03</span>
                  <div>
                    <h2>Why should they buy?</h2>
                    <p>
                      Add up to three short reasons that make the product
                      easier to choose.
                    </p>
                  </div>
                </div>

                <div className="points-grid">
                  {form.sellingPoints.map((point, index) => (
                    <label
                      className={`point-row ${fieldState(
                        `sellingPoints.${index}`,
                      )}`}
                      key={index}
                    >
                      <span className="point-number">
                        {index + 1}
                      </span>

                      <input
                        type="text"
                        maxLength={120}
                        value={point}
                        placeholder={
                          index === 0
                            ? "Premium quality"
                            : index === 1
                              ? "Fast delivery"
                              : "Great value for money"
                        }
                        onChange={(event) =>
                          updatePoint(
                            index,
                            event.target.value,
                          )
                        }
                        aria-invalid={Boolean(
                          fieldErrors[`sellingPoints.${index}`],
                        )}
                        aria-describedby={
                          fieldErrors[`sellingPoints.${index}`]
                            ? `selling-point-error-${index}`
                            : undefined
                        }
                      />
                      {fieldErrors[`sellingPoints.${index}`] ? (
                        <span
                          className="field-error"
                          id={`selling-point-error-${index}`}
                        >
                          {fieldErrors[`sellingPoints.${index}`]}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-card">
              <div className="form-card-inner">
                <div className="form-card-header">
                  <span className="form-card-number">04</span>
                  <div>
                    <h2>Business & delivery</h2>
                    <p>
                      Tell the buyer who they are ordering from and what
                      happens after they place an order.
                    </p>
                  </div>
                </div>

                <div className="field-grid">
                  <label className={`field ${fieldState("brandName")}`}>
                    <span className="field-label">
                      Business name
                      <small className="field-hint">
                        Required
                      </small>
                    </span>

                    <input
                      type="text"
                      maxLength={100}
                      value={form.brandName}
                      placeholder="e.g. The Monarch Collection"
                      onChange={(event) =>
                        updateField(
                          "brandName",
                          event.target.value,
                        )
                      }
                      aria-invalid={Boolean(fieldErrors.brandName)}
                      aria-describedby={
                        fieldErrors.brandName
                          ? "brand-name-error"
                          : undefined
                      }
                    />
                    {fieldErrors.brandName ? (
                      <span className="field-error" id="brand-name-error">
                        {fieldErrors.brandName}
                      </span>
                    ) : null}
                  </label>

                  <label className={`field ${fieldState("whatsappNumber")}`}>
                    <span className="field-label">
                      WhatsApp number
                      <small className="field-hint">
                        Required
                      </small>
                    </span>

                    <input
                      type="tel"
                      maxLength={30}
                      value={form.whatsappNumber}
                      placeholder="08012345678"
                      onChange={(event) =>
                        updateField(
                          "whatsappNumber",
                          event.target.value,
                        )
                      }
                      aria-invalid={Boolean(fieldErrors.whatsappNumber)}
                      aria-describedby={
                        fieldErrors.whatsappNumber
                          ? "whatsapp-error"
                          : undefined
                      }
                    />
                    {fieldErrors.whatsappNumber ? (
                      <span className="field-error" id="whatsapp-error">
                        {fieldErrors.whatsappNumber}
                      </span>
                    ) : null}
                  </label>

                  <label className={`field full ${fieldState("deliveryInfo")}`}>
                    <span className="field-label">
                      Delivery information
                      <small className="field-hint">
                        Required
                      </small>
                    </span>

                    <textarea
                      maxLength={500}
                      value={form.deliveryInfo}
                      placeholder="e.g. Same-day Lagos delivery. Nationwide delivery available."
                      onChange={(event) =>
                        updateField(
                          "deliveryInfo",
                          event.target.value,
                        )
                      }
                      aria-invalid={Boolean(fieldErrors.deliveryInfo)}
                      aria-describedby={
                        fieldErrors.deliveryInfo
                          ? "delivery-info-error"
                          : undefined
                      }
                    />
                    {fieldErrors.deliveryInfo ? (
                      <span className="field-error" id="delivery-info-error">
                        {fieldErrors.deliveryInfo}
                      </span>
                    ) : null}
                  </label>
                </div>
              </div>
            </div>

            <div className="form-card">
              <div className="form-card-inner">
                <div className="form-card-header">
                  <span className="form-card-number">05</span>
                  <div>
                    <h2>Offer & availability</h2>
                    <p>
                      Optional information for discounts, promotions and
                      stock status.
                    </p>
                  </div>
                </div>

                <div className="offer-box">
                  <div className="field-grid">
                    <label className={`field ${fieldState("originalPrice")}`}>
                      <span className="field-label">
                        Original price
                      </span>

                      <div className="price-field">
                        <span className="price-prefix">₦</span>

                        <input
                          type="text"
                          inputMode="numeric"
                          value={form.originalPrice}
                          placeholder="30,000"
                          onChange={(event) =>
                            updateField(
                              "originalPrice",
                              event.target.value.replace(
                                /[^\d]/g,
                                "",
                              ),
                            )
                          }
                          aria-invalid={Boolean(fieldErrors.originalPrice)}
                          aria-describedby={
                            fieldErrors.originalPrice
                              ? "original-price-error"
                              : undefined
                          }
                        />
                      </div>
                      {fieldErrors.originalPrice ? (
                        <span
                          className="field-error"
                          id="original-price-error"
                        >
                          {fieldErrors.originalPrice}
                        </span>
                      ) : null}
                    </label>

                    <label className="field">
                      <span className="field-label">
                        Promotion end date
                      </span>

                      <input
                        type="date"
                        value={form.promotionEndAt}
                        onChange={(event) =>
                          updateField(
                            "promotionEndAt",
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label
                      className={`field full ${fieldState(
                        "promotionText",
                      )}`}
                    >
                      <span className="field-label">
                        Promotion text
                      </span>

                      <input
                        type="text"
                        maxLength={180}
                        value={form.promotionText}
                        placeholder="e.g. Free delivery this week"
                        onChange={(event) =>
                          updateField(
                            "promotionText",
                            event.target.value,
                          )
                        }
                        aria-invalid={Boolean(fieldErrors.promotionText)}
                        aria-describedby={
                          fieldErrors.promotionText
                            ? "promotion-text-error"
                            : undefined
                        }
                      />
                      {fieldErrors.promotionText ? (
                        <span className="field-error" id="promotion-text-error">
                          {fieldErrors.promotionText}
                        </span>
                      ) : null}
                    </label>
                  </div>

                  <div className="field">
                    <span className="field-label">
                      Availability
                    </span>

                    <div className="availability-grid">
                      {AVAILABILITY_OPTIONS.map(
                        (option) => (
                          <span
                            className="availability-option"
                            key={option.value}
                          >
                            <input
                              id={`availability-${option.value}`}
                              type="radio"
                              name="availability"
                              value={option.value}
                              checked={
                                form.availability ===
                                option.value
                              }
                              onChange={(event) =>
                                updateField(
                                  "availability",
                                  event.target.value,
                                )
                              }
                            />

                            <label
                              htmlFor={`availability-${option.value}`}
                            >
                              {option.label}
                            </label>
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="builder-submit">
              <div className="builder-submit-copy">
                <strong>
                  {createdPage && !imagesUploaded
                    ? "Draft saved — image upload needs another try."
                    : createdPage
                      ? "Your page is ready to publish."
                      : "Ready to turn this into a public page?"}
                </strong>

                <span>
                  {createdPage && !imagesUploaded
                    ? "Your draft is safe. Upload the images again to continue."
                    : createdPage
                      ? "Pay ₦3,000 once. Your page goes public after payment is verified."
                      : "One-time payment of ₦3,000. No account or subscription."}
                </span>
              </div>

              <button
                type="button"
                className="button button-primary"
                onClick={handleContinue}
                disabled={submitting || Boolean(createdPage)}
              >
                {submitting
                  ? "Saving…"
                  : createdPage && !imagesUploaded
                    ? "Retry image upload"
                    : createdPage
                      ? "Draft saved"
                      : "Continue to payment"}

                <span className="button-accent">
                  {submitting
                    ? "…"
                    : createdPage && !imagesUploaded
                      ? "↻"
                      : createdPage
                        ? "✓"
                        : "→"}
                </span>
              </button>
            </div>

            {createdPage && imagesUploaded ? (
              <div className="payment-card" aria-labelledby="payment-card-title">
                <div className="payment-card-heading">
                  <div>
                    <span className="payment-card-kicker">06 · Payment</span>
                    <h2 id="payment-card-title">Publish your product page</h2>
                    <p>
                      Pay ₦3,000 once. After Paystack confirms the payment, your
                      page becomes public immediately.
                    </p>
                  </div>
                  <strong className="payment-card-price">₦3,000</strong>
                </div>

                <label className="payment-email-field-light">
                  <span>Email for receipt &amp; page access</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={paymentEmail}
                    placeholder="you@example.com"
                    onChange={(event) => {
                      setPaymentEmail(event.target.value);
                      setError("");
                    }}
                    disabled={paymentSubmitting}
                  />
                  <small>
                    We use this for your payment receipt and to email you a backup copy of your public page and private edit link. No account is created.
                  </small>
                </label>

                <button
                  type="button"
                  className="button button-primary payment-continue-button"
                  onClick={handlePayment}
                  disabled={paymentSubmitting}
                >
                  {paymentSubmitting ? "Opening secure payment…" : "Pay ₦3,000 & publish"}
                  <span className="button-accent">
                    {paymentSubmitting ? "…" : "→"}
                  </span>
                </button>

                <p className="payment-card-note">
                  Secured by Paystack · NGN · One-time payment
                </p>
              </div>
            ) : null}

            {message ? (
              <div className="preview-note" role="status">
                <strong>Saved</strong>
                <span>{message}</span>
              </div>
            ) : null}

            {error ? (
              <div
                className="preview-note"
                role="alert"
              >
                <strong>Check this</strong>
                <span>{error}</span>
              </div>
            ) : null}

            {createdPage ? (
              <div className="preview-note">
                <strong>Draft saved</strong>
                <span>
                  Your product page is saved as /p/
                  {createdPage.publicSlug}. Your product images are also
                  stored securely. Payment and publishing will connect next.
                  Your private draft details are preserved for this session.
                </span>
              </div>
            ) : null}
          </section>

          <aside className="preview-wrap">
            <div className="preview-toolbar">
              <div className="preview-toolbar-copy">
                <span>Live preview</span>
                <strong>Your public product page</strong>
              </div>

              <span className="preview-device-label">
                Mobile first
              </span>
            </div>

            <div className="preview-frame">
              <div className="preview-browser-bar">
                <div
                  className="preview-browser-dots"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </div>

                <div className="preview-browser-url">
                  {createdPage
                    ? `statusfly.com/p/${createdPage.publicSlug}`
                    : "statusfly.com/p/your-product"}
                </div>

                <span className="preview-browser-action">
                  Preview
                </span>
              </div>

              <ProductPagePreview
                brandName={form.brandName}
                productName={form.productName}
                category={form.category}
                description={form.description}
                price={form.price}
                originalPrice={form.originalPrice}
                promotionText={form.promotionText}
                availability={form.availability}
                sellingPoints={validPoints}
                whatsappNumber={form.whatsappNumber}
                deliveryInfo={form.deliveryInfo}
                images={images}
                activeImage={activeImage}
                publicSlug={createdPage?.publicSlug}
                onSelectImage={setActiveImage}
              />
            </div>

            <div className="preview-note">
              <strong>The goal</strong>
              <span>
                A customer sees the product, understands
                the offer and has a single clear next step:
                start a WhatsApp order.
              </span>
            </div>
          </aside>
        </div>
      </div>
      )}
    </main>
  );
}

export default CreatePage;

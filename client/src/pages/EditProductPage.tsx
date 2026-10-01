import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getEditableProductPage,
  updateProductPage,
  uploadProductPageImages,
  type EditableProductPage,
  type ProductPageAvailability,
} from "../api/productPages";
import type { ProductPageBuilderForm } from "../types/productPage";
import { validateProductPage } from "../utils/productPageValidation";

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

interface SelectedImage {
  file: File;
  url: string;
}

function formatDateForInput(value: string | null) {
  if (!value) {
    return "";
  }

  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];

  if (datePart) {
    return datePart;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formFromPage(page: EditableProductPage): ProductPageBuilderForm {
  return {
    brandName: page.brandName,
    productName: page.productName,
    category: page.category,
    description: page.description,
    price: String(page.priceNaira),
    originalPrice:
      page.originalPriceNaira === null
        ? ""
        : String(page.originalPriceNaira),
    promotionText: page.promotionText ?? "",
    promotionEndAt: formatDateForInput(page.promotionEndAt),
    availability: page.availability,
    sellingPoints: [
      page.sellingPoints[0] ?? "",
      page.sellingPoints[1] ?? "",
      page.sellingPoints[2] ?? "",
    ],
    whatsappNumber: page.whatsappNumber,
    deliveryInfo: page.deliveryInfo,
  };
}

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

function EditProductPage() {
  const { token = "" } = useParams();
  const [page, setPage] = useState<EditableProductPage | null>(null);
  const [form, setForm] = useState<ProductPageBuilderForm | null>(null);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [replacingImages, setReplacingImages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const selectedImagesRef = useRef<SelectedImage[]>([]);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("This private edit link is incomplete.");
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const result = await getEditableProductPage(token);

        if (!cancelled) {
          setPage(result);
          setForm(formFromPage(result));
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load this product page.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    return () => {
      selectedImagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.url);
      });
    };
  }, []);

  const completion = useMemo(() => {
    if (!form) {
      return 0;
    }

    const imageCount = replacingImages
      ? selectedImages.length
      : page?.images.length ?? 0;

    const required = [
      form.brandName.trim(),
      form.productName.trim(),
      form.description.trim(),
      form.price.trim(),
      form.whatsappNumber.trim(),
      form.deliveryInfo.trim(),
      imageCount > 0,
    ];

    const complete = required.filter(Boolean).length;
    return Math.round((complete / required.length) * 100);
  }, [form, page?.images.length, replacingImages, selectedImages.length]);

  const validPoints =
    form?.sellingPoints.filter((point) => point.trim()) ?? [];

  function updateField(
    field: keyof ProductPageBuilderForm,
    value: string,
  ) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
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
  }

  function updatePoint(index: number, value: string) {
    setForm((current) => {
      if (!current) {
        return current;
      }

      const sellingPoints = [...current.sellingPoints];
      sellingPoints[index] = value;

      return { ...current, sellingPoints };
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
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (!files.length) {
      return;
    }

    const accepted: SelectedImage[] = [];
    const errors: string[] = [];

    for (const file of files.slice(0, 3)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        errors.push("Use JPG, PNG or WebP images only.");
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        errors.push("Each image must be 10MB or smaller.");
        continue;
      }

      accepted.push({
        file,
        url: URL.createObjectURL(file),
      });
    }

    if (files.length > 3) {
      errors.push("You can choose a maximum of 3 images.");
    }

    if (!accepted.length) {
      setError(errors[0] ?? "Choose at least one image.");
      event.target.value = "";
      return;
    }

    selectedImagesRef.current.forEach((image) => {
      URL.revokeObjectURL(image.url);
    });

    setSelectedImages(accepted);
    setReplacingImages(true);
    setMessage("");
    setError(errors[0] ?? "");
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.images;
      return next;
    });
    event.target.value = "";
  }

  function clearImageReplacement() {
    selectedImagesRef.current.forEach((image) => {
      URL.revokeObjectURL(image.url);
    });

    setSelectedImages([]);
    setReplacingImages(false);
    setError("");
    setMessage("Current product images will be kept.");
  }

  function validateBeforeSave() {
    if (!form) {
      return { form: "Product page data is not loaded yet." };
    }

    const imageCount = replacingImages
      ? selectedImages.length
      : page?.images.length ?? 0;

    return validateProductPage(form, imageCount);
  }

  async function handleSave() {
    if (!form || !page) {
      return;
    }

    setMessage("");
    setError("");

    const validationErrors = validateBeforeSave();

    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setError(
        Object.values(validationErrors)[0] ??
          "Check the highlighted fields before saving.",
      );
      return;
    }

    setFieldErrors({});
    setSaving(true);

    try {
      const updated = await updateProductPage(token, {
        brandName: form.brandName.trim(),
        whatsappNumber: cleanWhatsAppNumber(form.whatsappNumber),
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
        promotionEndAt: form.promotionEndAt.trim() || null,
        availability: form.availability,
      });

      if (replacingImages) {
        const imageResponse = await uploadProductPageImages(
          token,
          selectedImages.map((image) => image.file),
        );

        setPage({
          ...updated,
          images: imageResponse.images
            .map((image) => ({
              id: image.id,
              productPageId: image.product_page_id,
              storageKey: image.storage_key,
              publicUrl: image.public_url,
              position: image.position,
              createdAt: image.created_at,
            }))
            .sort((a, b) => a.position - b.position),
        });
        setReplacingImages(false);
        selectedImagesRef.current.forEach((image) => {
          URL.revokeObjectURL(image.url);
        });
        setSelectedImages([]);
      } else {
        setPage(updated);
      }

      setMessage(
        page.status === "published"
          ? "Changes saved. Your live product page has been updated."
          : "Changes saved. Your draft has been updated.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save your changes right now.",
      );
    } finally {
      setSaving(false);
    }
  }

  function fieldState(field: string) {
    return fieldErrors[field] ? "has-error" : "";
  }

  if (loading) {
    return (
      <main className="payment-result-page">
        <div className="payment-result-card">
          <span className="payment-result-kicker">StatusFly</span>
          <div className="payment-result-spinner" aria-hidden="true" />
          <h1>Loading your product page</h1>
          <p>Checking your private edit link securely.</p>
        </div>
      </main>
    );
  }

  if (error && !form) {
    return (
      <main className="payment-result-page">
        <div className="payment-result-card">
          <span className="payment-result-kicker">Private editor</span>
          <div className="payment-result-icon payment-result-icon-error">!</div>
          <h1>We couldn't open this page.</h1>
          <p>{error}</p>
          <div className="payment-result-actions">
            <Link className="button button-primary" to="/">
              Back to StatusFly
              <span className="button-accent">↗</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!page || !form) {
    return null;
  }

  const publicUrl = `/p/${page.publicSlug}`;
  const updatedAt = formatDate(page.updatedAt);
  const publishedAt = formatDate(page.publishedAt);

  return (
    <main className="builder-page">
      <div className="builder-shell">
        <header className="builder-topbar">
          <div className="builder-topbar-left">
            <Link className="brand brand-mark" to="/">
              StatusFly
            </Link>
            <Link className="builder-back" to={publicUrl}>
              ← View page
            </Link>
          </div>

          <div className="phase7-editor-status phase8-editor-status-actions">
            {page.status === "published" ? (
              <Link className="phase8-insights-link" to={`/insights/${token}`}>View insights →</Link>
            ) : null}
            <span className={`phase7-status-dot ${page.status}`} />
            {page.status === "published" ? "Live product page" : "Draft product page"}
          </div>
        </header>

        <section className="builder-heading">
          <div>
            <span className="phase7-editor-kicker">Private editor</span>
            <h1>Keep your product page up to date.</h1>
            <p>
              No account required. Changes you save here appear on the same public
              product link.
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

        <div className="builder-layout phase7-editor-layout">
          <section className="builder-form">
            <div className="form-card">
              <div className="form-card-inner">
                <div className="form-card-header">
                  <span className="form-card-number">01</span>
                  <div>
                    <h2>Product images</h2>
                    <p>
                      Your current images are already live. Selecting new images replaces
                      the current set with up to three new images.
                    </p>
                  </div>
                </div>

                <div className="phase7-current-images">
                  {page.images.length ? (
                    page.images.map((image, index) => (
                      <div className="phase7-existing-image" key={image.id}>
                        <img src={image.publicUrl} alt={`${page.productName} view ${index + 1}`} />
                        <span>{index === 0 ? "Main image" : `Image ${index + 1}`}</span>
                      </div>
                    ))
                  ) : (
                    <div className="phase7-no-images">No product images are saved yet.</div>
                  )}
                </div>

                {replacingImages ? (
                  <div className="phase7-replacement-preview">
                    {selectedImages.map((image, index) => (
                      <div className="phase7-existing-image" key={image.url}>
                        <img src={image.url} alt={`New product view ${index + 1}`} />
                        <span>{index === 0 ? "New main image" : `New image ${index + 1}`}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="phase7-image-actions">
                  <label className="button button-secondary phase7-image-picker">
                    {replacingImages ? "Choose different images" : "Replace images"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={handleImageChange}
                      disabled={saving}
                    />
                  </label>

                  {replacingImages ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={clearImageReplacement}
                      disabled={saving}
                    >
                      Keep current images
                    </button>
                  ) : null}
                </div>

                {fieldErrors.images ? (
                  <p className="field-error">{fieldErrors.images}</p>
                ) : null}
              </div>
            </div>

            <div className="form-card">
              <div className="form-card-inner">
                <div className="form-card-header">
                  <span className="form-card-number">02</span>
                  <div>
                    <h2>Product details</h2>
                    <p>Keep the information customers see clear and current.</p>
                  </div>
                </div>

                <div className="field-grid">
                  <label className={`field full ${fieldState("productName")}`}>
                    <span className="field-label">Product name</span>
                    <input
                      value={form.productName}
                      onChange={(event) => updateField("productName", event.target.value)}
                      maxLength={120}
                      aria-invalid={Boolean(fieldErrors.productName)}
                    />
                    <span className="field-counter">{form.productName.length}/120</span>
                    {fieldErrors.productName ? <span className="field-error">{fieldErrors.productName}</span> : null}
                  </label>

                  <label className={`field ${fieldState("category")}`}>
                    <span className="field-label">Category</span>
                    <select
                      value={form.category}
                      onChange={(event) => updateField("category", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.category)}
                    >
                      {!CATEGORIES.includes(form.category) ? (
                        <option value={form.category}>{form.category}</option>
                      ) : null}
                      {CATEGORIES.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    {fieldErrors.category ? <span className="field-error">{fieldErrors.category}</span> : null}
                  </label>

                  <label className={`field ${fieldState("price")} price-field`}>
                    <span className="field-label">Current price</span>
                    <span className="price-prefix">₦</span>
                    <input
                      inputMode="numeric"
                      value={form.price}
                      onChange={(event) => updateField("price", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.price)}
                    />
                    {fieldErrors.price ? <span className="field-error">{fieldErrors.price}</span> : null}
                  </label>

                  <label className={`field full ${fieldState("description")}`}>
                    <span className="field-label">Description</span>
                    <textarea
                      value={form.description}
                      onChange={(event) => updateField("description", event.target.value)}
                      maxLength={1000}
                      aria-invalid={Boolean(fieldErrors.description)}
                    />
                    <span className="field-counter">{form.description.length}/1000</span>
                    {fieldErrors.description ? <span className="field-error">{fieldErrors.description}</span> : null}
                  </label>
                </div>
              </div>
            </div>

            <div className="form-card">
              <div className="form-card-inner">
                <div className="form-card-header">
                  <span className="form-card-number">03</span>
                  <div>
                    <h2>Selling points</h2>
                    <p>Show customers up to three useful reasons to buy.</p>
                  </div>
                </div>

                <div className="points-grid">
                  {form.sellingPoints.map((point, index) => (
                    <label className="point-row" key={index}>
                      <span className="point-number">{index + 1}</span>
                      <span className="field">
                        <input
                          value={point}
                          maxLength={120}
                          placeholder={`Selling point ${index + 1}`}
                          onChange={(event) => updatePoint(index, event.target.value)}
                          aria-invalid={Boolean(fieldErrors[`sellingPoints.${index}`])}
                        />
                        {fieldErrors[`sellingPoints.${index}`] ? (
                          <span className="field-error">{fieldErrors[`sellingPoints.${index}`]}</span>
                        ) : null}
                      </span>
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
                    <h2>Seller information</h2>
                    <p>These details power the WhatsApp order flow.</p>
                  </div>
                </div>

                <div className="field-grid">
                  <label className={`field ${fieldState("brandName")}`}>
                    <span className="field-label">Brand or business name</span>
                    <input
                      value={form.brandName}
                      maxLength={100}
                      onChange={(event) => updateField("brandName", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.brandName)}
                    />
                    {fieldErrors.brandName ? <span className="field-error">{fieldErrors.brandName}</span> : null}
                  </label>

                  <label className={`field ${fieldState("whatsappNumber")}`}>
                    <span className="field-label">WhatsApp number</span>
                    <input
                      value={form.whatsappNumber}
                      inputMode="tel"
                      maxLength={30}
                      onChange={(event) => updateField("whatsappNumber", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.whatsappNumber)}
                    />
                    {fieldErrors.whatsappNumber ? <span className="field-error">{fieldErrors.whatsappNumber}</span> : null}
                  </label>

                  <label className={`field full ${fieldState("deliveryInfo")}`}>
                    <span className="field-label">Delivery information</span>
                    <textarea
                      value={form.deliveryInfo}
                      maxLength={500}
                      onChange={(event) => updateField("deliveryInfo", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.deliveryInfo)}
                    />
                    <span className="field-counter">{form.deliveryInfo.length}/500</span>
                    {fieldErrors.deliveryInfo ? <span className="field-error">{fieldErrors.deliveryInfo}</span> : null}
                  </label>
                </div>
              </div>
            </div>

            <div className="form-card">
              <div className="form-card-inner">
                <div className="form-card-header">
                  <span className="form-card-number">05</span>
                  <div>
                    <h2>Offers & availability</h2>
                    <p>Update pricing context or the current product status.</p>
                  </div>
                </div>

                <div className="offer-box">
                  <div className="field-grid">
                    <label className={`field ${fieldState("originalPrice")} price-field`}>
                      <span className="field-label">Original price <span className="field-hint">Optional</span></span>
                      <span className="price-prefix">₦</span>
                      <input
                        inputMode="numeric"
                        value={form.originalPrice}
                        onChange={(event) => updateField("originalPrice", event.target.value)}
                        aria-invalid={Boolean(fieldErrors.originalPrice)}
                      />
                      {fieldErrors.originalPrice ? <span className="field-error">{fieldErrors.originalPrice}</span> : null}
                    </label>

                    <label className={`field ${fieldState("promotionText")}`}>
                      <span className="field-label">Promotion text <span className="field-hint">Optional</span></span>
                      <input
                        value={form.promotionText}
                        maxLength={180}
                        onChange={(event) => updateField("promotionText", event.target.value)}
                        aria-invalid={Boolean(fieldErrors.promotionText)}
                      />
                      {fieldErrors.promotionText ? <span className="field-error">{fieldErrors.promotionText}</span> : null}
                    </label>

                    <label className="field">
                      <span className="field-label">Promotion end date <span className="field-hint">Optional</span></span>
                      <input
                        type="date"
                        value={form.promotionEndAt}
                        onChange={(event) => updateField("promotionEndAt", event.target.value)}
                      />
                    </label>
                  </div>

                  <div>
                    <span className="field-label">Availability</span>
                    <div className="availability-grid">
                      {AVAILABILITY_OPTIONS.map((option) => (
                        <div className="availability-option" key={option.value}>
                          <input
                            type="radio"
                            id={`phase7-${option.value}`}
                            name="phase7-availability"
                            value={option.value}
                            checked={form.availability === option.value}
                            onChange={(event) => updateField("availability", event.target.value)}
                          />
                          <label htmlFor={`phase7-${option.value}`}>{option.label}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {message ? (
              <div className="preview-note" role="status">
                <strong>Saved</strong>
                <span>{message}</span>
              </div>
            ) : null}

            {error ? (
              <div className="preview-note" role="alert">
                <strong>Check this</strong>
                <span>{error}</span>
              </div>
            ) : null}

            <div className="builder-submit">
              <div className="builder-submit-copy">
                <strong>{saving ? "Saving your changes…" : "Ready to save?"}</strong>
                <span>
                  {page.status === "published"
                    ? "Your public product link will stay the same."
                    : "This page remains private until payment is completed."}
                </span>
              </div>
              <button
                type="button"
                className="button button-primary"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
                <span className="button-accent">{saving ? "…" : "✓"}</span>
              </button>
            </div>
          </section>

          <aside className="preview-wrap phase7-editor-sidebar">
            <div className="phase7-editor-card">
              <span className="phase7-editor-card-kicker">Page status</span>
              <div className="phase7-editor-state">
                <span className={`phase7-status-dot ${page.status}`} />
                <strong>{page.status === "published" ? "Live" : page.status === "hidden" ? "Hidden" : "Draft"}</strong>
              </div>
              <p>
                {page.status === "published"
                  ? "Customers can access this page now. Saved edits update the existing public URL."
                  : "This page is not public yet."}
              </p>
              <Link className="button button-secondary phase7-full-button" to={publicUrl}>
                {page.status === "published" ? "Open public page" : "Preview public URL"}
                <span className="button-accent">↗</span>
              </Link>
            </div>

            <div className="phase7-editor-card">
              <span className="phase7-editor-card-kicker">Public URL</span>
              <code className="phase7-public-url">
                {typeof window !== "undefined"
                  ? `${window.location.origin}${publicUrl}`
                  : publicUrl}
              </code>
              <p>Keep this link for customers. It does not change when you edit the page.</p>
            </div>

            <div className="phase7-editor-card">
              <span className="phase7-editor-card-kicker">Last updated</span>
              <strong>{updatedAt ?? "—"}</strong>
              {publishedAt ? <p>Published {publishedAt}.</p> : <p>Not published yet.</p>}
            </div>

            <div className="phase7-editor-card phase7-private-note">
              <span className="phase7-editor-lock" aria-hidden="true">⌘</span>
              <strong>This editor is private</strong>
              <p>
                Your edit link is the credential for this page. Keep it private and
                only share the public product link with customers.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default EditProductPage;

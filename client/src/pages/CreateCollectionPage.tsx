import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import {
  createProductPage,
  updateProductPage,
  uploadProductPageItemImages,
  type CreatedProductPage,
  type EditableProductPageItem,
  type ProductPageAvailability,
  type ProductPageItemRequest,
} from "../api/productPages";
import { initializeProductPagePayment } from "../api/productPagePayments";
import { trackPlatformEvent } from "../api/platformAnalytics";
import { compressProductImage } from "../utils/compressProductImage";
import CollectionOptionsEditor from "../components/CollectionOptionsEditor";
import { validateCollectionOptions } from "../utils/collectionOptionRules";

const API_CATEGORIES = ["Fashion", "Shoes", "Hair & Wigs", "Beauty", "Perfume", "Food", "Jewelry", "Electronics", "Home", "Other"];
const AVAILABILITIES: Array<{ value: ProductPageAvailability; label: string }> = [
  { value: "available", label: "Available" },
  { value: "low_stock", label: "Low stock" },
  { value: "sold_out", label: "Sold out" },
  { value: "coming_soon", label: "Coming soon" },
  { value: "preorder", label: "Pre-order" },
];

interface LocalImage { file: File; url: string }
interface CollectionDraftItem {
  id?: string;
  productName: string;
  category: string;
  description: string;
  price: string;
  originalPrice: string;
  availability: ProductPageAvailability;
  options: ProductPageItemRequest["options"];
  images: LocalImage[];
  imagesUploaded: boolean;
}

function blankItem(): CollectionDraftItem {
  return {
    productName: "",
    category: "Other",
    description: "",
    price: "",
    originalPrice: "",
    availability: "available",
    options: [],
    images: [],
    imagesUploaded: false,
  };
}

function cleanWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
}

function parsePrice(value: string) {
  const amount = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function toItemRequest(item: CollectionDraftItem, index: number): ProductPageItemRequest {
  const options = item.options;
  const optionsError = validateCollectionOptions(options);
  if (optionsError) throw new Error(`Item ${index + 1}: ${optionsError}`);
  const priceNaira = parsePrice(item.price);
  const originalPriceNaira = item.originalPrice.trim() ? parsePrice(item.originalPrice) : null;
  if (!item.productName.trim()) throw new Error(`Enter a name for item ${index + 1}.`);
  if (!item.description.trim()) throw new Error(`Enter a description for item ${index + 1}.`);
  if (!priceNaira) throw new Error(`Enter a valid price for item ${index + 1}.`);
  if (originalPriceNaira !== null && originalPriceNaira <= priceNaira) throw new Error(`The original price for item ${index + 1} must be greater than its current price.`);
  if (!item.images.length) throw new Error(`Add at least one image for item ${index + 1}.`);
  return {
    ...(item.id ? { id: item.id } : {}),
    productName: item.productName.trim(),
    category: item.category,
    description: item.description.trim(),
    sellingPoints: [],
    priceNaira,
    originalPriceNaira,
    promotionText: null,
    promotionEndAt: null,
    availability: item.availability,
    options,
  };
}

function CreateCollectionPage() {
  const [brandName, setBrandName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [deliveryInfo, setDeliveryInfo] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [items, setItems] = useState<CollectionDraftItem[]>([blankItem(), blankItem()]);
  const [createdPage, setCreatedPage] = useState<CreatedProductPage | null>(null);
  const [paymentEmail, setPaymentEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const imageRefs = useRef<LocalImage[]>([]);

  useEffect(() => {
    trackPlatformEvent("create_view");
  }, []);

  useEffect(() => {
    imageRefs.current = items.flatMap((item) => item.images);
  }, [items]);

  useEffect(() => () => imageRefs.current.forEach((image) => URL.revokeObjectURL(image.url)), []);

  const imageCount = items.reduce((total, item) => total + item.images.length, 0);
  const completion = useMemo(() => {
    const requiredChecks = [
      brandName.trim().length > 0,
      whatsappNumber.trim().length > 0,
      deliveryInfo.trim().length > 0,
      collectionTitle.trim().length > 0,
    ];

    const itemChecks = items.flatMap((item) => [
      item.productName.trim().length > 0,
      item.description.trim().length > 0,
      parsePrice(item.price) > 0,
      item.images.length > 0,
    ]);

    const checks = [...requiredChecks, ...itemChecks];
    console.log("Collection readiness debug:", {
  brandName: brandName.trim().length > 0,
  whatsappNumber: whatsappNumber.trim().length > 0,
  deliveryInfo: deliveryInfo.trim().length > 0,
  collectionTitle: collectionTitle.trim().length > 0,
  items: items.map((item, index) => ({
    item: index + 1,
    productName: item.productName.trim().length > 0,
    description: item.description.trim().length > 0,
    price: parsePrice(item.price) > 0,
    images: item.images.length > 0,
  })),
});
    const completed = checks.filter(Boolean).length;

    return checks.length > 0
      ? Math.round((completed / checks.length) * 100)
      : 0;
  }, [
    brandName,
    whatsappNumber,
    deliveryInfo,
    collectionTitle,
    items,
  ]);

  function updateItem(index: number, patch: Partial<CollectionDraftItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    setMessage("");
    setError("");
  }

  function handleImageChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const errors: string[] = [];
    const currentItem = items[index];
    if (!currentItem) return;
    const remainingSlots = Math.max(0, 3 - currentItem.images.length);
    const accepted: LocalImage[] = [];
    for (const file of files.slice(0, remainingSlots)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        errors.push("Use JPG, PNG or WebP images only.");
      } else if (file.size > 10 * 1024 * 1024) {
        errors.push("Each image must be 10MB or smaller.");
      } else {
        accepted.push({ file, url: URL.createObjectURL(file) });
      }
    }
    if (files.length > remainingSlots) errors.push("Each item can have a maximum of 3 photos in total.");
    if (!accepted.length) {
      setError(errors[0] || "Choose at least one image.");
      return;
    }
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return { ...item, images: [...item.images, ...accepted], imagesUploaded: false };
    }));
    setMessage("");
    setError(errors[0] || "");
  }

  function moveImage(itemIndex: number, imageIndex: number, direction: number) {
    setItems((current) => current.map((item, index) => {
      if (index !== itemIndex) return item;
      const target = imageIndex + direction;
      if (target < 0 || target >= item.images.length) return item;
      const images = [...item.images];
      [images[imageIndex], images[target]] = [images[target]!, images[imageIndex]!];
      return { ...item, images, imagesUploaded: false };
    }));
    setMessage("");
  }

  function removeItem(index: number) {
    setItems((current) => {
      const item = current[index];
      item?.images.forEach((image) => URL.revokeObjectURL(image.url));
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    setMessage("");
    setError("");
  }

  function buildPayload(sourceItems: CollectionDraftItem[]) {
    if (!brandName.trim() || brandName.trim().length > 100) throw new Error("Enter a business name (up to 100 characters).");
    const whatsapp = cleanWhatsAppNumber(whatsappNumber);
    if (whatsapp.length < 8 || whatsapp.length > 15) throw new Error("Enter a valid WhatsApp number with 8–15 digits.");
    if (!deliveryInfo.trim() || deliveryInfo.trim().length > 500) throw new Error("Enter delivery information (up to 500 characters).");
    if (!collectionTitle.trim() || collectionTitle.trim().length > 140) throw new Error("Enter a collection title (up to 140 characters).");
    if (sourceItems.length < 2 || sourceItems.length > 10) throw new Error("A collection must contain between 2 and 10 items.");
    const itemRequests = sourceItems.map(toItemRequest);
    const first = itemRequests[0];
    if (!first) throw new Error("Add at least two items to your collection.");
    return {
      pageType: "collection" as const,
      collectionTitle: collectionTitle.trim(),
      collectionDescription: collectionDescription.trim() || null,
      brandName: brandName.trim(),
      whatsappNumber: whatsapp,
      deliveryInfo: deliveryInfo.trim(),
      productName: first.productName,
      category: first.category,
      description: first.description,
      sellingPoints: first.sellingPoints,
      priceNaira: first.priceNaira,
      originalPriceNaira: first.originalPriceNaira,
      promotionText: first.promotionText,
      promotionEndAt: first.promotionEndAt,
      availability: first.availability,
      items: itemRequests,
    };
  }

  async function handleSaveAndContinue() {
    setMessage("");
    setError("");
    setSaving(true);
    try {
      const payload = buildPayload(items);
      let page = createdPage;
      let savedItemIds: Array<{ id: string; position: number; productName: string }> = [];
      if (!page) {
        const response = await createProductPage(payload);
        page = response.productPage;
        savedItemIds = response.productPage.items ?? [];
        setCreatedPage(page);
      } else {
        const response = await updateProductPage(page.editToken, payload);
        savedItemIds = response.items.map((item: EditableProductPageItem) => ({ id: item.id, position: item.position, productName: item.productName }));
      }
      if (!page) throw new Error("Your collection draft could not be saved.");

      const withIds = items.map((item, index) => ({
        ...item,
        id: savedItemIds.find((saved) => saved.position === index + 1)?.id ?? item.id,
      }));
      setItems(withIds);

      for (let index = 0; index < withIds.length; index += 1) {
        const item = withIds[index];
        if (!item || item.imagesUploaded) continue;
        if (!item.id) throw new Error(`The server did not return an ID for item ${index + 1}. Save again to retry.`);
        const uploadFiles = await Promise.all(item.images.map((image) => compressProductImage(image.file)));
        await uploadProductPageItemImages(page.editToken, item.id, uploadFiles);
        withIds[index] = { ...item, imagesUploaded: true };
        setItems([...withIds]);
      }
      setItems(withIds);
      setMessage("Your collection and images are saved. Enter your email below to continue to secure payment.");
      if (!createdPage) trackPlatformEvent("draft_created");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the collection.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePayment() {
    setMessage("");
    setError("");
    if (!createdPage || items.length < 2 || items.some((item) => !item.id || !item.imagesUploaded)) {
      setError("Save every item and its images before paying.");
      return;
    }
    const email = paymentEmail.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address for your payment receipt.");
      return;
    }
    setPaying(true);
    trackPlatformEvent("payment_started");
    try {
      const response = await initializeProductPagePayment(createdPage.editToken, email);
      window.location.assign(response.authorizationUrl);
    } catch (paymentError) {
      trackPlatformEvent("payment_init_failed");
      setError(paymentError instanceof Error ? paymentError.message : "Unable to start payment right now.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <main className="builder-page collection-builder-page">
      <div className="builder-shell">
        <header className="builder-topbar">
          <div className="builder-topbar-left">
            <Link className="brand brand-mark" to="/">StatusFly</Link>
            <Link className="builder-back" to="/create">← Single product</Link>
          </div>
          <span className="builder-step-note">2–10 items · One page · ₦3,500 once</span>
        </header>

        <section className="builder-heading">
          <div>
            <span className="collection-kicker">Collection builder</span>
            <h1>Put your products in one place.</h1>
            <p>Create one shareable collection page, with a separate WhatsApp order button for each item.</p>
          </div>
          <div className="builder-progress">
            <div className="builder-progress-top"><span>Page readiness</span><strong>{completion}%</strong></div>
            <div className="builder-progress-track"><div className="builder-progress-fill" style={{ width: `${completion}%` }} /></div>
          </div>
        </section>

        <div className="collection-builder-stack">
          <section className="form-card">
            <div className="form-card-inner">
              <div className="form-card-header"><span className="form-card-number">01</span><div><h2>Collection details</h2><p>These details apply to the whole page.</p></div></div>
              <div className="field-grid">
                <label className="field full"><span className="field-label">Business or brand name</span><input maxLength={100} value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="e.g. The Monarch Collection" /></label>
                <label className="field full"><span className="field-label">Collection title</span><input maxLength={140} value={collectionTitle} onChange={(event) => setCollectionTitle(event.target.value)} placeholder="e.g. New arrivals" /></label>
                <label className="field full"><span className="field-label">Collection description <span className="field-hint">Optional</span></span><textarea rows={3} maxLength={1000} value={collectionDescription} onChange={(event) => setCollectionDescription(event.target.value)} placeholder="A short introduction to this collection." /></label>
                <label className="field"><span className="field-label">WhatsApp number</span><input value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} placeholder="08012345678" inputMode="tel" /></label>
                <label className="field"><span className="field-label">Delivery information</span><input maxLength={500} value={deliveryInfo} onChange={(event) => setDeliveryInfo(event.target.value)} placeholder="Delivery areas, fees and timing" /></label>
              </div>
            </div>
          </section>

          <div className="collection-items-heading">
            <div><span className="collection-kicker">02 · Your products</span><h2>Items in this collection</h2><p>Add 2–10 products. Every item needs at least one photo.</p></div>
            <span className="collection-item-count">{items.length}/10 items · {imageCount} photos</span>
          </div>

          {items.map((item, index) => (
            <section className="form-card collection-item-editor" key={item.id ?? `new-${index}`}>
              <div className="form-card-inner">
                <div className="collection-item-editor-top"><div className="collection-item-number">{String(index + 1).padStart(2, "0")}</div><div className="collection-item-title"><h3>Item {index + 1}</h3><span>{item.images.length}/3 photos {item.imagesUploaded ? "· saved" : "· not uploaded yet"}</span></div>{items.length > 2 ? <button className="button button-secondary collection-remove-item" type="button" onClick={() => removeItem(index)} disabled={saving}>Remove item</button> : null}</div>
                <div className="collection-item-photo-grid">
                  {item.images.map((image, imageIndex) => <div className={`collection-item-photo ${imageIndex === 0 ? "is-cover-photo" : ""}`} key={image.url}><img src={image.url} alt={`${item.productName || `Item ${index + 1}`} photo ${imageIndex + 1}`} />{imageIndex === 0 ? <span className="cover-photo-badge">Cover photo</span> : <button type="button" className="make-cover-photo" onClick={() => moveImage(index, imageIndex, -imageIndex)} disabled={saving} aria-label={`Make photo ${imageIndex + 1} the cover`}>Set cover</button>}<div className="collection-photo-controls"><button type="button" onClick={() => moveImage(index, imageIndex, -1)} disabled={saving || imageIndex === 0} aria-label={`Move photo ${imageIndex + 1} left`}>←</button><button type="button" onClick={() => moveImage(index, imageIndex, 1)} disabled={saving || imageIndex === item.images.length - 1} aria-label={`Move photo ${imageIndex + 1} right`}>→</button><button type="button" onClick={() => updateItem(index, { images: item.images.filter((_, j) => j !== imageIndex), imagesUploaded: false })} aria-label={`Remove photo ${imageIndex + 1}`}>×</button></div></div>)}
                  {item.images.length < 3 ? <label className="collection-item-photo-add">+<span>{item.images.length ? "Add another photo" : "Add photos"}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => handleImageChange(index, event)} disabled={saving} /></label> : null}
                </div>
                <div className="field-grid collection-item-fields">
                  <label className="field full"><span className="field-label">Item name</span><input value={item.productName} onChange={(event) => updateItem(index, { productName: event.target.value })} maxLength={120} placeholder="e.g. Everyday tote bag" /></label>
                  <label className="field"><span className="field-label">Category</span><select value={item.category} onChange={(event) => updateItem(index, { category: event.target.value })}>{API_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                  <label className="field"><span className="field-label">Price (₦)</span><input inputMode="numeric" value={item.price} onChange={(event) => updateItem(index, { price: event.target.value })} placeholder="25000" /></label>
                  <label className="field"><span className="field-label">Original price (₦) <span className="field-hint">Optional</span></span><input inputMode="numeric" value={item.originalPrice} onChange={(event) => updateItem(index, { originalPrice: event.target.value })} placeholder="30000" /></label>
                  <label className="field"><span className="field-label">Availability</span><select value={item.availability} onChange={(event) => updateItem(index, { availability: event.target.value as ProductPageAvailability })}>{AVAILABILITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className="field full"><span className="field-label">Description</span><textarea rows={3} maxLength={1000} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} placeholder="What should customers know about this item?" /></label>
                  <div className="field full"><CollectionOptionsEditor options={item.options} onChange={(options) => updateItem(index, { options })} disabled={saving || paying} /></div>
                </div>
              </div>
            </section>
          ))}

          <div className="collection-add-row"><button type="button" className="button button-secondary" onClick={() => setItems((current) => [...current, blankItem()])} disabled={items.length >= 10 || saving}>+ Add another item</button><span>You can add up to 10 items in total.</span><button type="button" className="button button-secondary" onClick={() => setShowPreview(true)}>Preview collection ↗</button></div>

          {message ? <div className="preview-note" role="status"><strong>Saved</strong><span>{message}</span></div> : null}
          {error ? <div className="preview-note" role="alert"><strong>Check this</strong><span>{error}</span></div> : null}

          <section className="form-card collection-payment-card">
            <div className="form-card-inner">
              <div className="form-card-header"><span className="form-card-number">03</span><div><h2>Save and publish</h2><p>Save the collection and photos first, then complete the one-time payment.</p></div></div>
              <div className="collection-payment-summary"><span>Collection page</span><strong>₦3,500 once</strong><small>No monthly subscription for this core package.</small></div>
              <button type="button" className="button button-primary collection-save-button" onClick={() => void handleSaveAndContinue()} disabled={saving || paying}>{saving ? "Saving collection…" : createdPage ? "Save collection changes" : "Save collection and images"}<span className="button-accent">{saving ? "…" : "✓"}</span></button>
              {createdPage ? <div className="collection-payment-form"><label className="field"><span className="field-label">Email for your payment receipt</span><input type="email" autoComplete="email" value={paymentEmail} onChange={(event) => setPaymentEmail(event.target.value)} placeholder="you@example.com" /></label><button type="button" className="button button-secondary collection-save-button" onClick={() => void handlePayment()} disabled={paying || saving}>{paying ? "Opening secure payment…" : "Continue to payment · ₦3,500"}<span className="button-accent">↗</span></button><p className="field-note">Your collection remains private until payment is verified and the page is published.</p></div> : null}
            </div>
          </section>
        </div>
      </div>
      {showPreview ? <div className="collection-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPreview(false); }}>
        <section className="collection-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-preview-title">
          <header className="collection-preview-dialog-header"><div><span className="collection-kicker">Live draft preview</span><h2 id="collection-preview-title">{collectionTitle.trim() || "Our Collection"}</h2><p>This is a preview of the information customers will see. Save before paying to upload photos.</p></div><button type="button" className="button button-secondary" onClick={() => setShowPreview(false)}>Close preview</button></header>
          <div className="collection-preview-brand"><strong>{brandName.trim() || "Your brand name"}</strong>{collectionDescription.trim() ? <p>{collectionDescription}</p> : null}<span>{items.length} items · WhatsApp ordering</span></div>
          <div className="collection-preview-grid">{items.map((item, index) => <article className="collection-preview-product" key={item.id ?? `preview-${index}`}><div className="collection-preview-product-image">{item.images[0] ? <img src={item.images[0].url} alt={item.productName || `Item ${index + 1}`} /> : <span>Add a cover photo</span>}<span className="collection-preview-availability">{AVAILABILITIES.find((a) => a.value === item.availability)?.label ?? "Available"}</span></div><div className="collection-preview-product-body"><small>{item.category}</small><h3>{item.productName.trim() || `Item ${index + 1}`}</h3><strong>₦{parsePrice(item.price).toLocaleString("en-NG")}</strong><p>{item.description.trim() || "Your product description will appear here."}</p>{item.options.map((option) => <span className="collection-preview-option" key={option.name}>{option.name}: {option.values.join(", ")}</span>)}<span className="collection-preview-whatsapp">Order via WhatsApp</span></div></article>)}</div>
          <footer className="collection-preview-dialog-footer"><span>One-time payment: <strong>₦3,500</strong></span><button type="button" className="button button-primary" onClick={() => setShowPreview(false)}>Continue editing</button></footer>
        </section>
      </div> : null}
    </main>
  );
}

export default CreateCollectionPage;

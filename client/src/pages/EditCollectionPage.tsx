import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getEditableProductPage,
  updateProductPage,
  uploadProductPageItemImages,
  type EditableProductPage,
  type EditableProductPageItem,
  type ProductPageAvailability,
  type ProductPageItemImage,
  type ProductPageItemRequest,
} from "../api/productPages";
import { compressProductImage } from "../utils/compressProductImage";
import CollectionOptionsEditor from "../components/CollectionOptionsEditor";
import { normalizeCollectionOptions, validateCollectionOptions } from "../utils/collectionOptionRules";

const CATEGORIES = ["Fashion", "Shoes", "Hair & Wigs", "Beauty", "Perfume", "Food", "Jewelry", "Electronics", "Home", "Other"];
const AVAILABILITIES: Array<{ value: ProductPageAvailability; label: string }> = [
  { value: "available", label: "Available" },
  { value: "low_stock", label: "Low stock" },
  { value: "sold_out", label: "Sold out" },
  { value: "coming_soon", label: "Coming soon" },
  { value: "preorder", label: "Pre-order" },
];
interface LocalImage { file: File; url: string }
interface CollectionItemDraft {
  id?: string;
  productName: string;
  category: string;
  description: string;
  price: string;
  originalPrice: string;
  availability: ProductPageAvailability;
  options: ProductPageItemRequest["options"];
  selectedImages: LocalImage[];
  savedImages: ProductPageItemImage[];
  imagesDirty: boolean;
}

function parseNaira(value: string) {
  const amount = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function fromItem(item: EditableProductPageItem): CollectionItemDraft {
  return {
    id: item.id,
    productName: item.productName,
    category: item.category,
    description: item.description,
    price: String(item.priceNaira),
    originalPrice: item.originalPriceNaira === null ? "" : String(item.originalPriceNaira),
    availability: item.availability,
    options: normalizeCollectionOptions(item.options),
    selectedImages: [],
    savedImages: item.images,
    imagesDirty: false,
  };
}

function buildItemRequest(item: CollectionItemDraft, index: number): ProductPageItemRequest {
  const options = item.options;
  const optionsError = validateCollectionOptions(options);
  if (optionsError) throw new Error(`Item ${index + 1}: ${optionsError}`);
  const priceNaira = parseNaira(item.price);
  const originalPriceNaira = item.originalPrice.trim() ? parseNaira(item.originalPrice) : null;
  if (!item.productName.trim()) throw new Error(`Enter a name for item ${index + 1}.`);
  if (!item.description.trim()) throw new Error(`Enter a description for item ${index + 1}.`);
  if (!priceNaira) throw new Error(`Enter a valid price for item ${index + 1}.`);
  if (originalPriceNaira !== null && originalPriceNaira <= priceNaira) throw new Error(`The original price for item ${index + 1} must exceed its current price.`);
  if (!item.savedImages.length && !item.selectedImages.length) throw new Error(`Add at least one photo for item ${index + 1}.`);
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

function EditCollectionPage() {
  const { token = "" } = useParams();
  const [page, setPage] = useState<EditableProductPage | null>(null);
  const [brandName, setBrandName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [deliveryInfo, setDeliveryInfo] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [items, setItems] = useState<CollectionItemDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const localImagesRef = useRef<LocalImage[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setError("This private edit link is incomplete.");
        setLoading(false);
        return;
      }
      try {
        const response = await getEditableProductPage(token);
        if (response.pageType !== "collection") throw new Error("This is a single-product page, not a collection.");
        if (!cancelled) {
          setPage(response);
          setBrandName(response.brandName);
          setWhatsappNumber(response.whatsappNumber);
          setDeliveryInfo(response.deliveryInfo);
          setCollectionTitle(response.collectionTitle ?? "Our Collection");
          setCollectionDescription(response.collectionDescription ?? "");
          setItems(response.items.map(fromItem));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load this collection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    localImagesRef.current = items.flatMap((item) => item.selectedImages);
  }, [items]);
  useEffect(() => () => localImagesRef.current.forEach((image) => URL.revokeObjectURL(image.url)), []);

  const completion = useMemo(() => {
    const required = [brandName.trim(), whatsappNumber.trim(), deliveryInfo.trim(), collectionTitle.trim()];
    const complete = required.filter(Boolean).length + items.filter((item) => item.productName.trim() && item.description.trim() && parseNaira(item.price) > 0 && (item.savedImages.length > 0 || item.selectedImages.length > 0)).length;
    return Math.round((complete / (required.length + items.length)) * 100);
  }, [brandName, whatsappNumber, deliveryInfo, collectionTitle, items]);

  function updateItem(index: number, patch: Partial<CollectionItemDraft>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    setMessage("");
    setError("");
  }

  function handleImageChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const accepted: LocalImage[] = [];
    const errors: string[] = [];
    for (const file of files.slice(0, 3)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) errors.push("Use JPG, PNG or WebP images only.");
      else if (file.size > 10 * 1024 * 1024) errors.push("Each image must be 10MB or smaller.");
      else accepted.push({ file, url: URL.createObjectURL(file) });
    }
    if (files.length > 3) errors.push("Choose no more than 3 images per item.");
    if (!accepted.length) { setError(errors[0] || "Choose at least one image."); return; }
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      item.selectedImages.forEach((image) => URL.revokeObjectURL(image.url));
      return { ...item, selectedImages: accepted, imagesDirty: true };
    }));
    setError(errors[0] || "");
    setMessage("");
  }

  function removeItem(index: number) {
    setItems((current) => {
      const removed = current[index];
      removed?.selectedImages.forEach((image) => URL.revokeObjectURL(image.url));
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    setMessage("");
    setError("");
  }

  function buildPayload(sourceItems: CollectionItemDraft[]) {
    if (!brandName.trim() || brandName.trim().length > 100) throw new Error("Enter a business name (up to 100 characters).");
    const whatsapp = whatsappNumber.replace(/\D/g, "");
    const cleanWhatsApp = whatsapp.startsWith("0") ? `234${whatsapp.slice(1)}` : whatsapp;
    if (cleanWhatsApp.length < 8 || cleanWhatsApp.length > 15) throw new Error("Enter a valid WhatsApp number with 8–15 digits.");
    if (!deliveryInfo.trim() || deliveryInfo.trim().length > 500) throw new Error("Enter delivery information (up to 500 characters).");
    if (!collectionTitle.trim() || collectionTitle.trim().length > 140) throw new Error("Enter a collection title (up to 140 characters).");
    if (sourceItems.length < 2 || sourceItems.length > 10) throw new Error("A collection must have between 2 and 10 items.");
    const itemRequests = sourceItems.map(buildItemRequest);
    const first = itemRequests[0];
    if (!first) throw new Error("Add at least two items.");
    return {
      pageType: "collection" as const,
      collectionTitle: collectionTitle.trim(),
      collectionDescription: collectionDescription.trim() || null,
      brandName: brandName.trim(),
      whatsappNumber: cleanWhatsApp,
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

  async function handleSave() {
    if (!page) return;
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const payload = buildPayload(items);
      const updated = await updateProductPage(token, payload);
      const savedItems = updated.items;
      const aligned = items.map((item, index) => {
        const saved = savedItems.find((candidate) => candidate.position === index + 1) ?? savedItems[index];
        return saved ? { ...item, id: saved.id, savedImages: saved.images } : item;
      });
      setItems(aligned);
      for (let index = 0; index < aligned.length; index += 1) {
        const item = aligned[index];
        if (!item || !item.imagesDirty) continue;
        if (!item.id) throw new Error(`The server did not return an ID for item ${index + 1}.`);
        const uploadFiles = await Promise.all(item.selectedImages.map((image) => compressProductImage(image.file)));
        const uploaded = await uploadProductPageItemImages(token, item.id, uploadFiles);
        const converted: ProductPageItemImage[] = uploaded.map((image) => ({
          id: image.id,
          productItemId: image.product_item_id,
          storageKey: image.storage_key,
          publicUrl: image.public_url,
          position: image.position,
          createdAt: image.created_at,
        }));
        aligned[index] = { ...item, savedImages: converted, selectedImages: [], imagesDirty: false };
        item.selectedImages.forEach((image) => URL.revokeObjectURL(image.url));
        setItems([...aligned]);
      }
      setItems(aligned);
      setPage(updated);
      setMessage(page.status === "published" ? "Collection saved. Your public link stays the same." : "Collection draft saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save collection changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="payment-result-page"><div className="payment-result-card"><span className="payment-result-kicker">StatusFly</span><div className="payment-result-spinner" aria-hidden="true" /><h1>Loading your collection</h1><p>Checking your private edit link securely.</p></div></main>;
  }
  if (!page) {
    return <main className="payment-result-page"><div className="payment-result-card"><span className="payment-result-kicker">Private editor</span><h1>We couldn’t open this collection.</h1><p>{error || "This collection could not be found."}</p><Link className="button button-primary" to="/">Back to StatusFly</Link></div></main>;
  }

  const publicUrl = `/p/${page.publicSlug}`;
  return (
    <main className="builder-page collection-builder-page">
      <div className="builder-shell">
        <header className="builder-topbar"><div className="builder-topbar-left"><Link className="brand brand-mark" to="/">StatusFly</Link><Link className="builder-back" to={publicUrl}>← View page</Link></div><div className="phase7-editor-status"><span className={`phase7-status-dot ${page.status}`} />{page.status === "published" ? "Live collection" : page.status === "hidden" ? "Hidden collection" : "Draft collection"}</div></header>
        <section className="builder-heading"><div><span className="collection-kicker">Private editor</span><h1>Keep your collection up to date.</h1><p>Save changes here and keep the same public link.</p></div><div className="builder-progress"><div className="builder-progress-top"><span>Page readiness</span><strong>{completion}%</strong></div><div className="builder-progress-track"><div className="builder-progress-fill" style={{ width: `${completion}%` }} /></div></div></section>
        <div className="collection-builder-stack">
          <section className="form-card"><div className="form-card-inner"><div className="form-card-header"><span className="form-card-number">01</span><div><h2>Collection details</h2><p>These details apply to the whole page.</p></div></div><div className="field-grid">
            <label className="field full"><span className="field-label">Business or brand name</span><input maxLength={100} value={brandName} onChange={(event) => setBrandName(event.target.value)} /></label>
            <label className="field full"><span className="field-label">Collection title</span><input maxLength={140} value={collectionTitle} onChange={(event) => setCollectionTitle(event.target.value)} /></label>
            <label className="field full"><span className="field-label">Collection description <span className="field-hint">Optional</span></span><textarea rows={3} maxLength={1000} value={collectionDescription} onChange={(event) => setCollectionDescription(event.target.value)} /></label>
            <label className="field"><span className="field-label">WhatsApp number</span><input value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} inputMode="tel" /></label>
            <label className="field"><span className="field-label">Delivery information</span><input maxLength={500} value={deliveryInfo} onChange={(event) => setDeliveryInfo(event.target.value)} /></label>
          </div></div></section>

          <div className="collection-items-heading"><div><span className="collection-kicker">02 · Your products</span><h2>Items in this collection</h2><p>Add or remove items and update each item’s own photos and options.</p></div><span className="collection-item-count">{items.length}/10 items</span></div>
          {items.map((item, index) => (
            <section className="form-card collection-item-editor" key={item.id ?? `new-${index}`}><div className="form-card-inner">
              <div className="collection-item-editor-top"><div className="collection-item-number">{String(index + 1).padStart(2, "0")}</div><div className="collection-item-title"><h3>Item {index + 1}</h3><span>{item.savedImages.length} saved photo(s){item.imagesDirty ? " · replacement pending" : ""}</span></div>{items.length > 2 ? <button type="button" className="button button-secondary collection-remove-item" onClick={() => removeItem(index)} disabled={saving}>Remove item</button> : null}</div>
              <div className="collection-item-photo-grid">
                {(item.imagesDirty ? item.selectedImages.map((image) => ({ id: image.url, url: image.url, alt: image.file.name })) : item.savedImages.map((image) => ({ id: image.id, url: image.publicUrl, alt: item.productName }))).map((image, photoIndex) => <div className="collection-item-photo" key={image.id}><img src={image.url} alt={`${item.productName || `Item ${index + 1}`} photo ${photoIndex + 1}`} /></div>)}
                {!item.imagesDirty && item.selectedImages.length ? item.selectedImages.map((image, photoIndex) => <div className="collection-item-photo" key={image.url}><img src={image.url} alt={`Replacement ${photoIndex + 1}`} /></div>) : null}
                {item.savedImages.length < 3 || item.imagesDirty ? <label className="collection-item-photo-add">+<span>{item.imagesDirty ? "Choose different photos" : "Replace / add photos"}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => handleImageChange(index, event)} disabled={saving} /></label> : <label className="collection-item-photo-add">↻<span>Replace photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => handleImageChange(index, event)} disabled={saving} /></label>}
                {item.imagesDirty ? <button type="button" className="button button-secondary" onClick={() => { item.selectedImages.forEach((image) => URL.revokeObjectURL(image.url)); updateItem(index, { selectedImages: [], imagesDirty: false }); }}>Keep saved photos</button> : null}
              </div>
              <div className="field-grid collection-item-fields">
                <label className="field full"><span className="field-label">Item name</span><input maxLength={120} value={item.productName} onChange={(event) => updateItem(index, { productName: event.target.value })} /></label>
                <label className="field"><span className="field-label">Category</span><select value={item.category} onChange={(event) => updateItem(index, { category: event.target.value })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label className="field"><span className="field-label">Price (₦)</span><input inputMode="numeric" value={item.price} onChange={(event) => updateItem(index, { price: event.target.value })} /></label>
                <label className="field"><span className="field-label">Original price (₦) <span className="field-hint">Optional</span></span><input inputMode="numeric" value={item.originalPrice} onChange={(event) => updateItem(index, { originalPrice: event.target.value })} /></label>
                <label className="field"><span className="field-label">Availability</span><select value={item.availability} onChange={(event) => updateItem(index, { availability: event.target.value as ProductPageAvailability })}>{AVAILABILITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="field full"><span className="field-label">Description</span><textarea rows={3} maxLength={1000} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} /></label>
                <div className="field full"><CollectionOptionsEditor options={item.options} onChange={(options) => updateItem(index, { options })} disabled={saving} /></div>
              </div>
            </div></section>
          ))}
          <div className="collection-add-row"><button type="button" className="button button-secondary" onClick={() => setItems((current) => [...current, { productName: "", category: "Other", description: "", price: "", originalPrice: "", availability: "available", options: [], selectedImages: [], savedImages: [], imagesDirty: false }])} disabled={items.length >= 10 || saving}>+ Add another item</button><span>You can add up to 10 items in total.</span></div>
          {message ? <div className="preview-note" role="status"><strong>Saved</strong><span>{message}</span></div> : null}
          {error ? <div className="preview-note" role="alert"><strong>Check this</strong><span>{error}</span></div> : null}
          <div className="builder-submit"><div className="builder-submit-copy"><strong>{saving ? "Saving your collection…" : "Ready to save?"}</strong><span>{page.status === "published" ? "Changes will update the existing public collection link." : "This collection remains private until payment is completed."}</span></div><button type="button" className="button button-primary" onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Save collection changes"}<span className="button-accent">{saving ? "…" : "✓"}</span></button></div>
        </div>
      </div>
    </main>
  );
}

export default EditCollectionPage;

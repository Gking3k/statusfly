import type { ProductPageItemOption } from "../api/productPages";

export type CollectionAttributeType = "Size" | "Color" | "Material" | "Style" | "Capacity" | "Custom";

export const COLLECTION_ATTRIBUTE_TYPES: CollectionAttributeType[] = [
  "Size",
  "Color",
  "Material",
  "Style",
  "Capacity",
  "Custom",
];

export const COLLECTION_OPTION_SUGGESTIONS: Record<Exclude<CollectionAttributeType, "Custom">, string[]> = {
  Size: [
    "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "One size", "Free size",
    "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46",
  ],
  Color: [
    "Black", "White", "Blue", "Navy", "Red", "Green", "Yellow", "Pink", "Purple", "Brown",
    "Grey", "Gray", "Beige", "Cream", "Orange", "Gold", "Silver", "Burgundy", "Maroon", "Tan",
    "Rose Gold", "Multicolour", "Transparent", "Natural",
  ],
  Material: ["Cotton", "Leather", "Faux leather", "Denim", "Silk", "Wool", "Polyester", "Linen", "Stainless steel", "Wood"],
  Style: ["Casual", "Formal", "Classic", "Sport", "Minimalist", "Oversized", "Slim fit", "Regular fit"],
  Capacity: ["Small", "Medium", "Large", "250ml", "350ml", "500ml", "750ml", "1L", "2L"],
};

// Option names and values are individual tokens, never a comma/newline-delimited text block.
// Characters that can corrupt the old line-based format are deliberately excluded.
const SAFE_OPTION_TOKEN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} &'()./+_%+-]{0,39}$/u;

export function isSafeCollectionOptionToken(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 40 && SAFE_OPTION_TOKEN.test(normalized);
}

export function getCollectionAttributeType(name: string): CollectionAttributeType {
  const normalized = name.trim().toLocaleLowerCase();
  if (normalized === "size") return "Size";
  if (normalized === "color" || normalized === "colour") return "Color";
  if (normalized === "material") return "Material";
  if (normalized === "style") return "Style";
  if (normalized === "capacity") return "Capacity";
  return "Custom";
}

export function normalizeCollectionOptions(options: ProductPageItemOption[]): ProductPageItemOption[] {
  return options.map((option) => ({
    name: getCollectionAttributeType(option.name) === "Custom"
      ? option.name.trim()
      : getCollectionAttributeType(option.name),
    values: [...option.values].map((value) => value.trim()),
  }));
}

export function validateCollectionOptions(options: ProductPageItemOption[]): string | null {
  if (options.length > 3) return "Each item can have up to 3 attributes.";
  const seenNames = new Set<string>();
  for (const option of options) {
    const name = option.name.trim();
    if (!isSafeCollectionOptionToken(name)) {
      return "Choose an attribute or give your custom attribute a short name using letters and numbers.";
    }
    const normalizedName = name.toLocaleLowerCase();
    if (seenNames.has(normalizedName)) return "Each item must use a different attribute name.";
    seenNames.add(normalizedName);
    if (option.values.length < 1 || option.values.length > 10) {
      return `${name} must have between 1 and 10 values.`;
    }
    const seenValues = new Set<string>();
    for (const value of option.values) {
      if (!isSafeCollectionOptionToken(value)) {
        return `Each ${name.toLowerCase()} value must be a short, single value. Remove commas, colons, line breaks, or special markup.`;
      }
      const normalizedValue = value.trim().toLocaleLowerCase();
      if (seenValues.has(normalizedValue)) return `${name} values must not repeat.`;
      seenValues.add(normalizedValue);
    }
  }
  return null;
}

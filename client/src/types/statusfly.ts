export type StatusFlyStyle =
  | "clean"
  | "bold"
  | "luxe"
  | "street";

export type ProductCategory =
  | "shoes"
  | "fashion"
  | "hair"
  | "beauty"
  | "perfume"
  | "food"
  | "jewelry"
  | "electronics";

export interface ProductData {
  image: File | null;
  name: string;
  price: string;
  description: string;
  whatsappNumber: string;
  extraDetails: string;
  category: ProductCategory;
  style: StatusFlyStyle;
}

export type ProductPageAvailability =
  | "available"
  | "low_stock"
  | "sold_out"
  | "coming_soon"
  | "preorder";

export interface BuilderImage {
  file: File;
  url: string;
}

export interface ProductPageBuilderForm {
  brandName: string;
  productName: string;
  category: string;
  description: string;
  price: string;
  originalPrice: string;
  promotionText: string;
  promotionEndAt: string;
  availability: ProductPageAvailability;
  sellingPoints: string[];
  whatsappNumber: string;
  deliveryInfo: string;
}

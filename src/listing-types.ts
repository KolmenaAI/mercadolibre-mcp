/** JSON shapes accepted by POST /items and POST /items/validate. */
export type MercadoLibreJsonPrimitive = string | number | boolean | null;

export type MercadoLibreJsonValue =
  | MercadoLibreJsonPrimitive
  | MercadoLibreJsonValue[]
  | { [key: string]: MercadoLibreJsonValue };

export type MercadoLibreJsonObject = { [key: string]: MercadoLibreJsonValue };

export interface MercadoLibreListingAttribute {
  id: string;
  value_id?: string;
  value_name?: string;
}

export interface MercadoLibreListingPictureRef {
  id?: string;
  source?: string;
}

export type MercadoLibreCreateItemBody = MercadoLibreJsonObject & {
  title: string;
  category_id: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  buying_mode: string;
  listing_type_id: string;
  condition?: string;
  description?: string;
  pictures?: MercadoLibreListingPictureRef[];
  attributes?: MercadoLibreListingAttribute[];
  sale_terms?: MercadoLibreListingAttribute[];
};

export interface FacilityDefaults {
  siteId?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number | null;
  lng?: number | null;
  department?: string;
  contactName?: string;
  contactPhone?: string;
}

export interface RequesterDefaults {
  name?: string;
  email?: string;
  phone?: string;
  fax?: string;
}

export interface FavoriteRepOption {
  id: string;
  name: string;
  phone: string | null;
  companyName: string;
  products: string[];
  status: string;
  territories: { state: string | null; county: string | null; zipCode: string | null }[];
  isFavorite?: boolean;
}

export function formatRepTerritory(
  territories: FavoriteRepOption["territories"]
): string {
  if (!territories.length) return "No territory set";
  return territories
    .map((t) => {
      const parts = [t.county, t.state].filter(Boolean);
      const region = parts.length ? parts.join(", ") : "Area";
      return t.zipCode ? `${region} · ${t.zipCode}` : region;
    })
    .join(" · ");
}

/**
 * Image helpers. Sample photography comes from Unsplash (free licence); the
 * hotel can replace any of it with its own URLs from the console.
 */

/** Ask the image CDN for a right-sized, compressed version when it supports it. */
export function photo(url: string | null | undefined, width = 800): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('https://images.unsplash.com/')) {
    const base = url.split('?')[0];
    return `${base}?w=${width}&q=70&auto=format&fit=crop`;
  }
  return url;
}

const u = (id: string) => `https://images.unsplash.com/photo-${id}`;

/** Venue photography for the website. */
export const VENUE_PHOTOS = {
  hotel: u('1611892440504-42a792e24d32'),
  restaurant: u('1538334421852-687c439c92f4'),
  food: u('1665332195309-9d75071138f0'),
  pool: u('1754567371234-c832f2d299b5'),
  poolSunset: u('1578058997959-66ffdee9f807'),
  club: u('1758165532022-a68f291317ba'),
  garden: u('1574482211311-45a2169db57c'),
  gardenTable: u('1758810744028-689670b0877c'),
  cabana: u('1494194069000-cb794f31d82c'),
} as const;

/** Photos for rooftop spaces by kind. */
export const DECK_PHOTOS: Record<string, string> = {
  cabana: u('1494194069000-cb794f31d82c'),
  daybed: u('1701568129402-0d4541e3dab7'),
  vip_table: u('1770021601385-af0bf0136762'),
  pool: u('1578058997959-66ffdee9f807'),
};

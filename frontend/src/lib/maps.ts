// Links to an address on a map (3.4.0): OpenStreetMap first, and the phone's usual map apps.
export function mapLinks(address: string) {
  const q = encodeURIComponent(address.trim());
  return {
    osm: `https://www.openstreetmap.org/search?query=${q}`,
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${q}`,
  };
}

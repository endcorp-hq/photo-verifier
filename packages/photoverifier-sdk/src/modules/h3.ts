type GeoToH3Fn = (lat: number, lng: number, res: number) => string;

export type H3LocationInput = {
  latitude: number;
  longitude: number;
};

let cachedGeoToH3: GeoToH3Fn | null = null;

function getGeoToH3(): GeoToH3Fn {
  if (cachedGeoToH3) return cachedGeoToH3;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const h3 = require('h3-reactnative') as {
    geoToH3?: GeoToH3Fn;
    latLngToCell?: GeoToH3Fn;
  };
  const fn = h3.geoToH3 ?? h3.latLngToCell;
  if (typeof fn !== 'function') {
    throw new Error('Failed to load H3 implementation from h3-reactnative');
  }
  cachedGeoToH3 = fn;
  return fn;
}

function assertValidCoordinateRange(location: H3LocationInput): void {
  if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90) {
    throw new Error(`Invalid latitude: ${location.latitude}`);
  }
  if (!Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
    throw new Error(`Invalid longitude: ${location.longitude}`);
  }
}

function assertValidResolution(resolution: number): void {
  if (!Number.isInteger(resolution) || resolution < 0 || resolution > 15) {
    throw new Error(`Invalid H3 resolution: ${resolution}`);
  }
}

export function h3CellToU64(h3Cell: string | number | bigint): bigint {
  if (typeof h3Cell === 'bigint') {
    if (h3Cell < 0n || h3Cell > 0xffff_ffff_ffff_ffffn) {
      throw new Error('h3Cell out of range for u64');
    }
    return h3Cell;
  }
  if (typeof h3Cell === 'number') {
    if (!Number.isInteger(h3Cell) || h3Cell < 0) {
      throw new Error(`Invalid h3Cell number: ${h3Cell}`);
    }
    return h3CellToU64(BigInt(h3Cell));
  }
  const normalized = String(h3Cell).trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{1,16}$/.test(normalized)) {
    throw new Error(`Invalid h3Cell hex string: ${h3Cell}`);
  }
  return h3CellToU64(BigInt(`0x${normalized}`));
}

export function latLngToH3Cell(lat: number, lng: number, resolution: number): string {
  assertValidCoordinateRange({ latitude: lat, longitude: lng });
  assertValidResolution(resolution);
  const rawCell = getGeoToH3()(lat, lng, resolution);
  if (typeof rawCell !== 'string' || rawCell.length === 0) {
    throw new Error('Failed to derive H3 cell');
  }
  return rawCell.toLowerCase();
}

export function locationToH3Cell(location: H3LocationInput, resolution: number): string {
  return latLngToH3Cell(location.latitude, location.longitude, resolution);
}

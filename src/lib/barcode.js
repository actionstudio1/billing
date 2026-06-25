/** 9-digit numeric barcode utilities (100000001, 100000002, …). */

export const BARCODE_START = 100000001;
export const BARCODE_META_KEY = 'barcodeSequence';

/** Collect all barcodes from items and products for duplicate checks. */
export function collectBarcodes(items = [], products = [], excludeItemId = null, excludeProductId = null) {
  const set = new Set();
  for (const item of items) {
    if (!item?.barcode) continue;
    if (excludeItemId && String(item.id) === String(excludeItemId)) continue;
    set.add(normalizeBarcode(item.barcode));
  }
  for (const product of products) {
    if (!product?.barcode) continue;
    if (excludeProductId && String(product.id) === String(excludeProductId)) continue;
    set.add(normalizeBarcode(product.barcode));
  }
  return set;
}

/** Normalize to 9-digit numeric string. */
export function normalizeBarcode(value) {
  const digits = String(value || '').trim().replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 9) return digits.slice(-9);
  return digits.padStart(9, '0');
}

export function formatBarcodeNumber(num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n < BARCODE_START) return '';
  return String(Math.floor(n)).padStart(9, '0');
}

export function barcodeFromSequence(seq) {
  const n = BARCODE_START + (Number(seq) || 1) - 1;
  return formatBarcodeNumber(n);
}

export function validateBarcodeFormat(barcode) {
  const code = normalizeBarcode(barcode);
  if (!code) return { ok: false, message: 'Barcode is required' };
  if (!/^\d{9}$/.test(code)) {
    return { ok: false, message: 'Barcode must be exactly 9 digits' };
  }
  const n = parseInt(code, 10);
  if (n < BARCODE_START) {
    return { ok: false, message: `Barcode must be ${BARCODE_START} or higher` };
  }
  return { ok: true, code };
}

export function checkBarcodeDuplicate(barcode, items = [], products = [], { excludeItemId, excludeProductId } = {}) {
  const code = normalizeBarcode(barcode);
  if (!code) return { duplicate: false };
  const existing = collectBarcodes(items, products, excludeItemId, excludeProductId);
  if (existing.has(code)) {
    return { duplicate: true, message: `Barcode ${code} is already assigned to another product` };
  }
  return { duplicate: false, code };
}

/** Unique key for item variants: name + size + color. */
export function variantKey({ name, size = '', color = '' } = {}) {
  return [
    (name || '').trim().toLowerCase(),
    (size || '').trim().toLowerCase(),
    (color || '').trim().toLowerCase(),
  ].join('|');
}

export function findItemByVariant(items = [], { name, size, color } = {}) {
  const key = variantKey({ name, size, color });
  if (!key || key === '||') return null;
  return items.find(i => variantKey(i) === key) || null;
}

export function findItemByBarcode(barcode, items = []) {
  const code = normalizeBarcode(barcode);
  if (!code) return null;
  return items.find(i => normalizeBarcode(i.barcode) === code) || null;
}

export function findProductByBarcode(barcode, items = [], products = []) {
  const code = normalizeBarcode(barcode);
  if (!code) return null;
  const direct = products.find(p => normalizeBarcode(p.barcode) === code);
  if (direct) return direct;
  const item = findItemByBarcode(code, items);
  if (!item) return null;
  const linked = products.filter(p => String(p.itemId) === String(item.id));
  const byBarcodeVariant = linked.find(p =>
    normalizeBarcode(p.barcode) === code
    || variantKey(p) === variantKey(item)
  );
  if (byBarcodeVariant) return byBarcodeVariant;
  const inStock = linked.find(p => (parseFloat(p.stock) || 0) > 0);
  return inStock || linked[0];
}

export function resolveBarcodeLookup(barcode, items = [], products = []) {
  const item = findItemByBarcode(barcode, items);
  const product = findProductByBarcode(barcode, items, products);
  return { item, product };
}

/** Max sequence offset from existing 9-digit barcodes in data. */
export function maxBarcodeSequenceFromData(items = [], products = []) {
  let maxNum = BARCODE_START - 1;
  for (const rec of [...items, ...products]) {
    const check = validateBarcodeFormat(rec?.barcode);
    if (check.ok) {
      maxNum = Math.max(maxNum, parseInt(check.code, 10));
    }
  }
  return Math.max(0, maxNum - BARCODE_START + 1);
}

export function toLabelItem(record = {}) {
  return {
    name: record.name || '',
    barcode: normalizeBarcode(record.barcode),
    mrp: record.mrp != null ? record.mrp : 0,
    salePrice: record.salePrice ?? record.rate ?? 0,
    size: record.size || '',
    color: record.color || '',
  };
}

// --- Future barcode printer support ---
export const BARCODE_PRINTER_TYPES = ['browser', 'zpl', 'epl', 'tspl'];

export function getBarcodePrinterConfig() {
  try {
    const raw = localStorage.getItem('barcode_printer_config');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { type: 'browser', deviceName: '', labelWidthMm: 50, labelHeightMm: 30 };
}

export function saveBarcodePrinterConfig(config) {
  localStorage.setItem('barcode_printer_config', JSON.stringify(config));
}

export async function sendToBarcodePrinter(_labels, _config = getBarcodePrinterConfig()) {
  throw new Error('Direct barcode printer not configured. Use browser print for now.');
}

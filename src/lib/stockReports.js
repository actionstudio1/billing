import { normalizeBarcode, variantKey } from './barcode';

const LOW_STOCK_THRESHOLD = 5;
const DEAD_STOCK_DAYS = 90;

function linePurchaseAmount(line) {
  const qty = parseFloat(line.quantity) || parseFloat(line.stock) || 0;
  const rate = parseFloat(line.purchaseRate) || parseFloat(line.rate) || 0;
  return qty * rate;
}

function entryLineTotal(entry) {
  return (entry.items || []).reduce((sum, line) => {
    const amount = linePurchaseAmount(line);
    const tax = (amount * (parseFloat(line.taxPercent) || 0)) / 100;
    return sum + amount + tax;
  }, 0);
}

function resolveItemMeta(product, items) {
  const item = product?.itemId
    ? items.find(i => String(i.id) === String(product.itemId))
    : null;
  return {
    itemName: product?.name || item?.name || '',
    barcode: product?.barcode || item?.barcode || '',
    size: product?.size || item?.size || '',
    color: product?.color || item?.color || '',
    brand: product?.brand || item?.brand || 'Unbranded',
    category: product?.category || item?.category || 'Uncategorized',
    mrp: parseFloat(product?.mrp ?? item?.mrp) || 0,
    cost: parseFloat(product?.purchaseRate) || parseFloat(product?.rate) || 0,
  };
}

/** Sold qty by productId and barcode from invoices. */
export function buildSoldQuantityMaps(bills = []) {
  const byProductId = new Map();
  const byBarcode = new Map();
  const lastSaleByProductId = new Map();
  const lastSaleByBarcode = new Map();

  for (const bill of bills) {
    const date = bill.invoiceDate || bill.data?.details?.invoiceDate || '';
    for (const line of bill.data?.items || []) {
      const qty = parseFloat(line.quantity) || 0;
      if (qty <= 0) continue;
      if (line.productId) {
        byProductId.set(line.productId, (byProductId.get(line.productId) || 0) + qty);
        if (!lastSaleByProductId.has(line.productId) || date > lastSaleByProductId.get(line.productId)) {
          lastSaleByProductId.set(line.productId, date);
        }
      }
      const bc = normalizeBarcode(line.barcode);
      if (bc) {
        byBarcode.set(bc, (byBarcode.get(bc) || 0) + qty);
        if (!lastSaleByBarcode.has(bc) || date > lastSaleByBarcode.get(bc)) {
          lastSaleByBarcode.set(bc, date);
        }
      }
    }
  }
  return { byProductId, byBarcode, lastSaleByProductId, lastSaleByBarcode };
}

/** Purchase qty by product match keys from inventory entries. */
export function buildPurchaseQuantityMaps(entries = [], products = []) {
  const byProductId = new Map();
  const byVariant = new Map();

  for (const entry of entries) {
    for (const line of entry.items || []) {
      const qty = parseFloat(line.quantity) || parseFloat(line.stock) || 0;
      if (qty <= 0 || !(line.name || '').trim()) continue;

      if (line.itemId) {
        const linked = products.filter(p => String(p.itemId) === String(line.itemId));
        for (const p of linked) {
          byProductId.set(p.id, (byProductId.get(p.id) || 0) + qty);
        }
      }
      const vk = variantKey({ name: line.name, size: line.size, color: line.color });
      byVariant.set(vk, (byVariant.get(vk) || 0) + qty);
      if (line.barcode) {
        const match = products.find(p => normalizeBarcode(p.barcode) === normalizeBarcode(line.barcode));
        if (match) {
          byProductId.set(match.id, (byProductId.get(match.id) || 0) + qty);
        }
      }
    }
  }
  return { byProductId, byVariant };
}

export function getSoldQtyForProduct(product, soldMaps) {
  const fromId = soldMaps.byProductId.get(product.id) || 0;
  if (fromId) return fromId;
  const bc = normalizeBarcode(product.barcode);
  return bc ? (soldMaps.byBarcode.get(bc) || 0) : 0;
}

export function getPurchaseQtyForProduct(product, purchaseMaps, items) {
  const fromId = purchaseMaps.byProductId.get(product.id) || 0;
  if (fromId) return fromId;
  const item = product.itemId ? items.find(i => String(i.id) === String(product.itemId)) : null;
  const vk = variantKey({
    name: product.name || item?.name,
    size: product.size || item?.size,
    color: product.color || item?.color,
  });
  return purchaseMaps.byVariant.get(vk) || 0;
}

export function getLastSaleDate(product, soldMaps) {
  if (product.id && soldMaps.lastSaleByProductId.has(product.id)) {
    return soldMaps.lastSaleByProductId.get(product.id);
  }
  const bc = normalizeBarcode(product.barcode);
  return bc ? (soldMaps.lastSaleByBarcode.get(bc) || '') : '';
}

/** 1. Purchase Report rows */
export function buildPurchaseReport(entries = [], vendors = []) {
  const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v]));
  const rows = [];

  for (const entry of entries) {
    const billTotal = entryLineTotal(entry);
    const vendorName = entry.vendorName || vendorMap[entry.vendorId]?.name || '';
    for (const line of entry.items || []) {
      if (!(line.name || '').trim()) continue;
      const qty = parseFloat(line.quantity) || parseFloat(line.stock) || 0;
      const rate = parseFloat(line.purchaseRate) || parseFloat(line.rate) || 0;
      const amount = qty * rate;
      const gst = (amount * (parseFloat(line.taxPercent) || 0)) / 100;
      rows.push({
        purchaseDate: entry.entryDate || entry.acDate || '',
        vendorName,
        billNo: entry.vendorBillNo || entry.inventoryId || '',
        itemName: line.name,
        qty,
        purchaseRate: rate,
        mrp: parseFloat(line.mrp) || 0,
        amount,
        gst,
        totalBillAmount: billTotal,
        barcode: line.barcode || '',
        size: line.size || '',
        color: line.color || '',
      });
    }
  }
  return rows.sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''));
}

/** 2. Current Stock Report */
export function buildCurrentStockReport(products = [], items = [], entries = [], bills = []) {
  const soldMaps = buildSoldQuantityMaps(bills);
  const purchaseMaps = buildPurchaseQuantityMaps(entries, products);

  return products.map(product => {
    const meta = resolveItemMeta(product, items);
    const soldQty = getSoldQtyForProduct(product, soldMaps);
    const purchaseQty = getPurchaseQtyForProduct(product, purchaseMaps, items);
    const currentStock = parseFloat(product.stock) || 0;
    const openingStock = Math.max(0, currentStock + soldQty - purchaseQty);
    return {
      productId: product.id,
      ...meta,
      openingStock,
      purchaseQty,
      soldQty,
      currentStock,
      stockValue: currentStock * meta.cost,
    };
  }).sort((a, b) => a.itemName.localeCompare(b.itemName));
}

/** 3. Stock Ageing buckets (qty in stock by days since last sale / purchase) */
export function buildStockAgeingReport(products = [], items = [], bills = []) {
  const soldMaps = buildSoldQuantityMaps(bills);
  const today = new Date();
  const buckets = {
    '0-30': { label: '0–30 Days', qty: 0, value: 0, items: [] },
    '31-90': { label: '31–90 Days', qty: 0, value: 0, items: [] },
    '91-180': { label: '91–180 Days', qty: 0, value: 0, items: [] },
    '180+': { label: '180+ Days', qty: 0, value: 0, items: [] },
  };

  for (const product of products) {
    const stock = parseFloat(product.stock) || 0;
    if (stock <= 0) continue;
    const meta = resolveItemMeta(product, items);
    const lastSale = getLastSaleDate(product, soldMaps);
    const refDate = lastSale || product.lastPurchaseDate || '';
    const days = refDate
      ? Math.floor((today - new Date(refDate)) / 86400000)
      : 999;

    let key = '180+';
    if (days <= 30) key = '0-30';
    else if (days <= 90) key = '31-90';
    else if (days <= 180) key = '91-180';

    buckets[key].qty += stock;
    buckets[key].value += stock * meta.cost;
    buckets[key].items.push({ name: meta.itemName, stock, days, size: meta.size, brand: meta.brand });
  }
  return Object.values(buckets);
}

/** 4. Size-wise stock */
export function buildSizeWiseStockReport(stockRows = []) {
  const map = new Map();
  for (const row of stockRows) {
    if (row.currentStock <= 0) continue;
    const size = row.size || '—';
    const key = `${row.itemName}|${size}`;
    if (!map.has(key)) {
      map.set(key, { item: row.itemName, size, stock: 0 });
    }
    map.get(key).stock += row.currentStock;
  }
  return [...map.values()].sort((a, b) => a.item.localeCompare(b.item) || a.size.localeCompare(b.size));
}

/** 5. Brand-wise stock */
export function buildBrandWiseStockReport(stockRows = []) {
  const map = new Map();
  for (const row of stockRows) {
    if (row.currentStock <= 0) continue;
    const brand = row.brand || 'Unbranded';
    map.set(brand, (map.get(brand) || 0) + row.currentStock);
  }
  return [...map.entries()]
    .map(([brand, stock]) => ({ brand, stock }))
    .sort((a, b) => b.stock - a.stock);
}

/** 6. Category-wise stock */
export function buildCategoryWiseStockReport(stockRows = []) {
  const map = new Map();
  for (const row of stockRows) {
    if (row.currentStock <= 0) continue;
    const category = row.category || 'Uncategorized';
    map.set(category, (map.get(category) || 0) + row.currentStock);
  }
  return [...map.entries()]
    .map(([category, stock]) => ({ category, stock }))
    .sort((a, b) => b.stock - a.stock);
}

/** 7. Low stock (≤ threshold or reorder level) */
export function buildLowStockReport(products = [], items = [], threshold = LOW_STOCK_THRESHOLD) {
  return products
    .map(p => {
      const meta = resolveItemMeta(p, items);
      const stock = parseFloat(p.stock) || 0;
      const reorder = parseFloat(p.reorderLevel);
      const limit = Number.isFinite(reorder) && reorder > 0 ? reorder : threshold;
      return { ...meta, productId: p.id, currentStock: stock, reorderLevel: limit };
    })
    .filter(p => p.currentStock <= threshold || p.currentStock <= p.reorderLevel)
    .sort((a, b) => a.currentStock - b.currentStock);
}

/** 8. Dead stock — no sale in 90+ days, stock > 0 */
export function buildDeadStockReport(products = [], items = [], bills = [], days = DEAD_STOCK_DAYS) {
  const soldMaps = buildSoldQuantityMaps(bills);
  const today = new Date();
  const cutoff = new Date(today.getTime() - days * 86400000);

  return products
    .map(p => {
      const stock = parseFloat(p.stock) || 0;
      if (stock <= 0) return null;
      const meta = resolveItemMeta(p, items);
      const lastSale = getLastSaleDate(p, soldMaps);
      const lastMove = lastSale || p.lastPurchaseDate || '';
      const lastDate = lastMove ? new Date(lastMove) : null;
      const isDead = !lastDate || lastDate < cutoff;
      if (!isDead) return null;
      const daysSinceSale = lastDate
        ? Math.floor((today - lastDate) / 86400000)
        : 999;
      return {
        ...meta,
        productId: p.id,
        currentStock: stock,
        stockValue: stock * meta.cost,
        lastSaleDate: lastSale || 'Never',
        daysSinceSale,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.daysSinceSale - a.daysSinceSale);
}

/** Dashboard summary cards */
export function getRetailDashboardSummary({
  entries = [],
  products = [],
  items = [],
  bills = [],
}) {
  const stockRows = buildCurrentStockReport(products, items, entries, bills);
  const totalPurchase = entries.reduce((s, e) => s + entryLineTotal(e), 0);
  const totalStockQty = products.reduce((s, p) => s + (parseFloat(p.stock) || 0), 0);
  const stockValue = stockRows.reduce((s, r) => s + r.stockValue, 0);
  const lowStock = buildLowStockReport(products, items);
  const deadStock = buildDeadStockReport(products, items, bills);

  return {
    totalPurchase,
    totalStockQty,
    stockValue,
    lowStockCount: lowStock.length,
    deadStockCount: deadStock.length,
    lowStock,
    deadStock,
  };
}

export { LOW_STOCK_THRESHOLD, DEAD_STOCK_DAYS };

// Storage facade — Supabase cloud or local Express API.
import { isSupabaseMode } from './lib/supabase';
import {
  BARCODE_META_KEY,
  checkBarcodeDuplicate,
  findItemByVariant,
  maxBarcodeSequenceFromData,
  normalizeBarcode,
  toLabelItem,
  validateBarcodeFormat,
  variantKey,
} from './lib/barcode';
import * as localStore from './services/localStore';
import * as supabaseStore from './services/supabaseStore';

const backend = isSupabaseMode() ? supabaseStore : localStore;

export const getNextBarcode = backend.getNextBarcode;
export const setMetaValue = backend.setMetaValue;

export const getInvoiceNumberSettings = backend.getInvoiceNumberSettings;
export const saveInvoiceNumberSettings = backend.saveInvoiceNumberSettings;
export const getInvoiceDisplayOptions = backend.getInvoiceDisplayOptions;
export const saveInvoiceDisplayOptions = backend.saveInvoiceDisplayOptions;
export const getDefaultInvoiceTerms = backend.getDefaultInvoiceTerms;
export const saveDefaultInvoiceTerms = backend.saveDefaultInvoiceTerms;
export const getRegionMode = backend.getRegionMode;
export const setRegionMode = backend.setRegionMode;
export const getEnabledModules = backend.getEnabledModules;
export const setEnabledModules = backend.setEnabledModules;
export const getNextInvoiceNumber = backend.getNextInvoiceNumber;
export const saveBill = backend.saveBill;
export const getAllBills = backend.getAllBills;
export const deleteBill = backend.deleteBill;
export const saveProfile = backend.saveProfile;
export const getProfile = backend.getProfile;
export const saveClient = backend.saveClient;
export const getAllClients = backend.getAllClients;
export const deleteClient = backend.deleteClient;
export const saveVendor = backend.saveVendor;
export const getAllVendors = backend.getAllVendors;
export const deleteVendor = backend.deleteVendor;
export const getTermsTemplates = backend.getTermsTemplates;
export const saveTermsTemplate = backend.saveTermsTemplate;
export const deleteTermsTemplate = backend.deleteTermsTemplate;
export const getAllProducts = backend.getAllProducts;
export const saveProduct = backend.saveProduct;
export const deleteProduct = backend.deleteProduct;
export const getAllItems = backend.getAllItems;
export const saveItem = backend.saveItem;
export const deleteItem = backend.deleteItem;
export const getAllBrands = backend.getAllBrands;
export const saveBrand = backend.saveBrand;
export const deleteBrand = backend.deleteBrand;
export const getAllMajorGroups = backend.getAllMajorGroups;
export const saveMajorGroup = backend.saveMajorGroup;
export const deleteMajorGroup = backend.deleteMajorGroup;
export const getAllSubGroups = backend.getAllSubGroups;
export const saveSubGroup = backend.saveSubGroup;
export const deleteSubGroup = backend.deleteSubGroup;
export const getAllStaff = backend.getAllStaff;
export const saveStaff = backend.saveStaff;
export const deleteStaff = backend.deleteStaff;

let barcodeCounterSynced = false;

async function ensureBarcodeCounterSynced() {
  if (barcodeCounterSynced) return;
  const [items, products, current] = await Promise.all([
    backend.getAllItems(),
    backend.getAllProducts(),
    backend.getMetaValue(BARCODE_META_KEY),
  ]);
  const needed = maxBarcodeSequenceFromData(items, products);
  if (needed > (Number(current) || 0)) {
    await backend.setMetaValue(BARCODE_META_KEY, needed);
  }
  barcodeCounterSynced = true;
}

async function allocateBarcode(allItems, allProducts, excludeItemId = null, excludeProductId = null) {
  await ensureBarcodeCounterSynced();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = await backend.getNextBarcode();
    const dup = checkBarcodeDuplicate(code, allItems, allProducts, { excludeItemId, excludeProductId });
    if (!dup.duplicate) return code;
  }
  throw new Error('Could not allocate a unique barcode. Try again.');
}

function buildItemPayload(payload, barcode) {
  return {
    ...payload,
    barcode,
    mrp: payload.mrp != null && payload.mrp !== '' ? parseFloat(payload.mrp) || 0 : 0,
    salePrice: payload.salePrice != null && payload.salePrice !== ''
      ? parseFloat(payload.salePrice) || 0
      : 0,
    size: (payload.size || '').trim(),
    color: (payload.color || '').trim(),
    brand: (payload.brand || '').trim(),
    category: (payload.category || '').trim(),
  };
}

async function syncProductsForItem(item, allProducts) {
  if (!item?.id || !item.barcode) return;
  const updates = allProducts
    .filter(p => String(p.itemId) === String(item.id))
    .map(p => backend.saveProduct({
      ...p,
      barcode: item.barcode,
      size: item.size || p.size || '',
      color: item.color || p.color || '',
      brand: item.brand || p.brand || '',
      category: item.category || p.category || '',
      rate: item.salePrice > 0 ? item.salePrice : p.rate,
    }));
  await Promise.all(updates);
}

/** Save item — auto 9-digit barcode for new items or items missing barcode. */
export const saveItemWithBarcode = async (payload, { isNew } = {}) => {
  const [allItems, allProducts] = await Promise.all([
    backend.getAllItems(),
    backend.getAllProducts(),
  ]);

  const existing = payload.id
    ? allItems.find(i => String(i.id) === String(payload.id))
    : findItemByVariant(allItems, payload);

  let barcode = existing?.barcode || payload.barcode;
  const validExisting = barcode && validateBarcodeFormat(barcode).ok;

  if (!validExisting) {
    barcode = await allocateBarcode(allItems, allProducts, payload.id || null);
  } else {
    barcode = normalizeBarcode(barcode);
    const dup = checkBarcodeDuplicate(barcode, allItems, allProducts, { excludeItemId: payload.id });
    if (dup.duplicate) throw new Error(dup.message);
  }

  const prepared = buildItemPayload(
    { ...(existing || {}), ...payload, id: payload.id || existing?.id },
    barcode,
  );
  const saved = await backend.saveItem(prepared);
  const result = saved?.id ? { ...prepared, ...saved } : { ...prepared, id: prepared.id };
  await syncProductsForItem(result, allProducts);
  return result;
};

/** Generate barcode for an existing item that has none. */
export const generateBarcodeForItem = async (itemId) => {
  const [allItems, allProducts] = await Promise.all([
    backend.getAllItems(),
    backend.getAllProducts(),
  ]);
  const item = allItems.find(i => String(i.id) === String(itemId));
  if (!item) throw new Error('Item not found');
  if (item.barcode && validateBarcodeFormat(item.barcode).ok) {
    return item;
  }
  const barcode = await allocateBarcode(allItems, allProducts, itemId);
  const updated = buildItemPayload({ ...item }, barcode);
  const saved = await backend.saveItem(updated);
  const result = saved?.id ? { ...updated, ...saved } : updated;
  await syncProductsForItem(result, allProducts);
  return result;
};

/** Generate barcode for an existing product (and linked item if needed). */
export const generateBarcodeForProduct = async (productId) => {
  const [allItems, allProducts] = await Promise.all([
    backend.getAllItems(),
    backend.getAllProducts(),
  ]);
  const product = allProducts.find(p => String(p.id) === String(productId));
  if (!product) throw new Error('Product not found');
  if (product.barcode && validateBarcodeFormat(product.barcode).ok) {
    return product;
  }

  let item = product.itemId
    ? allItems.find(i => String(i.id) === String(product.itemId))
    : findItemByVariant(allItems, product);

  if (!item) {
    item = await saveItemWithBarcode({
      name: product.name,
      hsn: product.hsn || '',
      size: product.size || '',
      color: product.color || '',
      salePrice: product.rate || 0,
    }, { isNew: true });
  } else if (!item.barcode) {
    item = await generateBarcodeForItem(item.id);
  }

  const saved = await backend.saveProduct({
    ...product,
    itemId: item.id,
    barcode: item.barcode,
    size: item.size || product.size || '',
    color: item.color || product.color || '',
  });
  return saved;
};

/** Generate 9-digit barcodes for all items/products missing one. */
export const generateAllMissingBarcodes = async () => {
  const [allItems, allProducts] = await Promise.all([
    backend.getAllItems(),
    backend.getAllProducts(),
  ]);
  const generated = [];
  for (const item of allItems) {
    if (item.barcode && validateBarcodeFormat(item.barcode).ok) continue;
    generated.push(await generateBarcodeForItem(item.id));
  }
  for (const product of allProducts) {
    if (product.barcode && validateBarcodeFormat(product.barcode).ok) continue;
    generated.push(await generateBarcodeForProduct(product.id));
  }
  return generated;
};

/**
 * Inventory In — fresh 9-digit barcode per purchase line (daily entry).
 * Items Master does not own barcodes; each save generates new codes for new lines.
 */
export const processInventoryEntryBarcodes = async (entry) => {
  let allItems = await backend.getAllItems();
  let allProducts = await backend.getAllProducts();
  const labelsToPrint = [];
  const items = [];

  for (const line of entry.items || []) {
    if (!(line.name || '').trim()) {
      items.push(line);
      continue;
    }

    const size = (line.size || '').trim();
    const color = (line.color || '').trim();
    const variant = { name: line.name.trim(), size, color };

    if (line.barcode && validateBarcodeFormat(line.barcode).ok) {
      items.push({
        ...line,
        barcode: normalizeBarcode(line.barcode),
        size,
        color,
      });
      continue;
    }

    const barcode = await allocateBarcode(allItems, allProducts);

    let master = line.itemId
      ? allItems.find(i => String(i.id) === String(line.itemId))
      : null;
    if (master && variantKey(master) !== variantKey(variant)) {
      master = findItemByVariant(allItems, variant);
    }
    if (!master) {
      master = findItemByVariant(allItems, variant);
    }

    if (!master) {
      const newItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: variant.name,
        hsn: (line.hsn || '').trim(),
        size,
        color,
        mrp: line.mrp != null && line.mrp !== '' ? parseFloat(line.mrp) || 0 : 0,
        salePrice: line.rate != null && line.rate !== '' ? parseFloat(line.rate) || 0 : 0,
        brand: (line.brand || '').trim(),
        category: (line.category || '').trim(),
      };
      const saved = await backend.saveItem(newItem);
      master = saved?.id ? { ...newItem, ...saved } : newItem;
      allItems = [...allItems, master];
    } else {
      const updated = {
        ...master,
        size: size || master.size,
        color: color || master.color,
        mrp: line.mrp != null && line.mrp !== '' ? parseFloat(line.mrp) || 0 : master.mrp,
        salePrice: line.rate != null && line.rate !== '' ? parseFloat(line.rate) || 0 : master.salePrice,
      };
      const saved = await backend.saveItem(updated);
      master = saved?.id ? { ...updated, ...saved } : updated;
      allItems = allItems.map(i => String(i.id) === String(master.id) ? master : i);
    }

    const enrichedLine = {
      ...line,
      itemId: String(master.id),
      name: master.name || line.name,
      hsn: master.hsn || line.hsn || '',
      size,
      color,
      barcode,
      mrp: master.mrp ?? line.mrp,
    };

    items.push(enrichedLine);

    labelsToPrint.push(toLabelItem({
      name: enrichedLine.name,
      barcode,
      mrp: enrichedLine.mrp ?? master.mrp,
      salePrice: line.rate || master.salePrice,
      size,
      color,
    }));
  }

  return { entry: { ...entry, items }, labelsToPrint };
};
export const getAllInventoryEntries = backend.getAllInventoryEntries;
export const saveInventoryEntry = backend.saveInventoryEntry;
export const deleteInventoryEntry = backend.deleteInventoryEntry;
export const getNextInventoryId = backend.getNextInventoryId;

/** Push latest item name/HSN from Items Master into all inventory entry lines that reference this item. */
export const syncItemMasterToInventoryEntries = async (itemId, { name, hsn }) => {
  if (!itemId) return;
  const entries = await backend.getAllInventoryEntries();
  const updates = [];
  for (const entry of entries) {
    let changed = false;
    const items = (entry.items || []).map((line) => {
      if (String(line.itemId) !== String(itemId)) return line;
      changed = true;
      return { ...line, name: name || '', hsn: hsn || '' };
    });
    if (changed) {
      updates.push(backend.saveInventoryEntry({ ...entry, items }));
    }
  }
  await Promise.all(updates);
};

/** Push latest item name/HSN from Items Master into all purchase bill lines that reference this item. */
export const syncItemMasterToPurchases = async (itemId, { name, hsn }) => {
  if (!itemId) return;
  const purchases = await backend.getAllPurchases();
  const updates = [];
  for (const purchase of purchases) {
    let changed = false;
    const items = (purchase.items || []).map((line) => {
      if (String(line.itemId) !== String(itemId)) return line;
      changed = true;
      return { ...line, name: name || '', hsn: hsn || '' };
    });
    if (changed) {
      updates.push(backend.savePurchase({ ...purchase, items }));
    }
  }
  await Promise.all(updates);
};

export const syncItemMasterEverywhere = async (itemId, fields) => {
  await Promise.all([
    syncItemMasterToInventoryEntries(itemId, fields),
    syncItemMasterToPurchases(itemId, fields),
  ]);
};
export const getAllExpenses = backend.getAllExpenses;
export const saveExpense = backend.saveExpense;
export const deleteExpense = backend.deleteExpense;
export const getAllPurchases = backend.getAllPurchases;
export const savePurchase = backend.savePurchase;
export const deletePurchase = backend.deletePurchase;
export const getAllRecurring = backend.getAllRecurring;
export const saveRecurring = backend.saveRecurring;
export const deleteRecurring = backend.deleteRecurring;
export const getAllReceipts = backend.getAllReceipts;
export const saveReceipt = backend.saveReceipt;
export const deleteReceipt = backend.deleteReceipt;
export const getAllProfiles = backend.getAllProfiles;
export const saveBusinessProfile = backend.saveBusinessProfile;
export const deleteBusinessProfile = backend.deleteBusinessProfile;
export const exportAllData = backend.exportAllData;
export const inspectBackup = backend.inspectBackup;
export const importData = backend.importData;
export const getMetaValue = backend.getMetaValue;
export const savePdf = backend.savePdf;
export const trashPdf = backend.trashPdf;

export { isSupabaseMode };

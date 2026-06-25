// Supabase-backed storage — same API surface as the local Express store.
import { supabase, waitForSession } from '../lib/supabase';

const DEFAULT_PROFILE = {
  businessName: '', address: '', city: '', pin: '', state: '', country: 'India',
  gstin: '', pan: '', email: '', phone: '',
  bankName: '', accountNumber: '', ifsc: '', swift: '',
  logo: '', logoHeight: 48, signature: '', upiId: '',
  googleClientId: '', googleDriveFolder: 'GST Billing Invoices',
  paymentAccounts: [],
};

export function normalizeProfile(raw = {}) {
  return { ...DEFAULT_PROFILE, ...(raw || {}) };
}

const TABLES = {
  bills: 'bills',
  clients: 'clients',
  vendors: 'vendors',
  templates: 'templates',
  products: 'products',
  items: 'items',
  brands: 'brands',
  majorGroups: 'major_groups',
  subGroups: 'sub_groups',
  staff: 'staff',
  inventoryEntries: 'inventory_entries',
  expenses: 'expenses',
  recurring: 'recurring',
  receipts: 'receipts',
  purchases: 'purchases',
  profiles: 'business_profiles',
};

async function uid() {
  const session = await waitForSession();
  if (session?.user) return session.user.id;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not signed in — please sign in again');
  return user.id;
}

async function listAll(table) {
  const userId = await uid();
  const { data, error } = await supabase
    .from(table)
    .select('data')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((r) => r.data);
}

async function upsert(table, record, idField = 'id') {
  const userId = await uid();
  const id = record[idField];
  if (!id) throw new Error(`${table} record needs an id`);
  const { error } = await supabase.from(table).upsert(
    { user_id: userId, id: String(id), data: record },
    { onConflict: 'user_id,id' },
  );
  if (error) throw error;
  return { success: true, id };
}

async function remove(table, id) {
  const userId = await uid();
  const { error } = await supabase.from(table).delete().eq('user_id', userId).eq('id', String(id));
  if (error) throw error;
  return { success: true };
}

function isMissingTableError(err, table = 'vendors') {
  const msg = String(err?.message || '').toLowerCase();
  const t = String(table).toLowerCase();
  return err?.code === 'PGRST205' || err?.code === '42P01'
    || msg.includes(`'public.${t}'`)
    || msg.includes(`relation "${t}" does not exist`)
    || (msg.includes(t) && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')));
}

function normalizeSupabaseError(err) {
  if (isMissingTableError(err, 'vendors')) {
    return new Error('Vendors table missing in Supabase — saving to cloud settings instead. Ask admin to run supabase/add_vendors_table.sql');
  }
  if (err?.message === 'Not signed in — please sign in again') {
    return new Error('Please sign in again to save vendors');
  }
  return new Error(err?.message || 'Cloud save failed');
}

const VENDORS_META_KEY = 'vendors';
const BRANDS_META_KEY = 'brands';
const MAJOR_GROUPS_META_KEY = 'major_groups';
const SUB_GROUPS_META_KEY = 'sub_groups';
const STAFF_META_KEY = 'staff';

async function readVendorsFromMeta() {
  const { meta } = await getSettings();
  const list = meta?.[VENDORS_META_KEY];
  return Array.isArray(list) ? list.filter(v => v && v.id) : [];
}

async function writeVendorsToMeta(vendors) {
  const settings = await getSettings();
  await saveSettings({
    profile: settings.profile,
    meta: { ...settings.meta, [VENDORS_META_KEY]: vendors },
  });
}

function sortVendors(vendors) {
  return [...vendors].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function readBrandsFromMeta() {
  const { meta } = await getSettings();
  const list = meta?.[BRANDS_META_KEY];
  return Array.isArray(list) ? list.filter(b => b && b.id) : [];
}

async function writeBrandsToMeta(brands) {
  const settings = await getSettings();
  await saveSettings({
    profile: settings.profile,
    meta: { ...settings.meta, [BRANDS_META_KEY]: brands },
  });
}

function sortBrands(brands) {
  return [...brands].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function readMajorGroupsFromMeta() {
  const { meta } = await getSettings();
  const list = meta?.[MAJOR_GROUPS_META_KEY];
  return Array.isArray(list) ? list.filter(r => r && r.id) : [];
}

async function writeMajorGroupsToMeta(rows) {
  const settings = await getSettings();
  await saveSettings({
    profile: settings.profile,
    meta: { ...settings.meta, [MAJOR_GROUPS_META_KEY]: rows },
  });
}

function sortMajorGroups(rows) {
  return [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function readSubGroupsFromMeta() {
  const { meta } = await getSettings();
  const list = meta?.[SUB_GROUPS_META_KEY];
  return Array.isArray(list) ? list.filter(r => r && r.id) : [];
}

async function writeSubGroupsToMeta(rows) {
  const settings = await getSettings();
  await saveSettings({
    profile: settings.profile,
    meta: { ...settings.meta, [SUB_GROUPS_META_KEY]: rows },
  });
}

function sortSubGroups(rows) {
  return [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function readStaffFromMeta() {
  const { meta } = await getSettings();
  const list = meta?.[STAFF_META_KEY];
  return Array.isArray(list) ? list.filter(s => s && s.id) : [];
}

async function writeStaffToMeta(staff) {
  const settings = await getSettings();
  await saveSettings({
    profile: settings.profile,
    meta: { ...settings.meta, [STAFF_META_KEY]: staff },
  });
}

function sortStaff(staff) {
  return [...staff].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function getSettings() {
  const userId = await uid();
  const { data, error } = await supabase
    .from('user_settings')
    .select('profile, meta')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') {
      throw new Error('Database tables missing — run supabase/schema.sql in Supabase SQL Editor');
    }
    throw new Error(error.message || 'Could not load settings');
  }
  return {
    profile: normalizeProfile(data?.profile),
    meta: data?.meta || {},
  };
}

async function readSettingsRow(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('profile, meta')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') {
      throw new Error('Database tables missing — run supabase/schema.sql in Supabase SQL Editor');
    }
    throw new Error(error.message || 'Could not load settings');
  }
  return data;
}

/** Merge keys into meta without re-uploading the full profile blob. */
async function patchSettingsMeta(metaPatch) {
  const userId = await uid();
  const existing = await readSettingsRow(userId);
  const newMeta = { ...(existing?.meta || {}), ...metaPatch };

  if (existing) {
    const { data, error } = await supabase
      .from('user_settings')
      .update({ meta: newMeta, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('profile, meta')
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        throw new Error('Database tables missing — run supabase/schema.sql in Supabase SQL Editor');
      }
      throw new Error(error.message || 'Could not save to cloud');
    }
    if (!data) throw new Error('Save failed — settings row not found after update');

    return {
      profile: normalizeProfile(data.profile),
      meta: data.meta || {},
    };
  }

  return saveSettings({ profile: {}, meta: newMeta });
}

async function saveSettings(patch) {
  const userId = await uid();
  let meta = patch.meta;
  let profile = patch.profile;

  if (meta === undefined || profile === undefined) {
    const existing = await readSettingsRow(userId);
    if (profile === undefined) profile = normalizeProfile(existing?.profile);
    if (meta === undefined) meta = existing?.meta || {};
  }

  const row = {
    user_id: userId,
    profile: normalizeProfile(profile),
    meta: meta || {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('user_settings')
    .upsert(row, { onConflict: 'user_id' })
    .select('profile, meta')
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      throw new Error('Database tables missing — run supabase/schema.sql in Supabase SQL Editor');
    }
    throw new Error(error.message || 'Could not save to cloud');
  }
  if (!data) throw new Error('Save failed — no data returned from cloud');

  return {
    profile: normalizeProfile(data.profile),
    meta: data.meta || {},
  };
}

// ── Invoice number settings ───────────────────────────────────────────────────

const DEFAULT_INV_SETTINGS = {
  format: 'branded',
  brandPrefix: '',
  separator: '/',
  showFinYear: true,
  startNumber: 1,
  padDigits: 4,
};

export const getInvoiceNumberSettings = async () => {
  const { meta } = await getSettings();
  return { ...DEFAULT_INV_SETTINGS, ...(meta.invoiceNumberSettings || {}) };
};

function sanitizeInvoiceNumberSettings(settings = {}) {
  const format = ['branded', 'sequential', 'random'].includes(settings.format)
    ? settings.format
    : 'branded';
  const separator = ['/', '-', '#'].includes(settings.separator) ? settings.separator : '/';
  return {
    format,
    brandPrefix: String(settings.brandPrefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
    separator,
    showFinYear: settings.showFinYear !== false,
    startNumber: Math.max(1, Number(settings.startNumber) || 1),
    padDigits: [3, 4, 5, 6].includes(Number(settings.padDigits)) ? Number(settings.padDigits) : 4,
  };
}

export const saveInvoiceNumberSettings = async (settings) => {
  await patchSettingsMeta({ invoiceNumberSettings: sanitizeInvoiceNumberSettings(settings) });
};

export const getInvoiceDisplayOptions = async () => {
  const { meta } = await getSettings();
  return meta.invoiceDisplayOptions || null;
};

export const saveInvoiceDisplayOptions = async (options) => {
  await patchSettingsMeta({ invoiceDisplayOptions: options || {} });
};

/** Default T&C text for new invoices — persisted in user_settings.meta */
export const getDefaultInvoiceTerms = async () => {
  const { meta } = await getSettings();
  const saved = meta?.defaultInvoiceTerms;
  if (!saved || typeof saved !== 'object') return { content: '', templateId: '' };
  return {
    content: typeof saved.content === 'string' ? saved.content : (saved.content != null ? String(saved.content) : ''),
    templateId: saved.templateId ? String(saved.templateId) : '',
  };
};

export const saveDefaultInvoiceTerms = async ({ content, templateId = '' }) => {
  await patchSettingsMeta({
    defaultInvoiceTerms: {
      content: content || '',
      templateId: templateId || '',
      updatedAt: new Date().toISOString(),
    },
  });
  return { success: true };
};

const REGION_KEY = 'gst_regionMode';
export const getRegionMode = () => {
  try { return localStorage.getItem(REGION_KEY) || 'both'; } catch { return 'both'; }
};
export const setRegionMode = (mode) => {
  if (!['india', 'international', 'both'].includes(mode)) return;
  try { localStorage.setItem(REGION_KEY, mode); } catch { /* ignore */ }
  patchSettingsMeta({ regionMode: mode }).catch(() => {});
};

const MODULES_KEY = 'gst_enabledModules';
export const getEnabledModules = () => {
  try {
    const raw = localStorage.getItem(MODULES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};
export const setEnabledModules = (map) => {
  try { localStorage.setItem(MODULES_KEY, JSON.stringify(map || {})); } catch { /* ignore */ }
  patchSettingsMeta({ enabledModules: map || {} }).catch(() => {});
};

export const getNextInvoiceNumber = async (prefix = 'INV') => {
  let settings = {
    format: 'branded', brandPrefix: '', separator: '/', showFinYear: true, padDigits: 4,
  };
  try {
    settings = await getInvoiceNumberSettings();
  } catch (err) {
    console.warn('Invoice number settings unavailable, using defaults:', err?.message || err);
  }

  let next = 1;
  try {
    const key = `counter_${prefix}`;
    const { data, error } = await supabase.rpc('increment_meta', { p_key: key });
    if (error) throw error;
    next = data ?? 1;
  } catch (err) {
    console.warn('Invoice counter RPC failed, using timestamp fallback:', err?.message || err);
    next = Number(String(Date.now()).slice(-4)) || 1;
  }

  if (settings.format === 'random') {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const pfx = settings.brandPrefix || prefix;
    return `${pfx}${settings.separator}${rand}`;
  }

  const sep = settings.separator || '/';
  const pfx = settings.brandPrefix || prefix;
  const padded = String(next).padStart(settings.padDigits || 4, '0');

  if (settings.showFinYear) {
    const currentYear = new Date().getFullYear();
    const nextYear = (currentYear + 1).toString().slice(-2);
    return `${pfx}${sep}${currentYear}-${nextYear}${sep}${padded}`;
  }

  return `${pfx}${sep}${padded}`;
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

export const saveBill = async (bill) => upsert(TABLES.bills, bill);
export const getAllBills = async () => {
  const bills = await listAll(TABLES.bills);
  bills.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate));
  return bills;
};
export const deleteBill = async (id) => remove(TABLES.bills, id);

export const saveProfile = async (profile) => {
  const saved = await saveSettings({ profile: normalizeProfile(profile) });
  return { success: true, profile: saved.profile };
};
export const getProfile = async () => {
  const { profile } = await getSettings();
  return normalizeProfile(profile);
};

export const saveClient = async (client) => {
  if (!client.id) client.id = 'cli_' + Date.now();
  await upsert(TABLES.clients, client);
  return client;
};
export const getAllClients = async () => {
  const clients = await listAll(TABLES.clients);
  clients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return clients;
};
export const deleteClient = async (id) => remove(TABLES.clients, id);

export const saveVendor = async (vendor) => {
  if (!vendor.id) vendor.id = 'ven_' + Date.now();
  try {
    await upsert(TABLES.vendors, vendor);
    return vendor;
  } catch (err) {
    if (!isMissingTableError(err, 'vendors')) throw normalizeSupabaseError(err);
    const list = await readVendorsFromMeta();
    const idx = list.findIndex(v => v.id === vendor.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...vendor };
    else list.push(vendor);
    await writeVendorsToMeta(list);
    return vendor;
  }
};
export const getAllVendors = async () => {
  try {
    return sortVendors(await listAll(TABLES.vendors));
  } catch (err) {
    if (!isMissingTableError(err, 'vendors')) throw normalizeSupabaseError(err);
    return sortVendors(await readVendorsFromMeta());
  }
};
export const deleteVendor = async (id) => {
  try {
    return await remove(TABLES.vendors, id);
  } catch (err) {
    if (!isMissingTableError(err, 'vendors')) throw normalizeSupabaseError(err);
    await writeVendorsToMeta((await readVendorsFromMeta()).filter(v => v.id !== id));
    return { success: true };
  }
};

export const getTermsTemplates = async () => {
  let templates = (await listAll(TABLES.templates)).filter(t => t && typeof t === 'object');
  if (templates.length === 0) {
    const defaultTpl = {
      id: 'default',
      name: 'Standard Terms',
      content: '1. Payment is due within 15 days of invoice date unless otherwise agreed in writing.\n2. Interest @ 18% p.a. will be charged on overdue payments beyond the due date.\n3. The scope of work is limited to what is explicitly mentioned in the project proposal/agreement. Any additional requirements will be quoted and billed separately.\n4. All intellectual property and source code will be transferred to the client only upon receipt of full payment.\n5. We shall not be liable for any delays caused by incomplete or late submission of content, credentials, or approvals from the client\'s end.\n6. Any change requests after project approval may attract additional charges and revised timelines.\n7. This invoice is subject to the jurisdiction of courts at the service provider\'s registered location.\n8. E. & O.E.',
    };
    await upsert(TABLES.templates, defaultTpl);
    templates = [defaultTpl];
  }
  templates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return templates;
};
export const saveTermsTemplate = async (template) => {
  if (!template.id) template.id = 'tpl_' + Date.now();
  await upsert(TABLES.templates, template);
  return template;
};
export const deleteTermsTemplate = async (id) => remove(TABLES.templates, id);

export const getAllProducts = async () => {
  const products = await listAll(TABLES.products);
  products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return products;
};
export const saveProduct = async (product) => {
  if (!product.id) product.id = 'prod_' + Date.now();
  try {
    await upsert(TABLES.products, product);
  } catch (err) {
    if (isMissingTableError(err, 'products')) {
      throw new Error('Products table missing — run supabase/schema.sql in Supabase SQL Editor');
    }
    throw err;
  }
  return product;
};
export const deleteProduct = async (id) => remove(TABLES.products, id);

export const getAllItems = async () => {
  const items = await listAll(TABLES.items);
  items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return items;
};
export const saveItem = async (item) => {
  if (!item.id) item.id = 'item_' + Date.now();
  try {
    await upsert(TABLES.items, item);
  } catch (err) {
    if (isMissingTableError(err, 'items')) {
      throw new Error('Items table missing — run supabase/add_inventory_tables.sql in Supabase SQL Editor');
    }
    throw err;
  }
  return item;
};
export const deleteItem = async (id) => remove(TABLES.items, id);

export const getAllBrands = async () => {
  try {
    return sortBrands(await listAll(TABLES.brands));
  } catch (err) {
    if (!isMissingTableError(err, 'brands')) throw err;
    return sortBrands(await readBrandsFromMeta());
  }
};
export const saveBrand = async (brand) => {
  if (!brand.id) brand.id = 'brand_' + Date.now();
  try {
    await upsert(TABLES.brands, brand);
    return brand;
  } catch (err) {
    if (!isMissingTableError(err, 'brands')) throw err;
    const list = await readBrandsFromMeta();
    const idx = list.findIndex(b => String(b.id) === String(brand.id));
    if (idx >= 0) list[idx] = { ...list[idx], ...brand };
    else list.push(brand);
    await writeBrandsToMeta(list);
    return brand;
  }
};
export const deleteBrand = async (id) => {
  try {
    return await remove(TABLES.brands, id);
  } catch (err) {
    if (!isMissingTableError(err, 'brands')) throw err;
    await writeBrandsToMeta((await readBrandsFromMeta()).filter(b => String(b.id) !== String(id)));
    return { success: true };
  }
};

export const getAllMajorGroups = async () => {
  try {
    return sortMajorGroups(await listAll(TABLES.majorGroups));
  } catch (err) {
    if (!isMissingTableError(err, 'major_groups')) throw err;
    return sortMajorGroups(await readMajorGroupsFromMeta());
  }
};
export const saveMajorGroup = async (record) => {
  if (!record.id) record.id = 'majgrp_' + Date.now();
  try {
    await upsert(TABLES.majorGroups, record);
    return record;
  } catch (err) {
    if (!isMissingTableError(err, 'major_groups')) throw err;
    const list = await readMajorGroupsFromMeta();
    const idx = list.findIndex(r => String(r.id) === String(record.id));
    if (idx >= 0) list[idx] = { ...list[idx], ...record };
    else list.push(record);
    await writeMajorGroupsToMeta(list);
    return record;
  }
};
export const deleteMajorGroup = async (id) => {
  try {
    return await remove(TABLES.majorGroups, id);
  } catch (err) {
    if (!isMissingTableError(err, 'major_groups')) throw err;
    await writeMajorGroupsToMeta((await readMajorGroupsFromMeta()).filter(r => String(r.id) !== String(id)));
    return { success: true };
  }
};

export const getAllSubGroups = async () => {
  try {
    return sortSubGroups(await listAll(TABLES.subGroups));
  } catch (err) {
    if (!isMissingTableError(err, 'sub_groups')) throw err;
    return sortSubGroups(await readSubGroupsFromMeta());
  }
};
export const saveSubGroup = async (record) => {
  if (!record.id) record.id = 'subgrp_' + Date.now();
  try {
    await upsert(TABLES.subGroups, record);
    return record;
  } catch (err) {
    if (!isMissingTableError(err, 'sub_groups')) throw err;
    const list = await readSubGroupsFromMeta();
    const idx = list.findIndex(r => String(r.id) === String(record.id));
    if (idx >= 0) list[idx] = { ...list[idx], ...record };
    else list.push(record);
    await writeSubGroupsToMeta(list);
    return record;
  }
};
export const deleteSubGroup = async (id) => {
  try {
    return await remove(TABLES.subGroups, id);
  } catch (err) {
    if (!isMissingTableError(err, 'sub_groups')) throw err;
    await writeSubGroupsToMeta((await readSubGroupsFromMeta()).filter(r => String(r.id) !== String(id)));
    return { success: true };
  }
};

export const getAllStaff = async () => {
  try {
    return sortStaff(await listAll(TABLES.staff));
  } catch (err) {
    if (!isMissingTableError(err, 'staff')) throw err;
    return sortStaff(await readStaffFromMeta());
  }
};
export const saveStaff = async (record) => {
  if (!record.id) record.id = 'staff_' + Date.now();
  try {
    await upsert(TABLES.staff, record);
    return record;
  } catch (err) {
    if (!isMissingTableError(err, 'staff')) throw err;
    const list = await readStaffFromMeta();
    const idx = list.findIndex(s => String(s.id) === String(record.id));
    if (idx >= 0) list[idx] = { ...list[idx], ...record };
    else list.push(record);
    await writeStaffToMeta(list);
    return record;
  }
};
export const deleteStaff = async (id) => {
  try {
    return await remove(TABLES.staff, id);
  } catch (err) {
    if (!isMissingTableError(err, 'staff')) throw err;
    await writeStaffToMeta((await readStaffFromMeta()).filter(s => String(s.id) !== String(id)));
    return { success: true };
  }
};

export const getAllInventoryEntries = async () => {
  const entries = await listAll(TABLES.inventoryEntries);
  entries.sort((a, b) => new Date(b.entryDate || 0) - new Date(a.entryDate || 0));
  return entries;
};
export const saveInventoryEntry = async (entry) => {
  if (!entry.id) entry.id = 'inent_' + Date.now();
  try {
    await upsert(TABLES.inventoryEntries, entry);
  } catch (err) {
    if (isMissingTableError(err, 'inventory_entries')) {
      throw new Error('Inventory entries table missing — run supabase/add_inventory_tables.sql in Supabase SQL Editor');
    }
    throw err;
  }
  return entry;
};
export const deleteInventoryEntry = async (id) => remove(TABLES.inventoryEntries, id);

function inventoryDateKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export const getNextInventoryId = async (entryDate) => {
  const dateKey = inventoryDateKey(entryDate ? new Date(entryDate) : new Date());
  const metaKey = `counter_inventory_${dateKey}`;
  let next = 1;
  try {
    const { data, error } = await supabase.rpc('increment_meta', { p_key: metaKey });
    if (error) throw error;
    next = data ?? 1;
  } catch (err) {
    console.warn('Inventory ID counter failed, using timestamp fallback:', err?.message || err);
    next = Number(String(Date.now()).slice(-3)) || 1;
  }
  const serial = String(next).padStart(3, '0');
  return `INV-${dateKey}-${serial}`;
};

export const getAllExpenses = async () => {
  const expenses = await listAll(TABLES.expenses);
  expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  return expenses;
};
export const saveExpense = async (expense) => {
  if (!expense.id) expense.id = 'exp_' + Date.now();
  await upsert(TABLES.expenses, expense);
  return expense;
};
export const deleteExpense = async (id) => remove(TABLES.expenses, id);

export const getAllPurchases = async () => {
  const purchases = await listAll(TABLES.purchases);
  purchases.sort((a, b) => new Date(b.date) - new Date(a.date));
  return purchases;
};
export const savePurchase = async (purchase) => {
  if (!purchase.id) purchase.id = 'pur_' + Date.now();
  await upsert(TABLES.purchases, purchase);
  return purchase;
};
export const deletePurchase = async (id) => remove(TABLES.purchases, id);

export const getAllRecurring = async () => {
  const items = await listAll(TABLES.recurring);
  items.sort((a, b) => (a.clientName || '').localeCompare(b.clientName || ''));
  return items;
};
export const saveRecurring = async (item) => {
  if (!item.id) item.id = 'rec_' + Date.now();
  await upsert(TABLES.recurring, item);
  return item;
};
export const deleteRecurring = async (id) => remove(TABLES.recurring, id);

export const getAllReceipts = async () => {
  const receipts = await listAll(TABLES.receipts);
  receipts.sort((a, b) => new Date(b.date) - new Date(a.date));
  return receipts;
};
export const saveReceipt = async (receipt) => {
  if (!receipt.id) receipt.id = 'rcp_' + Date.now();
  await upsert(TABLES.receipts, receipt);
  return receipt;
};
export const deleteReceipt = async (id) => remove(TABLES.receipts, id);

export const getAllProfiles = async () => {
  const profiles = await listAll(TABLES.profiles);
  profiles.sort((a, b) => (a.businessName || '').localeCompare(b.businessName || ''));
  return profiles;
};
export const saveBusinessProfile = async (profile) => {
  if (!profile.id) profile.id = 'biz_' + Date.now();
  await upsert(TABLES.profiles, profile);
  return profile;
};
export const deleteBusinessProfile = async (id) => remove(TABLES.profiles, id);

// ── Export / Import ───────────────────────────────────────────────────────────

const EXPORTABLE_LOCALSTORAGE_KEYS = [
  'gst_customUnits',
  'gst_regionMode',
  'gst_enabledModules',
  'freegstbill_invoiceOptions',
  'theme',
  'freegstbill_onboarded',
];

const collectLocalStorage = () => {
  const out = {};
  EXPORTABLE_LOCALSTORAGE_KEYS.forEach((k) => {
    try { const v = localStorage.getItem(k); if (v !== null) out[k] = v; } catch { /* sandboxed */ }
  });
  return out;
};

const restoreLocalStorage = (map) => {
  if (!map || typeof map !== 'object') return;
  Object.entries(map).forEach(([k, v]) => {
    if (!EXPORTABLE_LOCALSTORAGE_KEYS.includes(k)) return;
    try { localStorage.setItem(k, v); } catch { /* ignore */ }
  });
};

const APP_VERSION = '1.6.2';

export const exportAllData = async (selection) => {
  const [bills, profile, clients, vendors, termsTemplates, products, expenses, recurring, receipts, profiles, purchases, settings] =
    await Promise.all([
      getAllBills(),
      getProfile(),
      getAllClients(),
      getAllVendors(),
      getTermsTemplates(),
      getAllProducts(),
      getAllExpenses(),
      getAllRecurring(),
      getAllReceipts(),
      getAllProfiles(),
      getAllPurchases(),
      getSettings(),
    ]);

  const all = {
    bills, profile, clients, vendors, termsTemplates, products, expenses,
    recurring, receipts, profiles, purchases, meta: settings.meta,
  };

  const sel = selection || {
    profile: true, profiles: true, bills: true, clients: true, vendors: true, products: true,
    expenses: true, purchases: true, recurring: true, receipts: true,
    termsTemplates: true, meta: true, localStorage: true,
  };

  const data = { exportedAt: new Date().toISOString(), version: APP_VERSION, __freegstbill_backup: true };
  if (sel.profile) data.profile = all.profile;
  if (sel.profiles) data.profiles = all.profiles;
  if (sel.bills) data.bills = all.bills;
  if (sel.clients) data.clients = all.clients;
  if (sel.vendors) data.vendors = all.vendors;
  if (sel.termsTemplates) data.termsTemplates = all.termsTemplates;
  if (sel.products) data.products = all.products;
  if (sel.expenses) data.expenses = all.expenses;
  if (sel.recurring) data.recurring = all.recurring;
  if (sel.receipts) data.receipts = all.receipts;
  if (sel.purchases) data.purchases = all.purchases;
  if (sel.meta) data.meta = all.meta;
  if (sel.localStorage) data.localStorage = collectLocalStorage();

  return JSON.stringify(data, null, 2);
};

export const inspectBackup = (jsonString) => {
  let data;
  try { data = JSON.parse(jsonString); }
  catch { throw new Error('Not a valid JSON file'); }
  return {
    valid: !!data && (data.__freegstbill_backup || data.bills || data.profile),
    exportedAt: data.exportedAt || null,
    version: data.version || null,
    counts: {
      profile: data.profile && Object.keys(data.profile).length > 0 ? 1 : 0,
      profiles: Array.isArray(data.profiles) ? data.profiles.length : 0,
      bills: Array.isArray(data.bills) ? data.bills.length : 0,
      clients: Array.isArray(data.clients) ? data.clients.length : 0,
      vendors: Array.isArray(data.vendors) ? data.vendors.length : 0,
      termsTemplates: Array.isArray(data.termsTemplates) ? data.termsTemplates.length : 0,
      products: Array.isArray(data.products) ? data.products.length : 0,
      expenses: Array.isArray(data.expenses) ? data.expenses.length : 0,
      purchases: Array.isArray(data.purchases) ? data.purchases.length : 0,
      recurring: Array.isArray(data.recurring) ? data.recurring.length : 0,
      receipts: Array.isArray(data.receipts) ? data.receipts.length : 0,
      meta: data.meta ? Object.keys(data.meta).length : 0,
      localStorage: data.localStorage ? Object.keys(data.localStorage).length : 0,
    },
    raw: data,
  };
};

export const importData = async (jsonString, selection) => {
  const inspected = typeof jsonString === 'string' ? inspectBackup(jsonString) : { raw: jsonString };
  const data = inspected.raw;
  const sel = selection || {
    profile: true, profiles: true, bills: true, clients: true, vendors: true, products: true,
    expenses: true, purchases: true, recurring: true, receipts: true,
    termsTemplates: true, meta: true, localStorage: true,
  };

  let billCount = 0;
  let clientCount = 0;
  let templateCount = 0;
  let productCount = 0;

  if (sel.profile && data.profile) {
    await saveProfile(data.profile);
  }
  if (sel.bills && Array.isArray(data.bills)) {
    for (const bill of data.bills) {
      if (bill.id) { await saveBill(bill); billCount++; }
    }
  }
  if (sel.clients && Array.isArray(data.clients)) {
    for (const cli of data.clients) {
      if (cli.id) { await saveClient(cli); clientCount++; }
    }
  }
  if (sel.vendors && Array.isArray(data.vendors)) {
    for (const ven of data.vendors) {
      if (ven.id) await saveVendor(ven);
    }
  }
  if (sel.termsTemplates && Array.isArray(data.termsTemplates)) {
    for (const tpl of data.termsTemplates) {
      if (tpl.id) { await saveTermsTemplate(tpl); templateCount++; }
    }
  }
  if (sel.products && Array.isArray(data.products)) {
    for (const prod of data.products) {
      if (prod.id) { await saveProduct(prod); productCount++; }
    }
  }
  if (sel.expenses && Array.isArray(data.expenses)) {
    for (const exp of data.expenses) {
      if (exp.id) await saveExpense(exp);
    }
  }
  if (sel.recurring && Array.isArray(data.recurring)) {
    for (const rec of data.recurring) {
      if (rec.id) await saveRecurring(rec);
    }
  }
  if (sel.receipts && Array.isArray(data.receipts)) {
    for (const rcp of data.receipts) {
      if (rcp.id) await saveReceipt(rcp);
    }
  }
  if (sel.profiles && Array.isArray(data.profiles)) {
    for (const prof of data.profiles) {
      if (prof.id) await saveBusinessProfile(prof);
    }
  }
  if (sel.purchases && Array.isArray(data.purchases)) {
    for (const pur of data.purchases) {
      if (pur.id) await savePurchase(pur);
    }
  }
  if (sel.meta && data.meta) {
    const { profile } = await getSettings();
    await saveSettings({ profile, meta: data.meta });
  }

  if (sel.localStorage && data.localStorage) restoreLocalStorage(data.localStorage);

  return { billCount, clientCount, templateCount, productCount, hasProfile: !!data.profile };
};

// ── PDF storage (Supabase Storage) ───────────────────────────────────────────

export const savePdf = async (pdfBlob, { fileName, clientName, month }) => {
  const userId = await uid();
  const safeClient = (clientName || 'General').replace(/[<>:"/\\|?*]/g, '-').trim() || 'General';
  const safeMonth = (month || new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' }))
    .replace(/[<>:"/\\|?*]/g, '-').trim();
  const safeName = (fileName || `invoice-${Date.now()}.pdf`).replace(/[<>:"/\\|?*]/g, '-');
  const path = `${userId}/${safeClient}/${safeMonth}/${safeName}`;

  const { error } = await supabase.storage.from('invoices').upload(path, pdfBlob, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw error;
  return { saved: true, path };
};

export const trashPdf = async ({ fileName, clientName }) => {
  const userId = await uid();
  const safeClient = (clientName || 'General').replace(/[<>:"/\\|?*]/g, '-').trim() || 'General';
  const safeName = (fileName || '').replace(/[<>:"/\\|?*]/g, '-');
  if (!safeName) return { trashed: false };

  const { data: files } = await supabase.storage.from('invoices').list(`${userId}/${safeClient}`, { limit: 100 });
  for (const folder of files || []) {
    if (!folder.name) continue;
    const filePath = `${userId}/${safeClient}/${folder.name}/${safeName}`;
    const { error } = await supabase.storage.from('invoices').remove([filePath]);
    if (!error) return { trashed: true };
  }
  return { trashed: false };
};

export const getMetaValue = async (key) => {
  const { meta } = await getSettings();
  return meta[key] ?? null;
};

export const setMetaValue = async (key, value) => {
  await patchSettingsMeta({ [key]: value });
};

const BARCODE_SEQ_KEY = 'barcodeSequence';
const BARCODE_START = 100000001;

export const getNextBarcode = async () => {
  let next = 1;
  try {
    const { data, error } = await supabase.rpc('increment_meta', { p_key: BARCODE_SEQ_KEY });
    if (error) throw error;
    next = data ?? 1;
  } catch (err) {
    console.warn('Barcode counter failed, using timestamp fallback:', err?.message || err);
    next = Number(String(Date.now()).slice(-6)) || 1;
  }
  const num = BARCODE_START + (Number(next) || 1) - 1;
  return String(num).padStart(9, '0');
};

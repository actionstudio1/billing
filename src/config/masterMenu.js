import { Layers, FolderTree, UserCog, Tags, Truck, Bookmark, ClipboardList, ScanBarcode } from 'lucide-react';

/** Master submenu — add new masters here for easy extension. */
export const MASTER_CHILDREN = [
  { id: 'majorGroups', icon: Layers, label: 'Major Group Master', module: 'items' },
  { id: 'subGroups', icon: FolderTree, label: 'Sub Group Master', module: 'items' },
  { id: 'staff', icon: UserCog, label: 'Staff Master', module: 'items' },
  { id: 'items', icon: Tags, label: 'Items Master', module: 'items' },
  { id: 'vendors', icon: Truck, label: 'Vendor Master', module: 'vendors' },
  { id: 'brands', icon: Bookmark, label: 'Brand Master', module: 'items' },
  { id: 'purchaseEntry', icon: ClipboardList, label: 'Purchase Entry', module: 'inventory' },
  { id: 'barcodeLabel', icon: ScanBarcode, label: 'Barcode Label', module: 'inventory' },
];

export const MASTER_VIEW_IDS = MASTER_CHILDREN.map(c => c.id);

export const VIEW_MODULE_MAP = {
  new: 'invoicing',
  clients: 'clients',
  vendors: 'vendors',
  items: 'items',
  brands: 'items',
  majorGroups: 'items',
  subGroups: 'items',
  staff: 'items',
  purchaseEntry: 'inventory',
  barcodeLabel: 'inventory',
  inventory: 'inventory',
  expenses: 'expenses',
  purchases: 'purchases',
  recurring: 'recurring',
  receipts: 'receipts',
  reports: 'reports',
  filing: 'gstReturns',
};

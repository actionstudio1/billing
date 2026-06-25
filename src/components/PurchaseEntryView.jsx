import InventoryView from './InventoryView';

/** Purchase Entry — inventory entries only, under MASTER menu. */
export default function PurchaseEntryView() {
  return <InventoryView masterMode defaultTab="entries" title="Purchase Entry" />;
}

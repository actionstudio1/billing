import { useState, useEffect, useMemo } from 'react';
import { getAllProducts, getAllItems, getProfile } from '../store';
import { getCountryConfig } from '../utils';
import { toast } from './Toast';
import { printBarcodeLabels } from './BarcodeLabelPrint';
import MasterShell, { MasterTable } from './master/MasterShell';

export default function BarcodeLabelView() {
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [companyName, setCompanyName] = useState('');
  const [currency, setCurrency] = useState('INR');

  const load = async () => {
    try {
      const [prods, it, profile] = await Promise.all([getAllProducts(), getAllItems(), getProfile()]);
      setProducts(prods);
      setItems(it);
      setCompanyName(profile?.businessName || profile?.name || '');
      setCurrency(getCountryConfig(profile?.country || 'India').currency);
    } catch (err) { toast(err?.message || 'Failed to load', 'error'); }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const fromProducts = products.filter(p => p.barcode).map(p => ({
      id: `p_${p.id}`,
      sourceId: p.id,
      name: p.name,
      barcode: p.barcode,
      mrp: p.mrp,
      salePrice: p.rate || p.salePrice,
      size: p.size,
      color: p.color,
    }));
    const prodBarcodes = new Set(fromProducts.map(r => r.barcode));
    const fromItems = items
      .filter(i => i.barcode && !prodBarcodes.has(i.barcode))
      .map(i => ({
        id: `i_${i.id}`,
        sourceId: i.id,
        name: i.name,
        barcode: i.barcode,
        mrp: i.mrp,
        salePrice: i.salePrice || i.saleRate,
        size: i.size,
        color: i.color,
      }));
    const all = [...fromProducts, ...fromItems].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(r =>
      (r.name || '').toLowerCase().includes(q) || (r.barcode || '').includes(q),
    );
  }, [products, items, search]);

  const toggleSelect = (row) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  };

  const handlePrint = () => {
    const toPrint = rows.filter(r => selectedIds.has(r.id));
    if (toPrint.length === 0) {
      toast('Select items to print', 'warning');
      return;
    }
    const ok = printBarcodeLabels(toPrint, { currency, companyName });
    if (!ok) toast('No valid barcodes', 'warning');
  };

  const handlePrintAll = () => {
    if (rows.length === 0) { toast('No barcodes', 'warning'); return; }
    printBarcodeLabels(rows, { currency, companyName });
  };

  return (
    <MasterShell title="Barcode Label" search={search} onSearchChange={setSearch} searchPlaceholder="Search item or barcode…">
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
        Inventory save par unique barcode auto-generate hota hai. Label mein Item Name, MRP, Size, Barcode aur Company Name print hoga.
      </p>
      <div className="retail-master-actions">
        <button type="button" className="retail-btn retail-btn-print" onClick={handlePrint}>Print Selected</button>
        <button type="button" className="retail-btn retail-btn-print" onClick={handlePrintAll}>Print All</button>
        <button type="button" className="retail-btn retail-btn-muted" onClick={() => setSelectedIds(new Set(rows.map(r => r.id)))}>Select All</button>
        <button type="button" className="retail-btn retail-btn-muted" onClick={() => setSelectedIds(new Set())}>Clear</button>
      </div>
      <MasterTable
        columns={[
          { key: 'sel', label: '✓', render: r => (
            <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r)} onClick={e => e.stopPropagation()} />
          ) },
          { key: 'name', label: 'Item Name' },
          { key: 'barcode', label: 'Barcode' },
          { key: 'mrp', label: 'MRP' },
          { key: 'size', label: 'Size' },
        ]}
        rows={rows}
        selectedId={null}
        onSelectRow={toggleSelect}
        emptyText="No barcoded items — save a Purchase Entry first"
      />
    </MasterShell>
  );
}

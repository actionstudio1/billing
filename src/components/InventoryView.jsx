import { useState, useEffect } from 'react';
import { Package, Search, Plus, Edit3, Trash2, X, Truck, ClipboardList, ScanBarcode, Barcode } from 'lucide-react';
import {
  getAllInventoryEntries, saveInventoryEntry, deleteInventoryEntry,
  getAllProducts, saveProduct, getAllVendors, getAllItems, getProfile,
  processInventoryEntryBarcodes, generateBarcodeForProduct,
} from '../store';
import { getCountryConfig, formatCurrency } from '../utils';
import { toast } from './Toast';
import InventoryEntryModal, { calcEntryTotals } from './InventoryEntryModal';
import StockOperations from './StockOperations';
import { printBarcodeLabels } from './BarcodeLabelPrint';

export default function InventoryView({ masterMode = false, defaultTab = 'entries', title } = {}) {
  const [tab, setTab] = useState(masterMode ? 'entries' : defaultTab);
  const [entries, setEntries] = useState([]);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [saving, setSaving] = useState(false);
  const [profileCountry, setProfileCountry] = useState('India');
  const profileCurrency = getCountryConfig(profileCountry).currency;
  const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v]));

  const loadAll = async () => {
    try {
      const [ents, prods, vens, items] = await Promise.all([
        getAllInventoryEntries(),
        getAllProducts(),
        getAllVendors(),
        getAllItems(),
      ]);
      setEntries(ents);
      setProducts(prods);
      setVendors(vens);
      setItemsMaster(items);
    } catch (err) {
      toast(err?.message || 'Failed to load inventory', 'error');
    }
  };

  useEffect(() => {
    loadAll();
    getProfile().then(p => { if (p?.country) setProfileCountry(p.country); }).catch(() => {});
  }, []);

  const filteredEntries = entries.filter(e => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(e.inventoryId || '').toLowerCase().includes(q) &&
          !(e.vendorBillNo || '').toLowerCase().includes(q) &&
          !(e.vendorName || '').toLowerCase().includes(q)) return false;
    }
    if (viewMode === 'byVendor' && vendorFilter && e.vendorId !== vendorFilter) return false;
    return true;
  });

  const filteredProducts = products.filter(p => {
    if (viewMode === 'byVendor') {
      if (!vendorFilter) return false;
      if (p.vendorId !== vendorFilter) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(p.name || '').toLowerCase().includes(q) && !(p.hsn || '').toLowerCase().includes(q)
          && !(p.barcode || '').toLowerCase().includes(q)) {
        const linked = itemsMaster.find(i => String(i.id) === String(p.itemId));
        if (!(linked?.barcode || '').toLowerCase().includes(q)) return false;
      }
    }
    return true;
  });

  const openAdd = () => { setEditingEntry(null); setShowForm(true); };
  const openEdit = (entry) => { setEditingEntry(entry); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingEntry(null); };

  const syncProductStock = async (entry, isNew) => {
    if (!isNew || !entry.vendorId) return;
    try {
      const catalog = await getAllProducts();
      for (const line of entry.items || []) {
        const name = (line.name || '').trim().toLowerCase();
        if (!name) continue;
        const qty = parseFloat(line.quantity) || parseFloat(line.stock) || 0;

        const master = line.itemId ? itemsMaster.find(i => String(i.id) === String(line.itemId)) : null;

        const productPayload = {
          itemId: line.itemId || '',
          barcode: line.barcode || '',
          name: line.name,
          hsn: line.hsn || '',
          size: line.size || '',
          color: line.color || '',
          brand: master?.brand || line.brand || '',
          category: master?.category || line.category || '',
          rate: parseFloat(line.rate) || 0,
          taxPercent: parseFloat(line.taxPercent) ?? 0,
          unit: line.unit || 'Nos',
          description: line.description || '',
          vendorId: entry.vendorId,
          purchaseRate: parseFloat(line.purchaseRate) || parseFloat(line.rate) || 0,
          lastPurchaseDate: entry.partyBillDate || entry.acDate || entry.entryDate || '',
          reorderLevel: parseFloat(line.reorderLevel) || 0,
        };

        const match = line.barcode
          ? catalog.find(p => String(p.barcode || '') === String(line.barcode))
          : null;

        if (match) {
          await saveProduct({
            ...match,
            ...productPayload,
            stock: (parseFloat(match.stock) || 0) + qty,
          });
        } else {
          await saveProduct({
            ...productPayload,
            stock: qty,
          });
        }
      }
    } catch (err) {
      console.warn('Stock sync failed:', err);
    }
  };

  const handleSave = async (payload) => {
    const isNew = !editingEntry?.id;
    try {
      setSaving(true);
      const { entry: withBarcodes, labelsToPrint } = await processInventoryEntryBarcodes(payload);
      await saveInventoryEntry({
        ...(editingEntry?.id ? { id: editingEntry.id } : {}),
        ...withBarcodes,
      });
      await syncProductStock(withBarcodes, isNew);
      const assigned = (withBarcodes.items || []).filter(l => l.barcode).length;
      const newCount = labelsToPrint.length;
      toast(
        editingEntry
          ? `Entry updated — ${assigned} barcode(s) on file${newCount ? `, ${newCount} new` : ''}`
          : `Entry saved — ${assigned} barcode(s) assigned`,
        'success',
      );
      closeForm();
      await loadAll();
      if (labelsToPrint.length > 0 && confirm(`Print ${labelsToPrint.length} new barcode label(s) now?`)) {
        const profile = await getProfile().catch(() => ({}));
        printBarcodeLabels(labelsToPrint, {
          currency: profileCurrency,
          companyName: profile?.businessName || profile?.name || '',
        });
      }
    } catch (err) {
      toast(err?.message || 'Failed to save entry', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateProductBarcode = async (product) => {
    try {
      const updated = await generateBarcodeForProduct(product.id);
      toast(`Barcode generated: ${updated.barcode}`, 'success');
      await loadAll();
      if (confirm('Print barcode label now?')) {
        printBarcodeLabels({
          name: updated.name || product.name,
          barcode: updated.barcode,
          mrp: product.mrp,
          salePrice: updated.rate || product.rate,
          size: updated.size || product.size,
          color: updated.color || product.color,
        }, { currency: profileCurrency });
      }
    } catch (err) {
      toast(err?.message || 'Failed to generate barcode', 'error');
    }
  };

  const handleDeleteEntry = async (id) => {
    if (!confirm('Delete this inventory entry?')) return;
    try {
      await deleteInventoryEntry(id);
      toast('Entry deleted', 'success');
      loadAll();
    } catch {
      toast('Failed to delete entry', 'error');
    }
  };

  const selectedVendor = vendorFilter ? vendorMap[vendorFilter] : null;

  return (
    <div className={`dashboard-container ${masterMode ? 'retail-master-page' : ''}`}>
      <div className="page-header">
        <div>
          <h1 className={masterMode ? 'retail-master-title' : 'page-title'}>{title || (masterMode ? 'Purchase Entry' : 'Inventory')}</h1>
          {!masterMode && <p className="page-subtitle">Purchase entries, stock &amp; vendor-wise inventory</p>}
        </div>
        <button type="button" className={`btn ${masterMode ? 'retail-btn retail-btn-add' : 'btn-primary'}`} onClick={openAdd}>
          <Plus size={18} /> New Entry
        </button>
      </div>

      {!masterMode && (
        <div className="glass-panel p-4 mb-6">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            <button type="button" className={`type-chip ${tab === 'entries' ? 'type-chip-active' : ''}`}
              onClick={() => setTab('entries')}>
              <ClipboardList size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              Entries
            </button>
            <button type="button" className={`type-chip ${tab === 'stock' ? 'type-chip-active' : ''}`}
              onClick={() => setTab('stock')}>
              <Package size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              Stock Summary
            </button>
            <button type="button" className={`type-chip ${tab === 'barcode' ? 'type-chip-active' : ''}`}
              onClick={() => setTab('barcode')}>
              <ScanBarcode size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              Barcode Ops
            </button>
          </div>
        </div>
      )}
      {(masterMode || tab !== 'barcode') && (
      <div className={masterMode ? 'retail-master-panel mb-6' : 'glass-panel p-4 mb-6'}>
        {!masterMode && (
        <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <button type="button" className={`type-chip ${viewMode === 'all' ? 'type-chip-active' : ''}`}
                onClick={() => { setViewMode('all'); setVendorFilter(''); }}>All</button>
              <button type="button" className={`type-chip ${viewMode === 'byVendor' ? 'type-chip-active' : ''}`}
                onClick={() => setViewMode('byVendor')}>
                <Truck size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> By Vendor
              </button>
            </div>

            {viewMode === 'byVendor' && (
              <div className="form-group" style={{ maxWidth: 360, marginBottom: '1rem' }}>
                <label className="form-label">Select Vendor</label>
                <select className="form-input" value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
                  <option value="">— Select vendor —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            )}

            <div className="search-box" style={{ maxWidth: '400px' }}>
              <Search size={16} className="search-icon" />
              <input type="text" placeholder={tab === 'entries' ? 'Search ID, vendor, bill no…' : 'Search product, barcode…'}
                value={search} onChange={e => setSearch(e.target.value)} className="search-input" />
              {search && <button type="button" className="icon-btn" onClick={() => setSearch('')}><X size={14} /></button>}
            </div>
          </>
        )}
        {masterMode && (
          <div className="retail-master-search" style={{ maxWidth: 400, marginBottom: '0.5rem' }}>
            <Search size={16} className="retail-master-search-icon" />
            <input type="text" placeholder="Search ID, vendor, bill no…"
              value={search} onChange={e => setSearch(e.target.value)} className="form-input retail-master-search-input" />
            {search && <button type="button" className="retail-master-search-clear" onClick={() => setSearch('')}><X size={14} /></button>}
          </div>
        )}
      </div>
      )}

      <InventoryEntryModal
        show={showForm}
        onClose={closeForm}
        onSave={handleSave}
        entry={editingEntry}
        isEditing={!!editingEntry}
        saving={saving}
        vendors={vendors}
        itemsMaster={itemsMaster}
        products={products}
        profileCountry={profileCountry}
        onVendorsChange={loadAll}
        onItemsChange={loadAll}
      />

      {(masterMode || tab === 'entries') ? (
        <div className={masterMode ? 'retail-master-list' : 'glass-panel'}>
          <div className="table-header"><h3>Purchase Entries ({filteredEntries.length})</h3></div>
          {viewMode === 'byVendor' && !vendorFilter ? (
            <div className="empty-state"><Truck size={48} /><p>Select a vendor to filter entries.</p></div>
          ) : filteredEntries.length === 0 ? (
            <div className="empty-state">
              <ClipboardList size={48} />
              <p>No inventory entries yet.</p>
              <button type="button" className="btn btn-primary" onClick={openAdd}><Plus size={18} /> New Entry</button>
            </div>
          ) : (
            <div className="table-scroll">
              <table className={masterMode ? 'retail-master-table' : 'data-table'} style={{ minWidth: '880px' }}>
                <thead>
                  <tr>
                    <th>Entry Date</th>
                    <th>Inventory ID</th>
                    <th>Vendor</th>
                    <th>Bill No</th>
                    <th>Mode</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map(e => {
                    const t = calcEntryTotals(e.items);
                    return (
                      <tr key={e.id}>
                        <td className="text-muted">{e.entryDate ? new Date(e.entryDate).toLocaleDateString('en-IN') : '-'}</td>
                        <td><span className="invoice-badge">{e.inventoryId}</span></td>
                        <td className="font-medium">{e.vendorName || vendorMap[e.vendorId]?.name || '-'}</td>
                        <td className="text-muted">{e.vendorBillNo || '-'}</td>
                        <td>{e.mode || 'Credit'}</td>
                        <td style={{ textAlign: 'right' }} className="font-bold">{formatCurrency(t.total, profileCurrency)}</td>
                        <td>
                          <div className="table-actions">
                            <button type="button" className="icon-btn icon-btn-blue" onClick={() => openEdit(e)} title="Edit"><Edit3 size={15} /></button>
                            <button type="button" className="icon-btn icon-btn-red" onClick={() => handleDeleteEntry(e.id)} title="Delete"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !masterMode && tab === 'stock' ? (
        <div className="glass-panel">
          <div className="table-header">
            <h3>{viewMode === 'byVendor' && selectedVendor ? `Stock — ${selectedVendor.name}` : 'Products & Stock'}</h3>
          </div>
          {viewMode === 'byVendor' && !vendorFilter ? (
            <div className="empty-state"><Truck size={48} /><p>Select a vendor above.</p></div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-state">
              <Package size={48} />
              <p>{products.length === 0 ? 'No stock yet. Create an inventory entry.' : 'No products match filters.'}</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    {viewMode === 'all' && <th>Vendor</th>}
                    <th>Barcode</th>
                    <th>HSN</th>
                    <th>Sell Rate</th>
                    <th>Cost</th>
                    <th>GST %</th>
                    <th>Unit</th>
                    <th>Stock</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(product => {
                    const ven = product.vendorId ? vendorMap[product.vendorId] : null;
                    const master = product.itemId ? itemsMaster.find(i => String(i.id) === String(product.itemId)) : null;
                    const barcode = product.barcode || master?.barcode || '';
                    const hasBarcode = !!barcode;
                    const reorder = parseFloat(product.reorderLevel) || 5;
                    const stock = product.stock ?? 0;
                    return (
                      <tr key={product.id}>
                        <td className="font-medium">{product.name}</td>
                        {viewMode === 'all' && <td className="text-muted">{ven?.name || '-'}</td>}
                        <td className="text-muted" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{barcode || '-'}</td>
                        <td className="text-muted">{product.hsn || '-'}</td>
                        <td className="font-bold">{product.rate ? formatCurrency(product.rate, profileCurrency) : '-'}</td>
                        <td className="text-muted">{product.purchaseRate ? formatCurrency(product.purchaseRate, profileCurrency) : '-'}</td>
                        <td>{product.taxPercent ? `${product.taxPercent}%` : '-'}</td>
                        <td className="text-muted">{product.unit || 'Nos'}</td>
                        <td>
                          {stock <= 0 ? (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>Out of Stock</span>
                          ) : stock <= reorder ? (
                            <span style={{ color: '#d97706', fontWeight: 600 }}>{stock}</span>
                          ) : stock}
                        </td>
                        <td>
                          {!hasBarcode && (
                            <button type="button" className="btn btn-secondary"
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem' }}
                              onClick={() => handleGenerateProductBarcode(product)}>
                              <Barcode size={12} /> Generate
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !masterMode ? (
        <StockOperations
          products={products}
          itemsMaster={itemsMaster}
          onStockChange={loadAll}
        />
      ) : null}
    </div>
  );
}

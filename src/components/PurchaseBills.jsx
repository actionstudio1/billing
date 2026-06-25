import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Edit3, Trash2, Search, X, Save, Download } from 'lucide-react';
import {
  getAllPurchases, savePurchase, deletePurchase, getAllVendors,
  getAllProducts, saveProduct, getAllItems, saveItem,
} from '../store';
import { formatCurrency, normalizeItemName } from '../utils';
import { toast } from './Toast';
import SearchableSelect from './SearchableSelect';
import ItemModal from './ItemModal';

const PAYMENT_STATUSES = ['Unpaid', 'Paid', 'Partial'];

const emptyItem = () => ({
  itemId: '',
  name: '',
  hsn: '',
  quantity: 1,
  rate: '',
  saleRate: '',
  taxPercent: 18,
});

const emptyForm = {
  date: new Date().toISOString().split('T')[0],
  vendorId: '',
  supplierName: '',
  supplierGstin: '',
  invoiceNumber: '',
  items: [emptyItem()],
  paymentStatus: 'Unpaid',
  interstate: false,
  note: '',
};

function calcItemTax(item) {
  const amount = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
  const tax = (amount * (parseFloat(item.taxPercent) || 0)) / 100;
  return { amount, tax, total: amount + tax };
}

function calcPurchaseTotal(items) {
  return (items || []).reduce((acc, item) => {
    const { amount, tax, total } = calcItemTax(item);
    return { taxable: acc.taxable + amount, tax: acc.tax + tax, total: acc.total + total };
  }, { taxable: 0, tax: 0, total: 0 });
}

function calcLinePurTotal(item) {
  return (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
}

function calcLineSaleTotal(item) {
  return (parseFloat(item.quantity) || 0) * (parseFloat(item.saleRate) || 0);
}

function calcFormSummary(items) {
  const gst = calcPurchaseTotal(items);
  const totalPur = (items || []).reduce((sum, item) => sum + calcLinePurTotal(item), 0);
  const totalSale = (items || []).reduce((sum, item) => sum + calcLineSaleTotal(item), 0);
  return { ...gst, totalPur, totalSale };
}

function getFYOptions() {
  const now = new Date();
  const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const options = [];
  for (let i = 0; i < 5; i++) {
    const y = currentYear - i;
    options.push({ value: `${y}-${y + 1}`, label: `FY ${y}-${String(y + 1).slice(-2)}`, from: `${y}-04-01`, to: `${y + 1}-03-31` });
  }
  return options;
}

function isRowEmpty(line) {
  return !line.itemId
    && !String(line.rate || '').trim()
    && (line.quantity === '' || line.quantity === 1 || Number(line.quantity) === 1);
}

function resolveItemId(line, itemsMaster) {
  if (line.itemId) return String(line.itemId);
  const name = (line.name || '').trim().toLowerCase();
  if (!name) return '';
  const match = itemsMaster.find(i => (i.name || '').trim().toLowerCase() === name);
  return match ? String(match.id) : '';
}

export default function PurchaseBills() {
  const [purchases, setPurchases] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [search, setSearch] = useState('');
  const [fyFilter, setFyFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm, items: [emptyItem()] });
  const [errors, setErrors] = useState({});
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemModalRow, setItemModalRow] = useState(null);
  const [quickSaving, setQuickSaving] = useState(false);

  const fyOptions = getFYOptions();

  const loadAll = async () => {
    try {
      const [purs, vens, items] = await Promise.all([
        getAllPurchases(), getAllVendors(), getAllItems(),
      ]);
      setPurchases(purs);
      setVendors(vens);
      setItemsMaster(items);
    } catch {
      toast('Failed to load purchases', 'error');
    }
  };

  useEffect(() => {
    if (fyOptions[0]) setFyFilter(fyOptions[0].value);
    loadAll();
  }, []);

  // Sync name/HSN from Items Master while form is open
  useEffect(() => {
    if (!showForm || !itemsMaster?.length) return;
    setForm(prev => ({
      ...prev,
      items: prev.items.map(line => {
        if (!line.itemId) return line;
        const master = itemsMaster.find(i => String(i.id) === String(line.itemId));
        if (!master) return line;
        return { ...line, name: master.name || '', hsn: master.hsn || '' };
      }),
    }));
  }, [showForm, itemsMaster]);

  const itemOptions = itemsMaster.map(i => ({
    id: i.id,
    label: (i.name || '').trim() || 'Unnamed item',
    sublabel: i.hsn ? `HSN: ${i.hsn}` : '',
  }));

  const filtered = purchases.filter(p => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(p.supplierName || '').toLowerCase().includes(q) &&
          !(p.invoiceNumber || '').toLowerCase().includes(q) &&
          !(p.supplierGstin || '').toLowerCase().includes(q)) return false;
    }
    if (fyFilter) {
      const fy = fyOptions.find(f => f.value === fyFilter);
      if (fy && p.date) {
        if (p.date < fy.from || p.date > fy.to) return false;
      }
    }
    return true;
  });

  const totalStats = filtered.reduce((acc, p) => {
    const t = calcPurchaseTotal(p.items);
    return { taxable: acc.taxable + t.taxable, tax: acc.tax + t.tax, total: acc.total + t.total };
  }, { taxable: 0, tax: 0, total: 0 });

  const openAdd = () => {
    setForm({ ...emptyForm, items: [emptyItem()] });
    setEditingId(null);
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (purchase) => {
    setForm({
      date: purchase.date || '',
      vendorId: purchase.vendorId || '',
      supplierName: purchase.supplierName || '',
      supplierGstin: purchase.supplierGstin || '',
      invoiceNumber: purchase.invoiceNumber || '',
      items: (purchase.items && purchase.items.length > 0)
        ? purchase.items.map(i => {
            const base = { ...emptyItem(), ...i };
            const master = i.itemId ? itemsMaster.find(m => String(m.id) === String(i.itemId)) : null;
            if (master) return { ...base, name: master.name || '', hsn: master.hsn || '' };
            return base;
          })
        : [emptyItem()],
      paymentStatus: purchase.paymentStatus || 'Unpaid',
      interstate: !!purchase.interstate,
      note: purchase.note || '',
    });
    setEditingId(purchase.id);
    setErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm, items: [emptyItem()] });
    setErrors({});
    setShowItemModal(false);
    setItemModalRow(null);
  };

  const handleVendorSelect = (vendorId) => {
    const vendor = vendors.find(v => v.id === vendorId);
    setForm(prev => ({
      ...prev,
      vendorId,
      supplierName: vendor?.name || prev.supplierName,
      supplierGstin: vendor?.gstin || prev.supplierGstin,
    }));
  };

  const handleItemPick = (idx, itemId) => {
    const master = itemsMaster.find(i => String(i.id) === String(itemId));
    if (!master) return;
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = {
        ...items[idx],
        itemId: String(master.id),
        name: master.name || '',
        hsn: master.hsn || '',
      };
      return { ...prev, items };
    });
    if (errors[`item_${idx}`]) setErrors(e => ({ ...e, [`item_${idx}`]: '' }));
  };

  const syncProductStockFromPurchase = async (purchase, isNew) => {
    if (!isNew || !purchase.vendorId) return;
    try {
      const catalog = await getAllProducts();
      for (const item of purchase.items || []) {
        const name = (item.name || '').trim().toLowerCase();
        if (!name) continue;
        let match = item.itemId
          ? catalog.find(p => p.itemId === item.itemId && p.vendorId === purchase.vendorId)
          : null;
        if (!match) {
          match = catalog.find(p =>
            p.vendorId === purchase.vendorId &&
            (p.name || '').trim().toLowerCase() === name
          );
        }
        if (match) {
          await saveProduct({
            ...match,
            itemId: item.itemId || match.itemId || '',
            stock: (parseFloat(match.stock) || 0) + (parseFloat(item.quantity) || 0),
            purchaseRate: parseFloat(item.rate) || match.purchaseRate || 0,
            rate: parseFloat(item.saleRate) || match.rate || 0,
            lastPurchaseDate: purchase.date || '',
            vendorId: purchase.vendorId,
          });
        }
      }
    } catch (err) {
      console.warn('Stock sync from purchase failed:', err);
    }
  };

  const validate = () => {
    const next = {};
    if (!form.supplierName.trim()) next.supplierName = 'Supplier name is required';
    if (!form.invoiceNumber.trim()) next.invoiceNumber = 'Invoice number is required';

    const rowsToCheck = form.items.filter(line => !isRowEmpty(line));
    const activeRows = rowsToCheck.length ? rowsToCheck : [form.items[0]];

    activeRows.forEach((line) => {
      const idx = form.items.indexOf(line);
      if (!resolveItemId(line, itemsMaster)) {
        next[`item_${idx}`] = 'Please select an item from Items Master';
      }
      const qty = parseFloat(line.quantity);
      if (!qty || qty <= 0) next[`qty_${idx}`] = 'Enter valid quantity';
      const pur = parseFloat(line.rate);
      if (!pur || pur < 0) next[`pur_${idx}`] = 'Enter valid PUR rate';
    });

    setErrors(next);
    return { ok: Object.keys(next).length === 0, errors: next };
  };

  const scrollToFirstError = (errorMap) => {
    const firstKey = Object.keys(errorMap)[0];
    if (!firstKey) return;
    requestAnimationFrame(() => {
      document.querySelector(`[data-pur-field="${firstKey}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleSave = async () => {
    const { ok, errors: validationErrors } = validate();
    if (!ok) {
      const firstMsg = Object.values(validationErrors)[0];
      toast(firstMsg || 'Please fix the highlighted fields', 'warning');
      scrollToFirstError(validationErrors);
      return;
    }

    const linesToSave = form.items.filter(line => !isRowEmpty(line));
    const activeLines = linesToSave.length ? linesToSave : [form.items[0]];
    const isNew = !editingId;

    try {
      const totals = calcFormSummary(activeLines);
      const purchase = {
        ...(editingId ? { id: editingId } : {}),
        date: form.date,
        vendorId: form.vendorId || '',
        supplierName: form.supplierName.trim(),
        supplierGstin: form.supplierGstin.trim(),
        invoiceNumber: form.invoiceNumber.trim(),
        items: activeLines.map(i => {
          const itemId = resolveItemId(i, itemsMaster);
          const master = itemId ? itemsMaster.find(m => String(m.id) === itemId) : null;
          return {
            itemId: itemId || '',
            name: (master?.name || i.name || '').trim(),
            hsn: (master?.hsn || i.hsn || '').trim(),
            quantity: parseFloat(i.quantity) || 0,
            rate: parseFloat(i.rate) || 0,
            saleRate: parseFloat(i.saleRate) || 0,
            taxPercent: parseFloat(i.taxPercent) || 0,
            productId: i.productId || '',
          };
        }),
        totalAmount: totals.total,
        totalTax: totals.tax,
        taxableAmount: totals.taxable,
        totalPurAmount: totals.totalPur,
        totalSaleAmount: totals.totalSale,
        paymentStatus: form.paymentStatus,
        interstate: !!form.interstate,
        note: form.note.trim(),
      };
      await savePurchase(purchase);
      await syncProductStockFromPurchase(purchase, isNew);
      toast(editingId ? 'Purchase updated' : 'Purchase added', 'success');
      closeForm();
      loadAll();
    } catch {
      toast('Failed to save purchase', 'error');
    }
  };

  const handleQuickItemSave = async (formData) => {
    try {
      setQuickSaving(true);
      const saved = await saveItem({
        name: normalizeItemName(formData.name),
        hsn: (formData.hsn || '').trim(),
      });
      toast('Item saved', 'success');
      setShowItemModal(false);
      const row = itemModalRow;
      setItemModalRow(null);
      await loadAll();
      if (row !== null && saved?.id) {
        setForm(prev => {
          const items = [...prev.items];
          items[row] = {
            ...items[row],
            itemId: String(saved.id),
            name: saved.name || formData.name.trim(),
            hsn: saved.hsn || (formData.hsn || '').trim(),
          };
          return { ...prev, items };
        });
        if (errors[`item_${row}`]) setErrors(e => ({ ...e, [`item_${row}`]: '' }));
      }
    } catch (err) {
      toast(err?.message || 'Failed to save item', 'error');
    } finally {
      setQuickSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this purchase bill?')) {
      try {
        await deletePurchase(id);
        toast('Purchase deleted', 'success');
        loadAll();
      } catch {
        toast('Failed to delete', 'error');
      }
    }
  };

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
  };

  const updateItem = (index, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
    if (errors[`${field === 'quantity' ? 'qty' : field === 'rate' ? 'pur' : field}_${index}`]) {
      setErrors(e => ({ ...e, [`${field === 'quantity' ? 'qty' : field === 'rate' ? 'pur' : field}_${index}`]: '' }));
    }
  };

  const addItem = () => {
    setForm(prev => ({ ...prev, items: [...prev.items, emptyItem()] }));
  };

  const removeItem = (index) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const exportCSV = () => {
    if (filtered.length === 0) { toast('No purchases to export', 'warning'); return; }
    const headers = ['Date', 'Supplier', 'GSTIN', 'Invoice No', 'Taxable Amount', 'Tax', 'Total', 'Status', 'Note'];
    const escape = (v) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [headers.map(escape).join(',')];
    filtered.forEach(p => {
      const t = calcPurchaseTotal(p.items);
      lines.push([p.date, p.supplierName, p.supplierGstin, p.invoiceNumber, t.taxable.toFixed(2), t.tax.toFixed(2), t.total.toFixed(2), p.paymentStatus, p.note].map(escape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'purchases.csv'; a.click();
    URL.revokeObjectURL(url);
    toast('Purchases CSV downloaded', 'success');
  };

  const formTotals = calcFormSummary(form.items);

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Bills</h1>
          <p className="page-subtitle">Track supplier invoices for ITC claims in GSTR-3B</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={16} /> Export CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={18} /> Add Purchase</button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-icon stat-icon-purple"><ShoppingCart size={22} /></div>
          <div><p className="stat-label">Total Purchases</p><h2 className="stat-value stat-value-purple">{formatCurrency(totalStats.total)}</h2></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-green"><ShoppingCart size={22} /></div>
          <div><p className="stat-label">GST (ITC Eligible)</p><h2 className="stat-value stat-value-green">{formatCurrency(totalStats.tax)}</h2></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-blue"><ShoppingCart size={22} /></div>
          <div><p className="stat-label">Entries</p><h2 className="stat-value">{filtered.length}</h2></div>
        </div>
      </div>

      <div className="glass-panel p-4 mb-6">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-box" style={{ maxWidth: '300px' }}>
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Search supplier, invoice..." value={search}
              onChange={e => setSearch(e.target.value)} className="search-input" />
          </div>
          <select className="filter-select" value={fyFilter} onChange={e => setFyFilter(e.target.value)}>
            {fyOptions.map(fy => <option key={fy.value} value={fy.value}>{fy.label}</option>)}
          </select>
          {search && (
            <button className="icon-btn icon-btn-red" onClick={() => setSearch('')}><X size={15} /></button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-content purchase-bill-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '960px' }}>
            <h3 className="section-title">{editingId ? 'Edit Purchase Bill' : 'New Purchase Bill'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input type="date" className="form-input" value={form.date} onChange={e => updateField('date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Status</label>
                <select className="form-input" value={form.paymentStatus} onChange={e => updateField('paymentStatus', e.target.value)}>
                  {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Vendor</label>
                <select className="form-input" value={form.vendorId}
                  onChange={e => handleVendorSelect(e.target.value)}>
                  <option value="">— Select vendor —</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}{v.gstin ? ` — ${v.gstin}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" data-pur-field="supplierName">
                <label className="form-label">Supplier Name *</label>
                <input type="text" className={`form-input ${errors.supplierName ? 'form-input-error' : ''}`}
                  value={form.supplierName} onChange={e => updateField('supplierName', e.target.value)}
                  placeholder="Vendor / Supplier name" />
                {errors.supplierName && <span className="field-error">{errors.supplierName}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Supplier GSTIN</label>
                <input type="text" className="form-input" value={form.supplierGstin}
                  onChange={e => updateField('supplierGstin', e.target.value)} placeholder="15-digit GSTIN" maxLength={15} />
              </div>
              <div className="form-group" data-pur-field="invoiceNumber">
                <label className="form-label">Invoice Number *</label>
                <input type="text" className={`form-input ${errors.invoiceNumber ? 'form-input-error' : ''}`}
                  value={form.invoiceNumber} onChange={e => updateField('invoiceNumber', e.target.value)}
                  placeholder="Supplier invoice no." />
                {errors.invoiceNumber && <span className="field-error">{errors.invoiceNumber}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Note (optional)</label>
                <input type="text" className="form-input" value={form.note}
                  onChange={e => updateField('note', e.target.value)} placeholder="Any note..." />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form.interstate}
                    onChange={e => updateField('interstate', e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
                  <span>
                    <strong>Inter-state purchase</strong> — supplier charged IGST (different state)
                  </span>
                </label>
              </div>
            </div>

            <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Items</h4>
            <div className="purchase-items-table">
              <div className="purchase-items-head">
                <span>Item Name *</span>
                <span>HSN Code</span>
                <span>Qty</span>
                <span>PUR</span>
                <span>Sale Rs</span>
                <span>Pur Total</span>
                <span>Tax %</span>
                <span></span>
              </div>
              {form.items.map((item, idx) => {
                const linePurTotal = calcLinePurTotal(item);
                return (
                <div key={idx} className="purchase-items-row">
                  <div className="form-group" style={{ margin: 0 }} data-pur-field={`item_${idx}`}>
                    <SearchableSelect
                      options={itemOptions}
                      value={item.itemId}
                      onChange={(id) => handleItemPick(idx, id)}
                      onAddNew={() => { setItemModalRow(idx); setShowItemModal(true); }}
                      addNewLabel="Add new item to master"
                      placeholder={itemOptions.length ? 'Search item…' : 'Add items in Items Master first'}
                      fallbackLabel={item.name}
                      fallbackSublabel={item.hsn ? `HSN: ${item.hsn}` : ''}
                      widePanel
                      error={!!errors[`item_${idx}`]}
                    />
                    {errors[`item_${idx}`] && <span className="field-error">{errors[`item_${idx}`]}</span>}
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <input type="text" className="form-input form-input-readonly" value={item.hsn} readOnly
                      placeholder="—" title="From Items Master" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }} data-pur-field={`qty_${idx}`}>
                    <input type="number" className={`form-input ${errors[`qty_${idx}`] ? 'form-input-error' : ''}`}
                      value={item.quantity} min="0.01" step="0.01"
                      onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                    {errors[`qty_${idx}`] && <span className="field-error">{errors[`qty_${idx}`]}</span>}
                  </div>
                  <div className="form-group" style={{ margin: 0 }} data-pur-field={`pur_${idx}`}>
                    <input type="number" className={`form-input ${errors[`pur_${idx}`] ? 'form-input-error' : ''}`}
                      value={item.rate} min="0" step="0.01" placeholder="0.00"
                      onChange={e => updateItem(idx, 'rate', e.target.value)} title="Purchase rate per unit" />
                    {errors[`pur_${idx}`] && <span className="field-error">{errors[`pur_${idx}`]}</span>}
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <input type="number" className="form-input" value={item.saleRate} min="0" step="0.01"
                      placeholder="0.00" onChange={e => updateItem(idx, 'saleRate', e.target.value)}
                      title="Selling rate per unit" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <input type="text" className="form-input form-input-readonly purchase-line-total" readOnly
                      value={linePurTotal ? formatCurrency(linePurTotal) : '—'} title="Qty × PUR" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <select className="form-input" value={item.taxPercent}
                      onChange={e => updateItem(idx, 'taxPercent', e.target.value)}>
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {form.items.length > 1 && (
                      <button type="button" className="icon-btn icon-btn-red" onClick={() => removeItem(idx)} title="Remove">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );})}
            </div>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', marginTop: '0.5rem' }}
              onClick={addItem}><Plus size={14} /> Add Item</button>

            <div className="purchase-bill-totals">
              <span>Total PUR: <strong>{formatCurrency(formTotals.totalPur)}</strong></span>
              <span>Total Sale Rs: <strong>{formatCurrency(formTotals.totalSale)}</strong></span>
              <span>Taxable: <strong>{formatCurrency(formTotals.taxable)}</strong></span>
              <span>Tax: <strong>{formatCurrency(formTotals.tax)}</strong></span>
              <span>Grand Total: <strong>{formatCurrency(formTotals.total)}</strong></span>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleSave}><Save size={16} /> {editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <ItemModal show={showItemModal} onClose={() => { setShowItemModal(false); setItemModalRow(null); }}
        onSave={handleQuickItemSave} item={null} isEditing={false} saving={quickSaving} />

      <div className="glass-panel">
        <div className="table-header"><h3>Purchase Records</h3></div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <ShoppingCart size={48} />
            <p>{purchases.length === 0 ? 'No purchase bills recorded yet.' : 'No purchases match your filters.'}</p>
            {purchases.length === 0 && <button className="btn btn-primary" onClick={openAdd}><Plus size={18} /> Add Purchase</button>}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: '800px' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>GSTIN</th>
                  <th>Invoice No</th>
                  <th style={{ textAlign: 'right' }}>Taxable</th>
                  <th style={{ textAlign: 'right' }}>Tax</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const t = calcPurchaseTotal(p.items);
                  return (
                    <tr key={p.id}>
                      <td className="text-muted">{p.date ? new Date(p.date).toLocaleDateString('en-IN') : ''}</td>
                      <td className="font-medium">{p.supplierName}</td>
                      <td className="text-muted" style={{ fontSize: '0.78rem' }}>{p.supplierGstin || '-'}</td>
                      <td><span className="invoice-badge">{p.invoiceNumber}</span></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(t.taxable)}</td>
                      <td style={{ textAlign: 'right' }} className="text-muted">{formatCurrency(t.tax)}</td>
                      <td style={{ textAlign: 'right' }} className="font-bold">{formatCurrency(t.total)}</td>
                      <td>
                        <span style={{
                          padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                          background: p.paymentStatus === 'Paid' ? '#ecfdf5' : p.paymentStatus === 'Partial' ? '#f5f3ff' : '#fffbeb',
                          color: p.paymentStatus === 'Paid' ? '#059669' : p.paymentStatus === 'Partial' ? '#8b5cf6' : '#f59e0b',
                        }}>{p.paymentStatus || 'Unpaid'}</span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="icon-btn icon-btn-blue" onClick={() => openEdit(p)} title="Edit"><Edit3 size={15} /></button>
                          <button className="icon-btn icon-btn-red" onClick={() => handleDelete(p.id)} title="Delete"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                  <td colSpan={4}>Total</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(totalStats.taxable)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(totalStats.tax)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(totalStats.total)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Package, Plus, Trash2, Barcode } from 'lucide-react';
import { getAllUnits, formatCurrency, getCountryConfig, normalizeItemName } from '../utils';
import { getNextInventoryId, saveVendor, saveItem } from '../store';
import { findProductByBarcode, findItemByVariant, variantKey } from '../lib/barcode';
import SearchableSelect from './SearchableSelect';
import BarcodeScannerInput from './BarcodeScannerInput';
import VendorModal from './VendorModal';
import ItemModal from './ItemModal';
import { toast } from './Toast';

const MODES = ['Credit', 'Online'];

const today = () => new Date().toISOString().split('T')[0];

const newRowId = () => `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const emptyLineItem = () => ({
  rowId: newRowId(),
  itemId: '',
  name: '',
  hsn: '',
  barcode: '',
  size: '',
  color: '',
  mrp: '',
  rate: '',
  taxPercent: '18',
  unit: 'Nos',
  quantity: '1',
  stock: '',
  description: '',
  purchaseRate: '',
  reorderLevel: '',
});

export function calcLineItem(line) {
  const qty = parseFloat(line.quantity) || parseFloat(line.stock) || 0;
  const rate = parseFloat(line.purchaseRate) || parseFloat(line.rate) || 0;
  const amount = qty * rate;
  const tax = (amount * (parseFloat(line.taxPercent) || 0)) / 100;
  return { amount, tax, total: amount + tax, qty };
}

export function calcEntryTotals(items) {
  return (items || []).reduce((acc, line) => {
    const { amount, tax, total } = calcLineItem(line);
    return { taxable: acc.taxable + amount, tax: acc.tax + tax, total: acc.total + total };
  }, { taxable: 0, tax: 0, total: 0 });
}

export function buildEmptyEntry() {
  return {
    entryDate: today(),
    inventoryId: '',
    acDate: today(),
    vendorBillNo: '',
    partyBillDate: '',
    mode: 'Credit',
    vendorId: '',
    vendorName: '',
    items: [emptyLineItem()],
    note: '',
  };
}

function isRowEmpty(line) {
  return !line.itemId
    && !String(line.purchaseRate || '').trim()
    && !String(line.rate || '').trim()
    && !line.description?.trim()
    && (line.quantity === '' || line.quantity === '1' || Number(line.quantity) === 1);
}

function resolveItemId(line, itemsMaster) {
  if (line.itemId) return String(line.itemId);
  const name = (line.name || '').trim().toLowerCase();
  if (!name) return '';
  const match = itemsMaster.find(i => (i.name || '').trim().toLowerCase() === name);
  return match ? String(match.id) : '';
}

function formHasData(form) {
  if (!form) return false;
  if (form.vendorBillNo?.trim() || form.vendorId || form.partyBillDate || form.note?.trim()) return true;
  return (form.items || []).some(line =>
    line.itemId
    || (line.name || '').trim()
    || String(line.purchaseRate || '').trim()
    || String(line.rate || '').trim()
    || (line.description || '').trim()
    || (line.quantity && line.quantity !== '1')
  );
}

export default function InventoryEntryModal({
  show,
  onClose,
  onSave,
  entry,
  isEditing,
  saving = false,
  vendors = [],
  itemsMaster = [],
  products = [],
  profileCountry = 'India',
  onVendorsChange,
  onItemsChange,
}) {
  const [form, setForm] = useState(buildEmptyEntry());
  const [units] = useState(getAllUnits());
  const [errors, setErrors] = useState({});
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemModalRow, setItemModalRow] = useState(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const currency = getCountryConfig(profileCountry).currency;

  const requestClose = useCallback(() => {
    if (saving) return;
    if (formHasData(form) && !confirm('Close without saving? Your entry will be lost.')) return;
    onClose();
  }, [form, saving, onClose]);

  useEffect(() => {
    if (!show) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving && !showVendorModal && !showItemModal) requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, saving, showVendorModal, showItemModal, requestClose]);

  useEffect(() => {
    if (!show) return;
    if (entry && isEditing) {
      setForm({
        entryDate: entry.entryDate || today(),
        inventoryId: entry.inventoryId || '',
        acDate: entry.acDate || today(),
        vendorBillNo: entry.vendorBillNo || '',
        partyBillDate: entry.partyBillDate || '',
        mode: entry.mode || 'Credit',
        vendorId: entry.vendorId || '',
        vendorName: entry.vendorName || '',
        items: (entry.items && entry.items.length)
          ? entry.items.map(i => {
              const base = { ...emptyLineItem(), ...i, rowId: i.rowId || newRowId() };
              const master = i.itemId ? itemsMaster.find(m => String(m.id) === String(i.itemId)) : null;
              if (master) {
                return { ...base, name: master.name || '', hsn: master.hsn || '' };
              }
              return base;
            })
          : [emptyLineItem()],
        note: entry.note || '',
      });
    } else if (show) {
      (async () => {
        const base = buildEmptyEntry();
        try {
          base.inventoryId = await getNextInventoryId(base.entryDate);
        } catch {
          base.inventoryId = `INV-${base.entryDate.replace(/-/g, '')}-001`;
        }
        setForm(base);
        setErrors({});
      })();
    }
  }, [show, entry, isEditing]);

  // Keep item master fields in sync when master is updated while form is open.
  useEffect(() => {
    if (!show || !itemsMaster?.length) return;
    setForm(prev => ({
      ...prev,
      items: prev.items.map(line => {
        if (!line.itemId) return line;
        const master = itemsMaster.find(i => String(i.id) === String(line.itemId));
        if (!master) return line;
        return {
          ...line,
          name: master.name || line.name || '',
          hsn: master.hsn || line.hsn || '',
          size: line.size || master.size || '',
          color: line.color || master.color || '',
          mrp: line.mrp || (master.mrp != null ? String(master.mrp) : ''),
          rate: line.rate || (master.salePrice != null ? String(master.salePrice) : ''),
        };
      }),
    }));
  }, [show, itemsMaster]);

  const applyVariantToLine = (line, size, color) => {
    const name = (line.name || '').trim();
    if (!name) return { ...line, size, color };

    const variant = findItemByVariant(itemsMaster, { name, size, color });
    if (variant) {
      return {
        ...line,
        itemId: String(variant.id),
        name: variant.name || name,
        hsn: variant.hsn || line.hsn || '',
        size: variant.size || size,
        color: variant.color || color,
        barcode: '',
        mrp: variant.mrp != null ? String(variant.mrp) : line.mrp || '',
        rate: variant.salePrice != null ? String(variant.salePrice) : line.rate || '',
      };
    }

    const master = line.itemId ? itemsMaster.find(i => String(i.id) === String(line.itemId)) : null;
    const isNewVariant = master && variantKey(master) !== variantKey({ name, size, color });
    return {
      ...line,
      size,
      color,
      ...(isNewVariant ? { itemId: '', barcode: '' } : {}),
    };
  };

  if (!show) return null;

  const vendorOptions = vendors.map(v => ({
    id: v.id,
    label: v.name,
    sublabel: v.gstin || v.phone || '',
  }));

  const itemOptions = itemsMaster.map(i => ({
    id: i.id,
    label: (i.name || '').trim() || 'Unnamed item',
    sublabel: [i.hsn ? `HSN: ${i.hsn}` : '', i.size ? `Size: ${i.size}` : '', i.color ? `Color: ${i.color}` : ''].filter(Boolean).join(' · '),
  }));

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const setLine = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      let line = { ...items[idx], [field]: value };
      if (field === 'size' || field === 'color') {
        line = applyVariantToLine(line, field === 'size' ? value : line.size, field === 'color' ? value : line.color);
      }
      items[idx] = line;
      return { ...prev, items };
    });
  };

  const setLineQty = (idx, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], quantity: value, stock: value };
      return { ...prev, items };
    });
  };

  const handleVendorPick = (vendorId) => {
    const ven = vendors.find(v => v.id === vendorId);
    setForm(prev => ({
      ...prev,
      vendorId,
      vendorName: ven?.name || '',
    }));
    if (errors.vendorId) setErrors(e => ({ ...e, vendorId: '' }));
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
        size: master.size || items[idx].size || '',
        color: master.color || items[idx].color || '',
        mrp: master.mrp != null ? String(master.mrp) : items[idx].mrp || '',
        rate: master.salePrice != null ? String(master.salePrice) : items[idx].rate || '',
        barcode: '',
      };
      return { ...prev, items };
    });
    if (errors[`item_${idx}`]) setErrors(e => ({ ...e, [`item_${idx}`]: '' }));
  };

  const handleBarcodeScan = (barcode) => {
    const product = findProductByBarcode(barcode, itemsMaster, products);
    if (!product) {
      toast(`No stock found for barcode: ${barcode}`, 'warning');
      return;
    }
    const master = product.itemId
      ? itemsMaster.find(i => String(i.id) === String(product.itemId))
      : null;
    const emptyIdx = form.items.findIndex(line => !line.itemId && isRowEmpty(line));
    const targetIdx = emptyIdx >= 0 ? emptyIdx : form.items.length;
    setForm(prev => {
      const items = [...prev.items];
      const row = {
        ...(items[targetIdx] || emptyLineItem()),
        itemId: master ? String(master.id) : (product.itemId ? String(product.itemId) : ''),
        name: product.name || master?.name || '',
        hsn: product.hsn || master?.hsn || '',
        size: product.size || master?.size || '',
        color: product.color || master?.color || '',
        mrp: product.mrp != null ? String(product.mrp) : (master?.mrp != null ? String(master.mrp) : ''),
        rate: product.rate != null ? String(product.rate) : (master?.salePrice != null ? String(master.salePrice) : items[targetIdx]?.rate || ''),
        barcode: '',
        quantity: items[targetIdx]?.quantity || '1',
        stock: items[targetIdx]?.stock || '1',
      };
      if (targetIdx >= items.length) {
        items.push(row);
      } else {
        items[targetIdx] = row;
      }
      return { ...prev, items };
    });
    toast(`Added: ${master.name}`, 'success');
  };

  const addLine = () => setForm(prev => ({ ...prev, items: [...prev.items, emptyLineItem()] }));

  const removeLine = (idx) => {
    if (form.items.length <= 1) {
      toast('At least one product row is required', 'warning');
      return;
    }
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const validate = () => {
    const next = {};
    if (!form.vendorId) next.vendorId = 'Please select a vendor';
    if (!form.vendorBillNo?.trim()) next.vendorBillNo = 'Vendor bill number is required';

    const rowsToCheck = form.items.filter(line => !isRowEmpty(line));
    const activeRows = rowsToCheck.length ? rowsToCheck : [form.items[0]];

    activeRows.forEach((line) => {
      const idx = form.items.indexOf(line);
      const itemId = resolveItemId(line, itemsMaster);
      if (!itemId) next[`item_${idx}`] = 'Please select an item from Items Master';
      const qty = parseFloat(line.quantity) || parseFloat(line.stock);
      if (!qty || qty <= 0) next[`qty_${idx}`] = 'Enter valid quantity';
    });

    setErrors(next);
    return { ok: Object.keys(next).length === 0, errors: next };
  };

  const scrollToFirstError = (errorMap) => {
    const firstKey = Object.keys(errorMap)[0];
    if (!firstKey) return;
    requestAnimationFrame(() => {
      document.querySelector(`[data-field-error="${firstKey}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    const { ok, errors: validationErrors } = validate();
    if (!ok) {
      const firstMsg = Object.values(validationErrors)[0];
      toast(firstMsg || 'Please fix the highlighted fields', 'warning');
      scrollToFirstError(validationErrors);
      return;
    }

    const linesToSave = form.items.filter(line => !isRowEmpty(line));
    const activeLines = linesToSave.length ? linesToSave : [form.items[0]];

    const totals = calcEntryTotals(activeLines);
    const vendor = vendors.find(v => v.id === form.vendorId);
    onSave({
      entryDate: form.entryDate,
      inventoryId: form.inventoryId,
      acDate: form.acDate,
      vendorBillNo: form.vendorBillNo.trim(),
      partyBillDate: form.partyBillDate,
      mode: form.mode || 'Credit',
      vendorId: form.vendorId,
      vendorName: vendor?.name || form.vendorName || '',
      items: activeLines.map(line => {
        const itemId = resolveItemId(line, itemsMaster);
        const master = itemId ? itemsMaster.find(i => String(i.id) === itemId) : null;
        return {
          rowId: line.rowId,
          itemId: itemId || '',
          name: (master?.name || line.name || '').trim(),
          hsn: (master?.hsn || line.hsn || '').trim(),
          rate: line.rate !== '' ? parseFloat(line.rate) : 0,
          taxPercent: line.taxPercent !== '' ? parseFloat(line.taxPercent) : 0,
          unit: line.unit || 'Nos',
          quantity: parseFloat(line.quantity) || parseFloat(line.stock) || 0,
          stock: line.stock !== '' && line.stock != null ? parseFloat(line.stock) : (parseFloat(line.quantity) || 0),
          description: (line.description || '').trim(),
          purchaseRate: line.purchaseRate !== '' ? parseFloat(line.purchaseRate) : (parseFloat(line.rate) || 0),
          reorderLevel: line.reorderLevel !== '' ? parseFloat(line.reorderLevel) : 0,
        };
      }),
      taxableAmount: totals.taxable,
      totalTax: totals.tax,
      totalAmount: totals.total,
      note: (form.note || '').trim(),
    });
  };

  const handleQuickVendorSave = async (formData) => {
    try {
      setQuickSaving(true);
      const saved = await saveVendor({
        name: formData.name.trim(),
        address: (formData.address || '').trim(),
        city: (formData.city || '').trim(),
        pin: (formData.pin || '').trim(),
        state: (formData.state || '').trim(),
        country: formData.country || profileCountry || 'India',
        gstin: (formData.gstin || '').trim(),
        pan: (formData.pan || '').trim(),
        email: (formData.email || '').trim(),
        phone: (formData.phone || '').trim(),
        contactPerson: (formData.contactPerson || '').trim(),
        paymentTerms: (formData.paymentTerms || '').trim(),
        note: (formData.note || '').trim(),
      });
      toast('Vendor saved', 'success');
      setShowVendorModal(false);
      await onVendorsChange?.();
      handleVendorPick(saved.id);
    } catch (err) {
      toast(err?.message || 'Failed to save vendor', 'error');
    } finally {
      setQuickSaving(false);
    }
  };

  const handleQuickItemSave = async (formData) => {
    try {
      setQuickSaving(true);
      const saved = await saveItem({
        name: normalizeItemName(formData.name),
        hsn: (formData.hsn || '').trim(),
        mrp: formData.mrp != null && formData.mrp !== '' ? parseFloat(formData.mrp) || 0 : 0,
        salePrice: formData.salePrice != null && formData.salePrice !== '' ? parseFloat(formData.salePrice) || 0 : 0,
        size: (formData.size || '').trim(),
        color: (formData.color || '').trim(),
        brand: (formData.brand || '').trim(),
        category: (formData.category || '').trim(),
      });
      toast('Item saved to master', 'success');
      setShowItemModal(false);
      const row = itemModalRow;
      setItemModalRow(null);
      await onItemsChange?.();
      if (row !== null && saved?.id) {
        setForm(prev => {
          const items = [...prev.items];
          items[row] = applyVariantToLine({
            ...items[row],
            itemId: String(saved.id),
            name: saved.name || formData.name.trim(),
            hsn: saved.hsn || (formData.hsn || '').trim(),
            mrp: saved.mrp != null ? String(saved.mrp) : '',
            rate: saved.salePrice != null ? String(saved.salePrice) : items[row].rate || '',
            barcode: saved.barcode || '',
            size: saved.size || (formData.size || '').trim(),
            color: saved.color || (formData.color || '').trim(),
          }, saved.size || (formData.size || '').trim(), saved.color || (formData.color || '').trim());
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

  const totals = calcEntryTotals(form.items);

  return (
    <>
      <div className="modal-overlay inventory-entry-overlay">
        <div className="modal-content modal-shell inventory-entry-modal" style={{ maxWidth: '920px', width: '96%' }}
          role="dialog" aria-labelledby="inv-entry-title" aria-modal="true">
          <div className="modal-shell-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: 'rgba(37,99,235,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)',
              }}>
                <Package size={20} />
              </div>
              <div>
                <h3 id="inv-entry-title" className="modal-shell-title">
                  {isEditing ? 'Edit Inventory Entry' : 'New Inventory Entry'}
                </h3>
                <p className="modal-shell-subtitle">{form.inventoryId || 'Generating ID…'}</p>
              </div>
            </div>
            <button type="button" className="icon-btn" onClick={requestClose} disabled={saving}><X size={18} /></button>
          </div>

          <form className="modal-shell-body" onSubmit={handleSubmit}>
            <p className="modal-section-title">Entry details</p>
            <div className="inventory-form-grid">
              <div className="form-group">
                <label className="modal-field-label">Entry date</label>
                <input type="date" className="form-input form-input-readonly" value={form.entryDate} readOnly />
              </div>
              <div className="form-group">
                <label className="modal-field-label">Inventory ID</label>
                <input type="text" className="form-input form-input-readonly" value={form.inventoryId} readOnly />
              </div>
              <div className="form-group">
                <label className="modal-field-label">A/C date</label>
                <input type="date" className="form-input" value={form.acDate}
                  onChange={e => setField('acDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="modal-field-label">Vendor bill no. <span className="req">*</span></label>
                <input type="text" className={`form-input ${errors.vendorBillNo ? 'form-input-error' : ''}`}
                  value={form.vendorBillNo} onChange={e => setField('vendorBillNo', e.target.value)}
                  placeholder="Supplier invoice number" data-field-error="vendorBillNo" />
                {errors.vendorBillNo && <span className="field-error">{errors.vendorBillNo}</span>}
              </div>
              <div className="form-group">
                <label className="modal-field-label">Party bill date</label>
                <input type="date" className="form-input" value={form.partyBillDate}
                  onChange={e => setField('partyBillDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="modal-field-label">Mode</label>
                <select className="form-input" value={form.mode || 'Credit'}
                  onChange={e => setField('mode', e.target.value)}>
                  {MODES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group inventory-form-full" data-field-error="vendorId">
                <label className="modal-field-label">Vendor name <span className="req">*</span></label>
                <SearchableSelect
                  options={vendorOptions}
                  value={form.vendorId}
                  onChange={handleVendorPick}
                  onAddNew={() => setShowVendorModal(true)}
                  addNewLabel="Add new vendor"
                  placeholder="Search vendor…"
                  error={!!errors.vendorId}
                />
                {errors.vendorId && <span className="field-error">{errors.vendorId}</span>}
              </div>
            </div>

            <p className="modal-section-title" style={{ marginTop: '1rem' }}>Purchase products</p>
            <div style={{ marginBottom: '0.75rem', maxWidth: 400 }}>
              <BarcodeScannerInput
                onScan={handleBarcodeScan}
                placeholder="Scan barcode to add item row…"
                autoFocus={false}
              />
            </div>
            <div className="inventory-lines">
              {form.items.map((line, idx) => {
                const hasBarcode = !!(line.barcode && String(line.barcode).trim());
                const isNewVariant = line.name?.trim() && !line.itemId && (line.size || line.color);
                return (
                <div key={line.rowId} className="inventory-line-card">
                  <div className="inventory-line-head">
                    <span>Row {idx + 1}</span>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {form.items.length > 1 && (
                        <button type="button" className="icon-btn icon-btn-red" onClick={() => removeLine(idx)} title="Remove row">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="inventory-line-grid">
                    <div className="form-group inventory-form-full" data-field-error={`item_${idx}`}>
                      <label className="modal-field-label">Item name <span className="req">*</span></label>
                      <SearchableSelect
                        options={itemOptions}
                        value={line.itemId}
                        onChange={(id) => handleItemPick(idx, id)}
                        onAddNew={() => { setItemModalRow(idx); setShowItemModal(true); }}
                        addNewLabel="Add new item to master"
                        placeholder={itemOptions.length ? 'Search & select item from master…' : 'No items — add in Items Master first'}
                        fallbackLabel={line.name}
                        fallbackSublabel={[
                          line.hsn ? `HSN: ${line.hsn}` : '',
                          line.barcode ? `Barcode: ${line.barcode}` : '',
                        ].filter(Boolean).join(' · ')}
                        widePanel
                        error={!!errors[`item_${idx}`]}
                      />
                      {errors[`item_${idx}`] && <span className="field-error">{errors[`item_${idx}`]}</span>}
                    </div>

                    <div className="inventory-form-full">
                      <div className={`inv-barcode-strip ${hasBarcode ? 'inv-barcode-strip-active' : isNewVariant ? 'inv-barcode-strip-new' : ''}`}>
                        <Barcode size={16} aria-hidden />
                        {hasBarcode ? (
                          <>
                            <span className="inv-barcode-label">Barcode</span>
                            <span className="inv-barcode-value">{line.barcode}</span>
                          </>
                        ) : isNewVariant ? (
                          <span className="inv-barcode-pending">New barcode on save (daily purchase entry)</span>
                        ) : (
                          <span className="inv-barcode-pending">9-digit barcode generated when you save this entry</span>
                        )}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="modal-field-label">HSN Code</label>
                      <input type="text" className="form-input form-input-readonly" value={line.hsn} readOnly
                        placeholder={line.itemId ? '' : 'Select item first'} />
                    </div>
                    <div className="form-group">
                      <label className="modal-field-label">Size</label>
                      <input type="text" className="form-input" value={line.size}
                        onChange={e => setLine(idx, 'size', e.target.value)} placeholder="e.g. M" />
                    </div>
                    <div className="form-group">
                      <label className="modal-field-label">Color</label>
                      <input type="text" className="form-input" value={line.color}
                        onChange={e => setLine(idx, 'color', e.target.value)} placeholder="e.g. Blue" />
                    </div>
                    <div className="form-group">
                      <label className="modal-field-label">MRP</label>
                      <input type="number" className="form-input" value={line.mrp} min="0" step="0.01"
                        onChange={e => setLine(idx, 'mrp', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="modal-field-label">Sell rate</label>
                      <input type="number" className="form-input" value={line.rate} min="0" step="0.01"
                        onChange={e => setLine(idx, 'rate', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="modal-field-label">Cost / purchase rate</label>
                      <input type="number" className="form-input" value={line.purchaseRate} min="0" step="0.01"
                        onChange={e => setLine(idx, 'purchaseRate', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="modal-field-label">GST %</label>
                      <select className="form-input" value={line.taxPercent}
                        onChange={e => setLine(idx, 'taxPercent', e.target.value)}>
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="modal-field-label">Unit</label>
                      <select className="form-input" value={line.unit}
                        onChange={e => setLine(idx, 'unit', e.target.value)}>
                        {units.map(u => <option key={u.label} value={u.label}>{u.label}</option>)}
                      </select>
                    </div>
                    <div className="form-group" data-field-error={`qty_${idx}`}>
                      <label className="modal-field-label">Qty / stock <span className="req">*</span></label>
                      <input type="number" className={`form-input ${errors[`qty_${idx}`] ? 'form-input-error' : ''}`}
                        value={line.quantity} min="0" step="0.01"
                        onChange={e => setLineQty(idx, e.target.value)} />
                      {errors[`qty_${idx}`] && <span className="field-error">{errors[`qty_${idx}`]}</span>}
                    </div>
                    <div className="form-group">
                      <label className="modal-field-label">Reorder level</label>
                      <input type="number" className="form-input" value={line.reorderLevel} min="0"
                        onChange={e => setLine(idx, 'reorderLevel', e.target.value)} />
                    </div>
                    <div className="form-group inventory-form-full">
                      <label className="modal-field-label">Description</label>
                      <input type="text" className="form-input" value={line.description}
                        onChange={e => setLine(idx, 'description', e.target.value)} placeholder="Optional" />
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
            <button type="button" className="btn btn-secondary inventory-add-row" onClick={addLine}>
              <Plus size={14} /> Add product row
            </button>

            <div className="inventory-totals">
              <span>Taxable: <strong>{formatCurrency(totals.taxable, currency)}</strong></span>
              <span>Tax: <strong>{formatCurrency(totals.tax, currency)}</strong></span>
              <span>Total: <strong>{formatCurrency(totals.total, currency)}</strong></span>
            </div>

            <div className="form-group inventory-form-full" style={{ marginTop: '1rem' }}>
              <label className="modal-field-label">Note</label>
              <input type="text" className="form-input" value={form.note}
                onChange={e => setField('note', e.target.value)} placeholder="Optional note" />
            </div>
          </form>

          <div className="modal-shell-footer">
            <button type="button" className="btn btn-secondary" onClick={requestClose} disabled={saving}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving…' : (isEditing ? 'Update Entry' : 'Save Entry')}
            </button>
          </div>
        </div>
      </div>

      <VendorModal show={showVendorModal} onClose={() => setShowVendorModal(false)}
        onSave={handleQuickVendorSave} vendor={null} isEditing={false}
        defaultCountry={profileCountry} saving={quickSaving} />

      <ItemModal show={showItemModal} onClose={() => { setShowItemModal(false); setItemModalRow(null); }}
        onSave={handleQuickItemSave} item={null} isEditing={false} saving={quickSaving} />
    </>
  );
}

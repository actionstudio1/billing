import { useState, useEffect } from 'react';
import { X, Save, Package } from 'lucide-react';
import { normalizeItemName } from '../utils';
import { toast } from './Toast';

const emptyForm = {
  name: '',
  hsn: '',
  mrp: '',
  salePrice: '',
  size: '',
  color: '',
  brand: '',
  category: '',
};

export default function ItemModal({ show, onClose, onSave, item, isEditing, saving = false }) {
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    if (!show) return;
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, onClose, saving]);

  useEffect(() => {
    if (show && item) {
      setForm({
        name: normalizeItemName(item.name),
        hsn: item.hsn || '',
        mrp: item.mrp != null ? String(item.mrp) : '',
        salePrice: item.salePrice != null ? String(item.salePrice) : '',
        size: item.size || '',
        color: item.color || '',
        brand: item.brand || '',
        category: item.category || '',
      });
    } else if (show) {
      setForm({ ...emptyForm });
    }
  }, [show, item]);

  if (!show) return null;

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!form.name.trim()) {
      toast('Item name is required', 'warning');
      return;
    }
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal-content modal-shell" style={{ maxWidth: '520px', width: '94%' }}
        onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="item-modal-title">
        <div className="modal-shell-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: 'rgba(37,99,235,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)',
            }}>
              <Package size={20} />
            </div>
            <div>
              <h3 id="item-modal-title" className="modal-shell-title">
                {isEditing ? 'Edit Item' : 'Add New Item'}
              </h3>
              <p className="modal-shell-subtitle">Item details — barcode on daily purchase entry only</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close" disabled={saving}><X size={18} /></button>
        </div>

        <form className="modal-shell-body" onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label className="modal-field-label">Item name <span className="req">*</span></label>
            <input type="text" className="form-input items-master-name-input" value={form.name} autoFocus
              onChange={e => set('name', e.target.value.toUpperCase())} placeholder="e.g. BOYS BLAZER" />
          </div>

          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label className="modal-field-label">HSN Code</label>
            <input type="text" className="form-input" value={form.hsn}
              onChange={e => set('hsn', e.target.value)} placeholder="e.g. 6109" />
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', padding: '0.5rem 0.65rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            Barcode is not created here. When you add stock via <strong>Inventory → New Entry</strong>, a new 9-digit barcode is generated for that purchase line.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="modal-field-label">MRP</label>
              <input type="number" className="form-input" min="0" step="0.01" value={form.mrp}
                onChange={e => set('mrp', e.target.value)} placeholder="0.00" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="modal-field-label">Sale Price</label>
              <input type="number" className="form-input" min="0" step="0.01" value={form.salePrice}
                onChange={e => set('salePrice', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="modal-field-label">Brand</label>
              <input type="text" className="form-input" value={form.brand}
                onChange={e => set('brand', e.target.value)} placeholder="e.g. Puma, Campus" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="modal-field-label">Category</label>
              <input type="text" className="form-input" value={form.category}
                onChange={e => set('category', e.target.value)} placeholder="e.g. Shirt, Jeans" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="modal-field-label">Size</label>
              <input type="text" className="form-input" value={form.size}
                onChange={e => set('size', e.target.value)} placeholder="e.g. M, 42, 1L" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="modal-field-label">Color</label>
              <input type="text" className="form-input" value={form.color}
                onChange={e => set('color', e.target.value)} placeholder="e.g. Blue" />
            </div>
          </div>
        </form>

        <div className="modal-shell-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            <Save size={16} /> {saving ? 'Saving…' : (isEditing ? 'Update Item' : 'Save Item')}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { X, Save, Truck } from 'lucide-react';
import { getCountryConfig, getStatesForCountry, validateTaxId, detectCountryFromBrowser, getCountriesForRegion } from '../utils';
import { getRegionMode } from '../store';
import { toast } from './Toast';

export default function VendorModal({ show, onClose, onSave, vendor, isEditing, defaultCountry, saving = false }) {
  const fallbackCountry = defaultCountry || detectCountryFromBrowser();
  const emptyForm = {
    name: '', address: '', city: '', pin: '', state: '', country: fallbackCountry,
    gstin: '', pan: '', email: '', phone: '', contactPerson: '', paymentTerms: '', note: '',
  };
  const [form, setForm] = useState({ ...emptyForm });
  const [taxIdWarning, setTaxIdWarning] = useState('');

  useEffect(() => {
    if (!show) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, onClose]);

  useEffect(() => {
    if (show && vendor) {
      setForm({
        name: vendor.name || '', address: vendor.address || '', city: vendor.city || '',
        pin: vendor.pin || '', state: vendor.state || '', gstin: vendor.gstin || '',
        pan: vendor.pan || '', email: vendor.email || '', phone: vendor.phone || '',
        country: vendor.country || fallbackCountry,
        contactPerson: vendor.contactPerson || '', paymentTerms: vendor.paymentTerms || '',
        note: vendor.note || '',
      });
    } else if (show) {
      setForm({ ...emptyForm, country: fallbackCountry });
    }
    setTaxIdWarning('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, vendor]);

  if (!show) return null;

  const cc = getCountryConfig(form.country);
  const stateOptions = getStatesForCountry(form.country);
  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleTaxIdBlur = () => {
    const result = validateTaxId(form.country, form.gstin);
    setTaxIdWarning(result.ok ? '' : result.message);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!form.name.trim()) {
      toast('Vendor name is required', 'warning');
      return;
    }
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-shell"
        style={{ maxWidth: '540px', width: '94%' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="vendor-modal-title"
      >
        <div className="modal-shell-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: 'rgba(37,99,235,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)',
            }}>
              <Truck size={20} />
            </div>
            <div>
              <h3 id="vendor-modal-title" className="modal-shell-title">
                {isEditing ? 'Edit Vendor' : 'Add New Vendor'}
              </h3>
              <p className="modal-shell-subtitle">Supplier details save to your vendor directory</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className="modal-shell-body" onSubmit={handleSubmit}>
          <p className="modal-section-title">Basic details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group full-width" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">Vendor / supplier name <span className="req">*</span></label>
              <input type="text" className="form-input" value={form.name} autoFocus
                onChange={e => set('name', e.target.value)} placeholder="e.g. ABC Traders Pvt Ltd" />
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">Contact person</label>
              <input type="text" className="form-input" value={form.contactPerson}
                onChange={e => set('contactPerson', e.target.value)} placeholder="Optional" />
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">Phone</label>
              <input type="tel" className="form-input" value={form.phone}
                onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">Email</label>
              <input type="email" className="form-input" value={form.email}
                onChange={e => set('email', e.target.value)} placeholder="vendor@example.com"
                autoComplete="email" />
            </div>
          </div>

          <p className="modal-section-title">Address</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group full-width" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">Street address</label>
              <input type="text" className="form-input" value={form.address}
                onChange={e => set('address', e.target.value)} placeholder="Shop no., building, area" />
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">Country</label>
              <select className="form-input" value={form.country}
                onChange={e => setForm(prev => ({ ...prev, country: e.target.value, state: '' }))}>
                {(() => {
                  const visible = getCountriesForRegion(getRegionMode());
                  const out = [];
                  if (form.country && !visible.some(c => c.name === form.country)) {
                    out.push(<option key={form.country} value={form.country}>{form.country}</option>);
                  }
                  return out.concat(visible.map(c => <option key={c.code} value={c.name}>{c.name}</option>));
                })()}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">City</label>
              <input type="text" className="form-input" value={form.city}
                onChange={e => set('city', e.target.value)} placeholder="e.g. Mumbai" />
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">{cc.stateLabel}</label>
              {stateOptions.length > 0 ? (
                <select className="form-input" value={form.state} onChange={e => set('state', e.target.value)}>
                  <option value="">Select {cc.stateLabel}</option>
                  {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input type="text" className="form-input" value={form.state}
                  onChange={e => set('state', e.target.value)} />
              )}
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">{cc.postalLabel}</label>
              <input type="text" className="form-input" value={form.pin}
                onChange={e => set('pin', e.target.value)} placeholder="PIN / ZIP" />
            </div>
          </div>

          <p className="modal-section-title">Tax &amp; compliance</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">{cc.taxIdLabel}</label>
              <input type="text" className="form-input"
                style={taxIdWarning ? { borderColor: '#f59e0b' } : undefined}
                value={form.gstin}
                onChange={e => { set('gstin', e.target.value.toUpperCase()); if (taxIdWarning) setTaxIdWarning(''); }}
                onBlur={handleTaxIdBlur}
                placeholder={cc.taxIdPlaceholder} maxLength={20} />
              {taxIdWarning && (
                <small style={{ color: '#d97706', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>
                  ⚠ {taxIdWarning}
                </small>
              )}
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">PAN</label>
              <input type="text" className="form-input" value={form.pan}
                onChange={e => set('pan', e.target.value.toUpperCase())}
                placeholder="Optional" maxLength={10} />
            </div>
          </div>

          <p className="modal-section-title">Other</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">Payment terms</label>
              <input type="text" className="form-input" value={form.paymentTerms}
                onChange={e => set('paymentTerms', e.target.value)} placeholder="e.g. Net 30 days" />
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="modal-field-label">Notes</label>
              <input type="text" className="form-input" value={form.note}
                onChange={e => set('note', e.target.value)} placeholder="Optional internal note" />
            </div>
          </div>
        </form>

        <div className="modal-shell-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving...' : (isEditing ? 'Update Vendor' : 'Save Vendor')}
          </button>
        </div>
      </div>
    </div>
  );
}

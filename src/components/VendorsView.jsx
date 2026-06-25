import { useState, useEffect, useMemo, useCallback } from 'react';
import { getAllVendors, saveVendor, deleteVendor } from '../store';
import { toast } from './Toast';
import MasterShell, { MasterActions, MasterTable } from './master/MasterShell';

const emptyForm = {
  name: '', phone: '', address: '', city: '', state: '', gstin: '', email: '', bankDetail: '',
};

export default function VendorsView() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    try { setRows(await getAllVendors()); }
    catch (err) { toast(err?.message || 'Failed to load', 'error'); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));
    if (!q) return list;
    return list.filter(v =>
      (v.name || '').toLowerCase().includes(q) ||
      (v.gstin || '').toLowerCase().includes(q) ||
      (v.phone || '').includes(q) ||
      (v.city || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const selected = selectedId ? rows.find(r => String(r.id) === String(selectedId)) : null;
  const canSave = mode === 'new' || mode === 'edit';
  const canCancel = canSave || !!selectedId;
  const resetForm = useCallback(() => { setForm({ ...emptyForm }); setSelectedId(null); setMode(null); }, []);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toForm = (v) => ({
    name: v.name || '',
    phone: v.phone || '',
    address: v.address || '',
    city: v.city || '',
    state: v.state || '',
    gstin: v.gstin || '',
    email: v.email || '',
    bankDetail: v.bankDetail || v.paymentTerms || v.note || '',
  });

  const selectRow = (row) => { setSelectedId(row.id); setMode('edit'); setForm(toForm(row)); };

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const name = (form.name || '').trim();
    if (!name) { toast('Vendor name required', 'warning'); return; }
    const payload = {
      name,
      phone: (form.phone || '').trim(),
      address: (form.address || '').trim(),
      city: (form.city || '').trim(),
      state: (form.state || '').trim(),
      gstin: (form.gstin || '').trim().toUpperCase(),
      email: (form.email || '').trim(),
      bankDetail: (form.bankDetail || '').trim(),
      country: 'India',
    };
    try {
      setSaving(true);
      if (mode === 'new') await saveVendor(payload);
      else await saveVendor({ id: selectedId, ...payload });
      toast('Saved', 'success'); resetForm(); await load();
    } catch (err) { toast(err?.message || 'Save failed', 'error'); }
    finally { setSaving(false); }
  }, [canSave, mode, form, selectedId, resetForm]);

  const handleDelete = async () => {
    if (!selectedId) { toast('Select from list', 'warning'); return; }
    if (!confirm(`Delete "${form.name || selected?.name}"?`)) return;
    try { await deleteVendor(selectedId); toast('Deleted', 'success'); resetForm(); load(); }
    catch { toast('Delete failed', 'error'); }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F5') { e.preventDefault(); handleSave(); }
      if (e.key === 'Escape') { e.preventDefault(); resetForm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave, resetForm]);

  return (
    <MasterShell title="Vendor Master" search={search} onSearchChange={setSearch} searchPlaceholder="Search vendor, GST, mobile…">
      <div className="retail-master-form">
        <div className="retail-master-field">
          <label>Vendor Name</label>
          <input type="text" className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="retail-master-field">
          <label>Mobile Number</label>
          <input type="text" className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} inputMode="tel" />
        </div>
        <div className="retail-master-field">
          <label>City</label>
          <input type="text" className="form-input" value={form.city} onChange={e => set('city', e.target.value)} />
        </div>
        <div className="retail-master-field">
          <label>State</label>
          <input type="text" className="form-input" value={form.state} onChange={e => set('state', e.target.value)} />
        </div>
        <div className="retail-master-field">
          <label>GST Number</label>
          <input type="text" className="form-input" value={form.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} />
        </div>
        <div className="retail-master-field">
          <label>Email ID</label>
          <input type="email" className="form-input" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div className="retail-master-field retail-master-field-full">
          <label>Address</label>
          <textarea className="form-input" rows={2} value={form.address} onChange={e => set('address', e.target.value)} />
        </div>
        <div className="retail-master-field retail-master-field-full">
          <label>Bank Details</label>
          <textarea className="form-input" rows={2} value={form.bankDetail} onChange={e => set('bankDetail', e.target.value)} />
        </div>
      </div>
      <MasterActions saving={saving} canSave={canSave} canCancel={canCancel}
        onAdd={() => { setForm({ ...emptyForm }); setSelectedId(null); setMode('new'); }}
        onEdit={() => { if (!selected) toast('Select from list', 'warning'); else setMode('edit'); }}
        onDelete={handleDelete} onSave={handleSave} onCancel={resetForm} />
      <MasterTable
        columns={[
          { key: 'name', label: 'Vendor Name' },
          { key: 'phone', label: 'Mobile' },
          { key: 'city', label: 'City' },
          { key: 'gstin', label: 'GST' },
        ]}
        rows={filtered} selectedId={selectedId} onSelectRow={selectRow} emptyText="No vendors"
      />
    </MasterShell>
  );
}

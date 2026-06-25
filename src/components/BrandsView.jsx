import { useState, useEffect, useMemo, useCallback } from 'react';
import { getAllBrands, saveBrand, deleteBrand } from '../store';
import { normalizeItemName } from '../utils';
import { toast } from './Toast';
import MasterShell, { MasterActions, MasterTable } from './master/MasterShell';

const emptyForm = { name: '', status: 'Active' };

export default function BrandsView() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    try { setRows(await getAllBrands()); }
    catch (err) { toast(err?.message || 'Failed to load', 'error'); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));
    if (!q) return list;
    return list.filter(r => (r.name || '').toLowerCase().includes(q));
  }, [rows, search]);

  const selected = selectedId ? rows.find(r => String(r.id) === String(selectedId)) : null;
  const canSave = mode === 'new' || mode === 'edit';
  const canCancel = canSave || !!selectedId;
  const resetForm = useCallback(() => { setForm({ ...emptyForm }); setSelectedId(null); setMode(null); }, []);

  const selectRow = (row) => {
    setSelectedId(row.id);
    setMode('edit');
    setForm({ name: row.name || '', status: row.status || 'Active' });
  };

  const handleAddNew = () => {
    setForm({ name: '', status: 'Active' });
    setSelectedId(null);
    setMode('new');
  };

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const name = normalizeItemName(form.name);
    if (!name) { toast('Brand name required', 'warning'); return; }
    if (rows.some(r => normalizeItemName(r.name) === name && String(r.id) !== String(selectedId))) {
      toast('Duplicate brand name not allowed', 'warning');
      return;
    }
    try {
      setSaving(true);
      const payload = { name, status: form.status || 'Active', active: form.status !== 'Inactive' };
      if (mode === 'new') await saveBrand(payload);
      else await saveBrand({ id: selectedId, ...payload });
      toast('Saved', 'success');
      resetForm();
      await load();
    } catch (err) { toast(err?.message || 'Save failed', 'error'); }
    finally { setSaving(false); }
  }, [canSave, mode, form, rows, selectedId, resetForm]);

  const handleDelete = async () => {
    if (!selectedId) { toast('Select from list', 'warning'); return; }
    if (!confirm(`Delete "${form.name || selected?.name}"?`)) return;
    try { await deleteBrand(selectedId); toast('Deleted', 'success'); resetForm(); load(); }
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
    <MasterShell title="Brand Master" search={search} onSearchChange={setSearch} searchPlaceholder="Search brand…">
      <div className="retail-master-form">
        <div className="retail-master-field">
          <label>Brand Name</label>
          <input type="text" className="form-input" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value.toUpperCase() }))} />
        </div>
        <div className="retail-master-field">
          <label>Status</label>
          <select className="form-input" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>
      <MasterActions saving={saving} canSave={canSave} canCancel={canCancel}
        onAdd={handleAddNew} onEdit={() => { if (!selected) toast('Select from list', 'warning'); else setMode('edit'); }}
        onDelete={handleDelete} onSave={handleSave} onCancel={resetForm} />
      <MasterTable
        columns={[
          { key: 'name', label: 'Brand Name' },
          { key: 'status', label: 'Status', render: r => (
            <span className={r.status === 'Inactive' ? 'retail-status-inactive' : 'retail-status-active'}>
              {r.status || (r.active === false ? 'Inactive' : 'Active')}
            </span>
          ) },
        ]}
        rows={filtered} selectedId={selectedId} onSelectRow={selectRow} emptyText="No brands"
      />
    </MasterShell>
  );
}

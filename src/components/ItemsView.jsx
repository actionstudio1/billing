import { useState, useEffect, useMemo, useCallback } from 'react';
import { getAllItems, saveItem, deleteItem, syncItemMasterEverywhere } from '../store';
import { normalizeItemName } from '../utils';
import { toast } from './Toast';
import MasterShell, { MasterActions, MasterTable } from './master/MasterShell';

const emptyForm = { name: '', hsn: '', status: 'Active' };

export default function ItemsView() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const loadItems = async () => {
    try {
      setItems(await getAllItems());
    } catch (err) {
      toast(err?.message || 'Failed to load items', 'error');
    }
  };
  useEffect(() => { loadItems(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));
    if (!q) return list;
    return list.filter(i =>
      (i.name || '').toLowerCase().includes(q) ||
      (i.hsn || '').includes(q),
    );
  }, [items, search]);

  const selectedItem = selectedId ? items.find(i => String(i.id) === String(selectedId)) : null;
  const canSave = mode === 'new' || mode === 'edit';
  const canCancel = canSave || !!selectedId;
  const resetForm = useCallback(() => { setForm({ ...emptyForm }); setSelectedId(null); setMode(null); }, []);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toForm = (item) => ({
    name: item.name || '',
    hsn: (item.hsn || '').trim(),
    status: item.status || (item.active === false ? 'Inactive' : 'Active'),
  });

  const selectItem = (item) => {
    setSelectedId(item.id);
    setMode('edit');
    setForm(toForm(item));
  };

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const name = normalizeItemName(form.name);
    const hsn = (form.hsn || '').trim();
    if (!name) {
      toast('Item name required', 'warning');
      return;
    }
    if (items.some(i => normalizeItemName(i.name) === name && String(i.id) !== String(selectedId))) {
      toast('Duplicate item name', 'warning');
      return;
    }
    const statusFields = {
      status: form.status || 'Active',
      active: form.status !== 'Inactive',
    };
    try {
      setSaving(true);
      if (mode === 'new') {
        await saveItem({ name, hsn, ...statusFields });
      } else {
        const sel = selectedItem || {};
        const payload = {
          id: selectedId,
          name,
          hsn,
          ...statusFields,
          mrp: sel.mrp ?? 0,
          salePrice: sel.salePrice ?? 0,
          size: sel.size || '',
          color: sel.color || '',
          brand: sel.brand || '',
          category: sel.category || '',
          barcode: sel.barcode || '',
          purchaseRate: sel.purchaseRate ?? 0,
        };
        const saved = await saveItem(payload);
        await syncItemMasterEverywhere(saved?.id || selectedId, { name, hsn });
      }
      toast('Saved', 'success');
      resetForm();
      await loadItems();
    } catch (err) {
      toast(err?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [canSave, mode, form, items, selectedId, selectedItem, resetForm]);

  const handleDelete = async () => {
    if (!selectedId) {
      toast('List se item select karein', 'warning');
      return;
    }
    if (!confirm(`Delete "${form.name || selectedItem?.name}"?`)) return;
    try {
      await deleteItem(selectedId);
      toast('Deleted', 'success');
      resetForm();
      loadItems();
    } catch {
      toast('Delete failed', 'error');
    }
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
    <MasterShell title="Items Master" search={search} onSearchChange={setSearch} searchPlaceholder="Search item or HSN…">
      <div className="retail-master-form">
        <div className="retail-master-field">
          <label>Item Name</label>
          <input type="text" className="form-input" value={form.name}
            onChange={e => set('name', e.target.value.toUpperCase())} autoComplete="off" />
        </div>
        <div className="retail-master-field">
          <label>HSN Code</label>
          <input type="text" className="form-input" value={form.hsn}
            onChange={e => set('hsn', e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="off" />
        </div>
        <div className="retail-master-field">
          <label>Status</label>
          <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>
      <MasterActions saving={saving} canSave={canSave} canCancel={canCancel}
        onAdd={() => { setForm({ ...emptyForm }); setSelectedId(null); setMode('new'); }}
        onEdit={() => { if (!selectedItem) toast('List se select karein', 'warning'); else setMode('edit'); }}
        onDelete={handleDelete} onSave={handleSave} onCancel={resetForm} saveLabel="Save (F5)" />
      <MasterTable
        columns={[
          { key: 'name', label: 'Item Name' },
          { key: 'hsn', label: 'HSN Code' },
          { key: 'status', label: 'Status', render: r => (
            <span className={(r.status === 'Inactive' || r.active === false) ? 'retail-status-inactive' : 'retail-status-active'}>
              {r.status || (r.active === false ? 'Inactive' : 'Active')}
            </span>
          ) },
        ]}
        rows={filtered} selectedId={selectedId} onSelectRow={selectItem} emptyText="No items"
      />
    </MasterShell>
  );
}

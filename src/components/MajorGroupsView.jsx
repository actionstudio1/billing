import { useState, useEffect, useMemo, useCallback } from 'react';
import { getAllMajorGroups, saveMajorGroup, deleteMajorGroup } from '../store';
import { normalizeItemName } from '../utils';
import { toast } from './Toast';
import MasterShell, { MasterActions, MasterTable } from './master/MasterShell';

const emptyForm = { name: '' };

export default function MajorGroupsView() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    try { setRows(await getAllMajorGroups()); }
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

  const selectRow = (row) => { setSelectedId(row.id); setMode('edit'); setForm({ name: row.name || '' }); };
  const handleAddNew = () => { setForm({ ...emptyForm }); setSelectedId(null); setMode('new'); document.getElementById('major-group-name')?.focus(); };
  const handleEdit = () => {
    if (!selected) { toast('List se select karein', 'warning'); return; }
    setMode('edit'); setForm({ name: selected.name || '' });
  };

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const name = normalizeItemName(form.name);
    if (!name) { toast('Name required', 'warning'); return; }
    if (rows.some(r => normalizeItemName(r.name) === name && String(r.id) !== String(selectedId))) {
      toast('Duplicate name not allowed', 'warning'); return;
    }
    try {
      setSaving(true);
      if (mode === 'new') await saveMajorGroup({ name });
      else await saveMajorGroup({ id: selectedId, name });
      toast('Saved', 'success'); resetForm(); await load();
    } catch (err) { toast(err?.message || 'Save failed', 'error'); }
    finally { setSaving(false); }
  }, [canSave, mode, form, rows, selectedId, resetForm]);

  const handleDelete = async () => {
    if (!selectedId) { toast('List se select karein', 'warning'); return; }
    if (!confirm(`Delete "${form.name || selected?.name}"?`)) return;
    try { await deleteMajorGroup(selectedId); toast('Deleted', 'success'); resetForm(); load(); }
    catch (err) { toast(err?.message || 'Delete failed', 'error'); }
  };

  const handleReport = () => {
    const body = filtered.map(r => `<tr><td>${(r.name || '').replace(/</g, '&lt;')}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><body><h2>Major Group Master</h2><table border="1"><tr><th>name</th></tr>${body}</table></body></html>`);
    w.print();
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
    <MasterShell title="Major Group Master" search={search} onSearchChange={setSearch} searchPlaceholder="Search major group…">
      <div className="retail-master-form">
        <div className="retail-master-field retail-master-field-full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="major-group-name">Name</label>
          <input id="major-group-name" type="text" className="form-input" style={{ flex: 1, maxWidth: 480 }}
            value={form.name} onChange={e => setForm({ name: e.target.value.toUpperCase() })} autoComplete="off" />
        </div>
      </div>
      <MasterActions saving={saving} canSave={canSave} canCancel={canCancel}
        onAdd={handleAddNew} onEdit={handleEdit} onDelete={handleDelete} onSave={handleSave} onCancel={resetForm} onReport={handleReport} />
      <MasterTable columns={[{ key: 'name', label: 'name' }]} rows={filtered} selectedId={selectedId} onSelectRow={selectRow} emptyText="No major groups" />
    </MasterShell>
  );
}

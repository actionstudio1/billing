import { useState, useEffect, useMemo, useCallback } from 'react';
import { getAllSubGroups, saveSubGroup, deleteSubGroup, getAllMajorGroups } from '../store';
import { normalizeItemName } from '../utils';
import { toast } from './Toast';
import MasterShell, { MasterActions, MasterTable } from './master/MasterShell';

const emptyForm = { name: '', majorGroupId: '' };

export default function SubGroupsView() {
  const [rows, setRows] = useState([]);
  const [majorGroups, setMajorGroups] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    try {
      const [subs, majors] = await Promise.all([getAllSubGroups(), getAllMajorGroups()]);
      setRows(subs); setMajorGroups(majors);
    } catch (err) { toast(err?.message || 'Failed to load', 'error'); }
  };
  useEffect(() => { load(); }, []);

  const majorName = (id) => majorGroups.find(m => String(m.id) === String(id))?.name || '';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));
    if (!q) return list;
    return list.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.majorGroupName || majorName(r.majorGroupId)).toLowerCase().includes(q),
    );
  }, [rows, search, majorGroups]);

  const selected = selectedId ? rows.find(r => String(r.id) === String(selectedId)) : null;
  const canSave = mode === 'new' || mode === 'edit';
  const canCancel = canSave || !!selectedId;
  const resetForm = useCallback(() => { setForm({ ...emptyForm }); setSelectedId(null); setMode(null); }, []);

  const selectRow = (row) => {
    setSelectedId(row.id); setMode('edit');
    setForm({ name: row.name || '', majorGroupId: row.majorGroupId || '' });
  };

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const name = normalizeItemName(form.name);
    if (!name) { toast('Name required', 'warning'); return; }
    if (!form.majorGroupId) { toast('Major Group required', 'warning'); return; }
    if (rows.some(r => normalizeItemName(r.name) === name && String(r.majorGroupId) === String(form.majorGroupId) && String(r.id) !== String(selectedId))) {
      toast('Duplicate in this major group', 'warning'); return;
    }
    const payload = { name, majorGroupId: form.majorGroupId, majorGroupName: majorName(form.majorGroupId) };
    try {
      setSaving(true);
      if (mode === 'new') await saveSubGroup(payload);
      else await saveSubGroup({ id: selectedId, ...payload });
      toast('Saved', 'success'); resetForm(); await load();
    } catch (err) { toast(err?.message || 'Save failed', 'error'); }
    finally { setSaving(false); }
  }, [canSave, mode, form, rows, selectedId, resetForm, majorGroups]);

  const handleDelete = async () => {
    if (!selectedId) { toast('List se select karein', 'warning'); return; }
    if (!confirm(`Delete "${form.name || selected?.name}"?`)) return;
    try { await deleteSubGroup(selectedId); toast('Deleted', 'success'); resetForm(); load(); }
    catch (err) { toast(err?.message || 'Delete failed', 'error'); }
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
    <MasterShell title="Sub Group Master" search={search} onSearchChange={setSearch} searchPlaceholder="Search sub group…">
      <div className="retail-master-form">
        <div className="retail-master-field">
          <label htmlFor="sub-name">Name</label>
          <input id="sub-name" type="text" className="form-input" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value.toUpperCase() }))} />
        </div>
        <div className="retail-master-field">
          <label htmlFor="sub-major">Major Group *</label>
          <select id="sub-major" className="form-input" value={form.majorGroupId}
            onChange={e => setForm(p => ({ ...p, majorGroupId: e.target.value }))}>
            <option value="">Select…</option>
            {majorGroups.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>
      <MasterActions saving={saving} canSave={canSave} canCancel={canCancel}
        onAdd={() => { setForm({ ...emptyForm }); setSelectedId(null); setMode('new'); }}
        onEdit={() => { if (!selected) { toast('Select from list', 'warning'); return; } setMode('edit'); }}
        onDelete={handleDelete} onSave={handleSave} onCancel={resetForm}
        onReport={() => {
          const w = window.open('', '_blank');
          if (w) { w.document.write('<h2>Sub Group Master</h2>'); w.print(); }
        }} />
      <MasterTable
        columns={[
          { key: 'name', label: 'name' },
          { key: 'majorGroupName', label: 'MajorGroup', render: r => r.majorGroupName || majorName(r.majorGroupId) },
        ]}
        rows={filtered} selectedId={selectedId} onSelectRow={selectRow} emptyText="No sub groups"
      />
    </MasterShell>
  );
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { getAllStaff, saveStaff, deleteStaff } from '../store';
import { normalizeItemName } from '../utils';
import { toast } from './Toast';

const today = () => new Date().toISOString().split('T')[0];

function calcIncrementPercent(oldSal, newSal) {
  const o = parseFloat(oldSal) || 0;
  const n = parseFloat(newSal) || 0;
  if (o <= 0) return n > 0 ? '100.00' : '0.00';
  return (((n - o) / o) * 100).toFixed(2);
}

function incrementRaise(row) {
  const o = parseFloat(row.oldSalary) || 0;
  const n = parseFloat(row.newSalary) || 0;
  return Math.max(0, n - o);
}

function sumIncrementRaises(rows = []) {
  return rows.reduce((t, r) => t + incrementRaise(r), 0);
}

function resolveOldSalary(form, incrementsBefore = []) {
  if (incrementsBefore.length > 0) {
    const last = incrementsBefore[incrementsBefore.length - 1];
    const n = parseFloat(last.newSalary);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return parseFloat(form.salaryPerMonth) || 0;
}

function normalizeIncrementRow(r, idx, allRows, baseSalary) {
  let oldSalary = r.oldSalary != null && r.oldSalary !== '' ? parseFloat(r.oldSalary) : NaN;
  if (Number.isNaN(oldSalary)) {
    oldSalary = idx > 0 ? (parseFloat(allRows[idx - 1]?.newSalary) || baseSalary) : baseSalary;
  }
  let newSalary = r.newSalary != null && r.newSalary !== '' ? parseFloat(r.newSalary) : NaN;
  if (Number.isNaN(newSalary) && r.amount != null && r.amount !== '') {
    newSalary = oldSalary + (parseFloat(r.amount) || 0);
  }
  if (Number.isNaN(newSalary)) newSalary = oldSalary;
  return {
    rowId: r.rowId || `inc_${idx}`,
    date: r.date || today(),
    oldSalary: String(oldSalary),
    newSalary: r.newSalary != null && r.newSalary !== '' ? String(r.newSalary) : String(newSalary),
    percent: calcIncrementPercent(oldSalary, newSalary),
    note: r.note || '',
    locked: !!r.locked,
  };
}

function syncUnlockedIncrementOldSalaries(form) {
  const base = parseFloat(form.salaryPerMonth) || 0;
  return (form.increments || []).map((r, idx, arr) => {
    if (r.locked) return r;
    const autoOld = resolveOldSalary(form, arr.slice(0, idx));
    const oldSalary = r.oldSalary !== '' && r.oldSalary != null
      ? r.oldSalary
      : (autoOld > 0 ? String(autoOld) : '');
    return {
      ...r,
      oldSalary,
      percent: calcIncrementPercent(oldSalary, r.newSalary),
    };
  });
}

function newIncRowFromForm(form) {
  const prev = form.increments || [];
  const oldSalary = resolveOldSalary(form, prev);
  return {
    rowId: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    date: today(),
    oldSalary: oldSalary > 0 ? String(oldSalary) : '',
    newSalary: '',
    percent: '0.00',
    note: '',
    locked: false,
  };
}

const normalizeStaffCode = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');

function nextStaffIdCode(staffList = []) {
  const used = new Set(staffList.map(s => normalizeStaffCode(s.idCode)).filter(Boolean));
  let maxNum = 0;
  for (const s of staffList) {
    const code = normalizeStaffCode(s.idCode);
    const m = code.match(/^ST(\d+)$/i) || code.match(/(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  let n = Math.max(maxNum + 1, 1);
  let candidate = `ST${String(n).padStart(3, '0')}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `ST${String(n).padStart(3, '0')}`;
  }
  return candidate;
}

const emptyForm = {
  idCode: '',
  name: '',
  commissionPercent: '',
  group: '',
  shortName: '',
  salaryPerMonth: '',
  biometricId: '',
  perDay: '',
  bankDetail: '',
  opening: '',
  active: true,
  address1: '',
  address2: '',
  city: '',
  state: '',
  otherInfo: '',
  phone: '',
  referenceBy: '',
  holiday: '',
  narration: '',
  pcsWiseComm: false,
  dayTotalCommission: false,
  billAmountComm: false,
  isFloorManager: false,
  pcsWiseCommSlabName: '',
  billAmountWiseCommSlabName: '',
  increments: [],
};

const toForm = (rec = {}) => {
  const baseSalary = parseFloat(rec.salaryPerMonth) || 0;
  const rawIncrements = Array.isArray(rec.increments) ? rec.increments : [];
  return {
    idCode: rec.idCode || '',
    name: rec.name || '',
    commissionPercent: rec.commissionPercent != null && rec.commissionPercent !== '' ? String(rec.commissionPercent) : '',
    group: rec.group || '',
    shortName: rec.shortName || '',
    salaryPerMonth: rec.salaryPerMonth != null && rec.salaryPerMonth !== '' ? String(rec.salaryPerMonth) : '',
    biometricId: rec.biometricId || '',
    perDay: rec.perDay != null && rec.perDay !== '' ? String(rec.perDay) : '',
    bankDetail: rec.bankDetail || '',
    opening: rec.opening != null && rec.opening !== '' ? String(rec.opening) : '',
    active: rec.active !== false,
    address1: rec.address1 || '',
    address2: rec.address2 || '',
    city: rec.city || '',
    state: rec.state || '',
    otherInfo: rec.otherInfo || '',
    phone: rec.phone || '',
    referenceBy: rec.referenceBy || '',
    holiday: rec.holiday || '',
    narration: rec.narration || '',
    pcsWiseComm: !!rec.pcsWiseComm,
    dayTotalCommission: !!rec.dayTotalCommission,
    billAmountComm: !!rec.billAmountComm,
    isFloorManager: !!rec.isFloorManager,
    pcsWiseCommSlabName: rec.pcsWiseCommSlabName || '',
    billAmountWiseCommSlabName: rec.billAmountWiseCommSlabName || '',
    increments: rawIncrements.map((r, i) => normalizeIncrementRow(r, i, rawIncrements, baseSalary)),
  };
};

const toPayload = (form, id) => {
  const baseSalary = parseFloat(form.salaryPerMonth) || 0;
  const rawIncrements = form.increments || [];
  const increments = rawIncrements
    .filter(r => r.date || r.newSalary || r.note || r.oldSalary)
    .map((r, i) => {
      const norm = normalizeIncrementRow(r, i, rawIncrements, baseSalary);
      return {
        rowId: norm.rowId,
        date: norm.date,
        oldSalary: parseFloat(norm.oldSalary) || 0,
        newSalary: parseFloat(norm.newSalary) || 0,
        percent: parseFloat(norm.percent) || 0,
        note: norm.note,
        locked: true,
      };
    });
  const incrementTotal = sumIncrementRaises(increments);
  let salaryPerMonth = baseSalary;
  if (increments.length > 0) {
    salaryPerMonth = increments[increments.length - 1].newSalary;
  }

  return {
    ...(id ? { id } : {}),
    idCode: normalizeStaffCode(form.idCode),
    name: normalizeItemName(form.name),
    commissionPercent: parseFloat(form.commissionPercent) || 0,
    group: (form.group || '').trim().toUpperCase(),
    shortName: (form.shortName || '').trim().toUpperCase(),
    salaryPerMonth,
    biometricId: (form.biometricId || '').trim(),
    perDay: parseFloat(form.perDay) || 0,
    bankDetail: (form.bankDetail || '').trim(),
    opening: parseFloat(form.opening) || 0,
    active: !!form.active,
    address1: (form.address1 || '').trim(),
    address2: (form.address2 || '').trim(),
    city: (form.city || '').trim().toUpperCase(),
    state: (form.state || '').trim().toUpperCase(),
    otherInfo: (form.otherInfo || '').trim(),
    phone: (form.phone || '').trim(),
    referenceBy: (form.referenceBy || '').trim(),
    holiday: (form.holiday || '').trim(),
    narration: (form.narration || '').trim(),
    pcsWiseComm: !!form.pcsWiseComm,
    dayTotalCommission: !!form.dayTotalCommission,
    billAmountComm: !!form.billAmountComm,
    isFloorManager: !!form.isFloorManager,
    pcsWiseCommSlabName: (form.pcsWiseCommSlabName || '').trim(),
    billAmountWiseCommSlabName: (form.billAmountWiseCommSlabName || '').trim(),
    increments,
    incrementTotal,
  };
};

const TABLE_COLS = [
  { key: 'idCode', label: 'IdCode' },
  { key: 'name', label: 'Name' },
  { key: 'shortName', label: 'ShortName' },
  { key: 'opening', label: 'Opening' },
  { key: 'group', label: 'Group' },
  { key: 'commissionPercent', label: 'Commission' },
  { key: 'salaryPerMonth', label: 'Salary' },
  { key: 'holiday', label: 'HoliDay' },
  { key: 'biometricId', label: 'BioId' },
  { key: 'bankDetail', label: 'BankDet' },
  { key: 'address1', label: 'Add1' },
  { key: 'address2', label: 'Add2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'otherInfo', label: 'OthInf' },
  { key: 'phone', label: 'Phone' },
  { key: 'referenceBy', label: 'RefBy' },
  { key: 'isFloorManager', label: 'IsFloorManager' },
  { key: 'narration', label: 'Narration' },
  { key: 'incrementTotal', label: 'Increment' },
];

function cellValue(rec, key) {
  if (key === 'isFloorManager') return rec.isFloorManager ? 'Yes' : 'No';
  if (key === 'incrementTotal') return rec.incrementTotal != null ? rec.incrementTotal : sumIncrementRaises(rec.increments);
  if (key === 'bankDetail' || key === 'narration') {
    const v = rec[key] || '';
    return v.length > 28 ? `${v.slice(0, 28)}…` : v;
  }
  const v = rec[key];
  return v == null ? '' : v;
}

export default function StaffView() {
  const [staffList, setStaffList] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadStaff = async () => {
    try {
      setStaffList(await getAllStaff());
    } catch (err) {
      toast(err?.message || 'Failed to load staff', 'error');
    }
  };

  useEffect(() => { loadStaff(); }, []);

  const sorted = useMemo(
    () => [...staffList].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' })),
    [staffList],
  );

  const selected = selectedId ? staffList.find(s => String(s.id) === String(selectedId)) : null;
  const canSave = mode === 'new' || mode === 'edit';
  const canCancel = canSave || !!selectedId;
  const incrementRunning = sumIncrementRaises(form.increments);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const resetForm = useCallback(() => {
    setForm({ ...emptyForm, increments: [] });
    setSelectedId(null);
    setMode(null);
  }, []);

  const selectStaff = (rec) => {
    setSelectedId(rec.id);
    setMode('edit');
    setForm(toForm(rec));
  };

  const handleAddNew = () => {
    setForm({ ...emptyForm, increments: [], idCode: nextStaffIdCode(staffList) });
    setSelectedId(null);
    setMode('new');
    document.getElementById('staff-name')?.focus();
  };

  const handleEdit = () => {
    if (!selectedId || !selected) {
      toast('List se staff select karein', 'warning');
      return;
    }
    setMode('edit');
    setForm(toForm(selected));
    document.getElementById('staff-name')?.focus();
  };

  const addIncrementRow = () => {
    if (!parseFloat(form.salaryPerMonth) && !(form.increments || []).some(r => r.locked)) {
      toast('Pehle Salary Per Month likhein — Old Salary auto aayegi', 'warning');
    }
    setForm(prev => {
      const next = { ...prev, increments: [...(prev.increments || []), newIncRowFromForm(prev)] };
      return { ...next, increments: syncUnlockedIncrementOldSalaries(next) };
    });
    if (!mode) setMode('edit');
  };

  const setIncrement = (rowId, field, value) => {
    setForm(prev => ({
      ...prev,
      increments: (prev.increments || []).map(r => {
        if (r.rowId !== rowId || r.locked) return r;
        const next = { ...r, [field]: value };
        if (field === 'oldSalary' || field === 'newSalary') {
          next.percent = calcIncrementPercent(next.oldSalary, next.newSalary);
        }
        return next;
      }),
    }));
  };

  const handleSalaryChange = (value) => {
    setForm(prev => syncUnlockedIncrementOldSalaries({ ...prev, salaryPerMonth: value }));
  };

  const handleSave = useCallback(async () => {
    if (mode !== 'new' && mode !== 'edit') return;
    if (!normalizeItemName(form.name)) {
      toast('Salesman name required', 'warning');
      return;
    }
    const others = staffList.filter(s => String(s.id) !== String(selectedId));
    let idCode;
    if (mode === 'edit') {
      const sel = staffList.find(s => String(s.id) === String(selectedId));
      idCode = normalizeStaffCode(form.idCode) || normalizeStaffCode(sel?.idCode);
      if (!idCode) idCode = nextStaffIdCode(others);
    } else {
      idCode = nextStaffIdCode(staffList);
    }
    const shortName = normalizeStaffCode(form.shortName);
    if (!shortName) {
      toast('Short Name required', 'warning');
      return;
    }
    const pendingInc = (form.increments || []).filter(r => !r.locked);
    for (const r of pendingInc) {
      if (!parseFloat(r.newSalary)) {
        toast('Nayi increment row mein New Salary zaroori hai', 'warning');
        return;
      }
    }
    const payload = toPayload({ ...form, idCode, shortName }, mode === 'edit' ? selectedId : undefined);

    if (staffList.some(s => normalizeStaffCode(s.idCode) === payload.idCode && String(s.id) !== String(selectedId))) {
      toast('Yeh ID Code pehle se use ho raha hai', 'warning');
      return;
    }
    if (staffList.some(s => normalizeStaffCode(s.shortName) === payload.shortName && String(s.id) !== String(selectedId))) {
      toast('Yeh Short Name pehle se hai — unique hona chahiye', 'warning');
      return;
    }
    if (staffList.some(s => normalizeItemName(s.name) === payload.name && String(s.id) !== String(selectedId))) {
      toast('Yeh naam pehle se hai', 'warning');
      return;
    }

    try {
      setSaving(true);
      await saveStaff(payload);
      toast(mode === 'new' ? 'Staff added' : 'Staff updated', 'success');
      resetForm();
      await loadStaff();
    } catch (err) {
      toast(err?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [mode, form, staffList, selectedId, resetForm]);

  const handleDelete = async () => {
    if (!selectedId) {
      toast('List se staff select karein', 'warning');
      return;
    }
    const incs = selected?.increments || [];
    if (incs.length > 0) {
      toast('Increment saved hai — staff delete nahi ho sakta', 'warning');
      return;
    }
    if (!confirm(`Delete "${form.name || selected?.name}"?`)) return;
    try {
      await deleteStaff(selectedId);
      toast('Deleted', 'success');
      resetForm();
      loadStaff();
    } catch {
      toast('Delete failed', 'error');
    }
  };

  const handleReport = () => {
    const rows = sorted.map(s => TABLE_COLS.map(c => `<td>${String(cellValue(s, c.key)).replace(/</g, '&lt;')}</td>`).join('')).map(cells => `<tr>${cells}</tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Employee Master</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;font-size:11px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #888;padding:4px 6px}th{background:#4d8d90;color:#fff}</style></head>
      <body><h2>Employee Master</h2><table><thead><tr>${TABLE_COLS.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast('Allow popups for report', 'warning'); return; }
    w.document.write(html);
    w.document.close();
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
    <div className="staff-emp-page">
      <div className="staff-emp-shell">
        <div className="staff-emp-form">
          <div className="staff-emp-line">
            <span className="staff-emp-lbl">ID Code <span className="staff-emp-auto-tag">(Auto)</span> :</span>
            <input
              className="staff-emp-inp staff-emp-idcode"
              value={canSave ? (form.idCode || '…') : ''}
              readOnly
              tabIndex={-1}
              title="System auto-generates unique code — ST001, ST002…"
            />
            <span className="staff-emp-lbl">Salesman Name :</span>
            <input id="staff-name" className="staff-emp-inp staff-emp-inp-wide" value={form.name}
              onChange={e => set('name', e.target.value.toUpperCase())} />
            <span className="staff-emp-lbl">Commission On Sales :</span>
            <input className="staff-emp-inp staff-emp-inp-num" type="number" min="0" step="0.01"
              value={form.commissionPercent} onChange={e => set('commissionPercent', e.target.value)} />
            <span className="staff-emp-pct">%</span>
          </div>

          <div className="staff-emp-line">
            <span className="staff-emp-lbl">Group :</span>
            <input className="staff-emp-inp" value={form.group} onChange={e => set('group', e.target.value.toUpperCase())} />
            <span className="staff-emp-lbl">Short Name :</span>
            <input
              className="staff-emp-inp staff-emp-shortname"
              value={form.shortName}
              onChange={e => set('shortName', e.target.value.toUpperCase().replace(/\s/g, ''))}
              placeholder="Unique — e.g. DK"
              title="Har staff ka Short Name alag hona chahiye"
            />
            <span className="staff-emp-lbl">Salary Per Month :</span>
            <input className="staff-emp-inp staff-emp-inp-num" type="number" min="0" step="0.01"
              value={form.salaryPerMonth} onChange={e => handleSalaryChange(e.target.value)} />
            <span className="staff-emp-lbl">BioMetric ID :</span>
            <input className="staff-emp-inp" value={form.biometricId} onChange={e => set('biometricId', e.target.value)} />
            <span className="staff-emp-lbl">Per Day :</span>
            <input className="staff-emp-inp staff-emp-inp-num" type="number" min="0" step="0.01"
              value={form.perDay} onChange={e => set('perDay', e.target.value)} />
          </div>

          <div className="staff-emp-line staff-emp-line-top">
            <span className="staff-emp-lbl">Bank Detail :</span>
            <textarea className="staff-emp-ta" rows={2} value={form.bankDetail}
              onChange={e => set('bankDetail', e.target.value)} />
          </div>

          <div className="staff-emp-line">
            <span className="staff-emp-lbl staff-emp-lbl-red">Opening :</span>
            <input className="staff-emp-inp staff-emp-inp-num staff-emp-inp-red" type="number" step="0.01"
              value={form.opening} onChange={e => set('opening', e.target.value)} />
            <label className="staff-emp-chk"><input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} /> Active</label>
            <span className="staff-emp-lbl">Status</span>
          </div>

          <div className="staff-emp-addr-grid">
            {[
              ['address1', 'Address Line 1 :'], ['address2', 'Address Line 2 :'],
              ['city', 'City :'], ['state', 'State :'],
              ['otherInfo', 'Other Information :'], ['phone', 'Phone No :'],
              ['referenceBy', 'Reference By :'], ['holiday', 'Holiday :'],
            ].map(([key, lbl]) => (
              <div key={key} className="staff-emp-addr-cell">
                <span className="staff-emp-lbl">{lbl}</span>
                <input className="staff-emp-inp" value={form[key]}
                  onChange={e => set(key, ['city', 'state'].includes(key) ? e.target.value.toUpperCase() : e.target.value)} />
              </div>
            ))}
          </div>

          <div className="staff-emp-line staff-emp-line-top">
            <span className="staff-emp-lbl">Narration :</span>
            <textarea className="staff-emp-ta" rows={2} value={form.narration}
              onChange={e => set('narration', e.target.value)} placeholder="Staff notes / remarks…" />
          </div>

          <div className="staff-emp-inc-block">
            <div className="staff-emp-inc-head">
              <span className="staff-emp-lbl">Increment :</span>
              <button type="button" className="staff-emp-plus-btn" onClick={addIncrementRow} title="Add increment row">
                <Plus size={18} />
              </button>
              <span className="staff-emp-inc-total">Total Raise : ₹{incrementRunning.toFixed(2)}</span>
            </div>
            {(form.increments || []).length > 0 && (
              <table className="staff-emp-inc-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Old Salary</th>
                    <th>New Salary</th>
                    <th>%</th>
                    <th>Narration</th>
                  </tr>
                </thead>
                <tbody>
                  {form.increments.map(row => (
                    <tr key={row.rowId} className={row.locked ? 'staff-inc-locked' : ''}>
                      <td>
                        <input type="date" className="staff-emp-inp" value={row.date} readOnly={row.locked}
                          onChange={e => setIncrement(row.rowId, 'date', e.target.value)} />
                      </td>
                      <td>
                        <input
                          type="number"
                          className={`staff-emp-inp staff-emp-inp-num${row.locked ? ' staff-emp-readonly' : ''}`}
                          min="0"
                          step="0.01"
                          value={row.oldSalary}
                          readOnly={row.locked}
                          onChange={e => setIncrement(row.rowId, 'oldSalary', e.target.value)}
                          placeholder="Old salary"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="staff-emp-inp staff-emp-inp-num"
                          min="0"
                          step="0.01"
                          value={row.newSalary}
                          readOnly={row.locked}
                          onChange={e => setIncrement(row.rowId, 'newSalary', e.target.value)}
                          placeholder="New salary"
                        />
                      </td>
                      <td>
                        <input className="staff-emp-inp staff-emp-inp-num staff-emp-readonly" value={row.percent || '0.00'} readOnly tabIndex={-1} />
                      </td>
                      <td>
                        <input
                          className="staff-emp-inp staff-emp-inc-note"
                          value={row.note}
                          readOnly={row.locked}
                          onChange={e => setIncrement(row.rowId, 'note', e.target.value)}
                          placeholder="Narration"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(form.increments || []).length === 0 && (
              <p className="staff-emp-inc-hint">+ dabayein — Old Salary auto, New Salary &amp; % khud calculate hoga. Entry delete nahi hoti.</p>
            )}
          </div>

          <div className="staff-emp-chk-row">
            <label className="staff-emp-chk"><input type="checkbox" checked={form.pcsWiseComm} onChange={e => set('pcsWiseComm', e.target.checked)} /> Pcs Wise Comm</label>
            <label className="staff-emp-chk"><input type="checkbox" checked={form.dayTotalCommission} onChange={e => set('dayTotalCommission', e.target.checked)} /> Day Total Commission</label>
            <label className="staff-emp-chk"><input type="checkbox" checked={form.billAmountComm} onChange={e => set('billAmountComm', e.target.checked)} /> Bill Amount Comm.</label>
            <label className="staff-emp-chk"><input type="checkbox" checked={form.isFloorManager} onChange={e => set('isFloorManager', e.target.checked)} /> Floor Manager</label>
          </div>

          <div className="staff-emp-line">
            <span className="staff-emp-lbl">Pcs Wise Slab :</span>
            <input className="staff-emp-inp staff-emp-inp-wide" value={form.pcsWiseCommSlabName}
              onChange={e => set('pcsWiseCommSlabName', e.target.value)} />
            <span className="staff-emp-lbl">Bill Amount Slab :</span>
            <input className="staff-emp-inp staff-emp-inp-wide" value={form.billAmountWiseCommSlabName}
              onChange={e => set('billAmountWiseCommSlabName', e.target.value)} />
          </div>
        </div>

        <div className="staff-emp-btns">
          <button type="button" className="staff-emp-btn staff-emp-btn-add" onClick={handleAddNew} disabled={saving}>Add New</button>
          <button type="button" className="staff-emp-btn staff-emp-btn-edit" onClick={handleEdit} disabled={saving}>Edit</button>
          <button type="button" className="staff-emp-btn staff-emp-btn-delete" onClick={handleDelete} disabled={saving}>Delete</button>
          <button type="button" className="staff-emp-btn staff-emp-btn-save" onClick={handleSave} disabled={saving || !canSave}>Save (F5)</button>
          <button type="button" className="staff-emp-btn staff-emp-btn-dim" onClick={resetForm} disabled={saving || !canCancel}>Cancel (Esc)</button>
          <button type="button" className="staff-emp-btn staff-emp-btn-report" onClick={handleReport}>Show Report</button>
        </div>

        <div className="staff-emp-grid-wrap">
          <table className="staff-emp-grid">
            <thead>
              <tr>{TABLE_COLS.map(c => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={TABLE_COLS.length} className="staff-emp-empty">No staff</td></tr>
              ) : sorted.map((s, idx) => (
                <tr
                  key={s.id}
                  className={[idx % 2 ? 'staff-emp-zebra' : '', String(selectedId) === String(s.id) ? 'staff-emp-selected' : ''].filter(Boolean).join(' ')}
                  onClick={() => selectStaff(s)}
                >
                  {TABLE_COLS.map(c => (
                    <td key={c.key} title={String(s[c.key] ?? '')}>{cellValue(s, c.key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

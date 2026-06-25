import { Search, X } from 'lucide-react';
import { canMaster } from '../../utils/masterPermissions';

export function MasterSearch({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="retail-master-search">
      <Search size={16} className="retail-master-search-icon" />
      <input
        type="text"
        className="form-input retail-master-search-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {value ? (
        <button type="button" className="retail-master-search-clear" onClick={() => onChange('')} aria-label="Clear">
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function MasterActions({
  saving = false,
  canSave = false,
  canCancel = false,
  onAdd,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onReport,
  onPrint,
  saveLabel = 'Save (F5)',
}) {
  return (
    <div className="retail-master-actions">
      {canMaster('add') && (
        <button type="button" className="retail-btn retail-btn-add" onClick={onAdd} disabled={saving}>Add New</button>
      )}
      {canMaster('edit') && (
        <button type="button" className="retail-btn retail-btn-edit" onClick={onEdit} disabled={saving}>Edit</button>
      )}
      {canMaster('delete') && (
        <button type="button" className="retail-btn retail-btn-delete" onClick={onDelete} disabled={saving}>Delete</button>
      )}
      {canMaster('save') && (
        <button type="button" className="retail-btn retail-btn-save" onClick={onSave} disabled={saving || !canSave}>{saveLabel}</button>
      )}
      <button type="button" className="retail-btn retail-btn-muted" onClick={onCancel} disabled={saving || !canCancel}>Cancel (Esc)</button>
      {onReport && <button type="button" className="retail-btn retail-btn-muted" onClick={onReport}>Show Report</button>}
      {onPrint && canMaster('print') && (
        <button type="button" className="retail-btn retail-btn-print" onClick={onPrint}>Print</button>
      )}
    </div>
  );
}

export function MasterTable({ columns, rows, selectedId, onSelectRow, emptyText = 'No records' }) {
  return (
    <div className="retail-master-list">
      <table className="retail-master-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="retail-master-empty">{emptyText}</td>
            </tr>
          ) : rows.map((row, idx) => (
            <tr
              key={row.id}
              className={[
                idx % 2 === 1 ? 'retail-master-zebra' : '',
                String(selectedId) === String(row.id) ? 'selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelectRow?.(row)}
            >
              {columns.map(col => (
                <td key={col.key}>{col.render ? col.render(row) : (row[col.key] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MasterShell({ title, search, onSearchChange, searchPlaceholder, children }) {
  return (
    <div className="dashboard-container retail-master-page">
      <div className="retail-master-header">
        <h1 className="retail-master-title">{title}</h1>
        {onSearchChange && (
          <MasterSearch value={search || ''} onChange={onSearchChange} placeholder={searchPlaceholder} />
        )}
      </div>
      <div className="retail-master-panel">{children}</div>
    </div>
  );
}

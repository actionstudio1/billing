import { useState, useCallback } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Package } from 'lucide-react';
import { getAllItems, getAllProducts, saveProduct } from '../store';
import { resolveBarcodeLookup } from '../lib/barcode';
import BarcodeScannerInput from './BarcodeScannerInput';
import { toast } from './Toast';

const MODES = [
  { id: 'in', label: 'Stock In', icon: ArrowDownToLine, color: '#15803d' },
  { id: 'out', label: 'Stock Out', icon: ArrowUpFromLine, color: '#dc2626' },
  { id: 'count', label: 'Inventory Count', icon: ClipboardCheck, color: '#1d4ed8' },
];

export default function StockOperations({ products: initialProducts = [], itemsMaster = [], onStockChange }) {
  const [mode, setMode] = useState('in');
  const [qty, setQty] = useState('1');
  const [lastScan, setLastScan] = useState(null);
  const [countSession, setCountSession] = useState([]);
  const [processing, setProcessing] = useState(false);

  const refreshProducts = useCallback(async () => {
    if (onStockChange) await onStockChange();
    return getAllProducts();
  }, [onStockChange]);

  const handleScan = async (barcode) => {
    if (processing) return;
    setProcessing(true);
    try {
      const items = itemsMaster.length ? itemsMaster : await getAllItems();
      const products = initialProducts.length ? initialProducts : await getAllProducts();
      const { item, product } = resolveBarcodeLookup(barcode, items, products);

      if (!item && !product) {
        toast(`No item found for barcode: ${barcode}`, 'warning');
        return;
      }

      const name = item?.name || product?.name || 'Unknown';
      const parsedQty = Math.max(1, parseFloat(qty) || 1);

      if (mode === 'count') {
        const systemStock = product ? (parseFloat(product.stock) || 0) : 0;
        const existing = countSession.find(c => c.barcode === barcode);
        if (existing) {
          setCountSession(prev => prev.map(c =>
            c.barcode === barcode
              ? { ...c, counted: c.counted + parsedQty }
              : c
          ));
        } else {
          setCountSession(prev => [...prev, {
            barcode,
            name,
            productId: product?.id,
            systemStock,
            counted: parsedQty,
          }]);
        }
        setLastScan({ name, barcode, action: 'counted', qty: parsedQty });
        toast(`Counted: ${name} (+${parsedQty})`, 'success');
        return;
      }

      if (!product) {
        toast(`"${name}" found in Items Master but has no stock record. Create an inventory entry first.`, 'warning');
        return;
      }

      const currentStock = parseFloat(product.stock) || 0;
      let newStock = currentStock;

      if (mode === 'in') {
        newStock = currentStock + parsedQty;
        await saveProduct({ ...product, stock: newStock });
        setLastScan({ name, barcode, action: 'in', qty: parsedQty, newStock });
        toast(`Stock In: ${name} +${parsedQty} (now ${newStock})`, 'success');
      } else {
        if (currentStock < parsedQty) {
          toast(`Insufficient stock for ${name}. Available: ${currentStock}`, 'warning');
          return;
        }
        newStock = currentStock - parsedQty;
        await saveProduct({ ...product, stock: newStock });
        setLastScan({ name, barcode, action: 'out', qty: parsedQty, newStock });
        toast(`Stock Out: ${name} -${parsedQty} (now ${newStock})`, 'success');
      }

      await refreshProducts();
    } catch (err) {
      toast(err?.message || 'Barcode operation failed', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const clearCount = () => setCountSession([]);

  return (
    <div className="stock-ops-panel">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        {MODES.map(m => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              className={`type-chip ${mode === m.id ? 'type-chip-active' : ''}`}
              onClick={() => setMode(m.id)}
            >
              <Icon size={14} style={{ marginRight: 4, verticalAlign: -2, color: mode === m.id ? m.color : undefined }} />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="glass-panel p-4" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {mode !== 'count' && (
            <div className="form-group" style={{ margin: 0, width: 100 }}>
              <label className="form-label">Qty</label>
              <input
                type="number"
                className="form-input"
                min="1"
                step="1"
                value={qty}
                onChange={e => setQty(e.target.value)}
              />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 220 }}>
            <BarcodeScannerInput
              onScan={handleScan}
              disabled={processing}
              placeholder={mode === 'count' ? 'Scan item to count…' : `Scan barcode for Stock ${mode === 'in' ? 'In' : 'Out'}…`}
              label="Barcode Scanner"
            />
          </div>
        </div>

        {lastScan && mode !== 'count' && (
          <div className="barcode-last-scan" style={{ marginTop: '0.75rem' }}>
            <Package size={16} />
            <span>
              <strong>{lastScan.name}</strong>
              {' — '}
              {lastScan.action === 'in' ? '+' : '-'}{lastScan.qty}
              {' (stock: '}{lastScan.newStock}{')'}
            </span>
          </div>
        )}
      </div>

      {mode === 'count' && (
        <div className="glass-panel" style={{ marginTop: '1rem' }}>
          <div className="table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Count Session ({countSession.length})</h3>
            {countSession.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={clearCount}>Clear</button>
            )}
          </div>
          {countSession.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <ClipboardCheck size={40} />
              <p>Scan barcodes to start physical inventory count.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Barcode</th>
                    <th>System</th>
                    <th>Counted</th>
                    <th>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {countSession.map(row => {
                    const variance = row.counted - row.systemStock;
                    return (
                      <tr key={row.barcode}>
                        <td className="font-medium">{row.name}</td>
                        <td className="text-muted">{row.barcode}</td>
                        <td>{row.systemStock}</td>
                        <td className="font-bold">{row.counted}</td>
                        <td style={{
                          color: variance === 0 ? 'inherit' : variance > 0 ? '#15803d' : '#dc2626',
                          fontWeight: 600,
                        }}>
                          {variance > 0 ? `+${variance}` : variance}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

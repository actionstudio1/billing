import { useState, useEffect, useMemo } from 'react';
import {
  ShoppingCart, Package, Clock, Ruler, Tag, Layers, AlertTriangle, Skull,
  BarChart3, Search, X,
} from 'lucide-react';
import {
  getAllInventoryEntries, getAllProducts, getAllItems, getAllBills, getAllVendors, getProfile,
} from '../store';
import { formatCurrency, getCountryConfig } from '../utils';
import {
  buildPurchaseReport,
  buildCurrentStockReport,
  buildStockAgeingReport,
  buildSizeWiseStockReport,
  buildBrandWiseStockReport,
  buildCategoryWiseStockReport,
  buildLowStockReport,
  buildDeadStockReport,
  getRetailDashboardSummary,
} from '../lib/stockReports';
import { toast } from './Toast';

const TABS = [
  { id: 'summary', label: 'Summary', icon: BarChart3 },
  { id: 'purchase', label: 'Purchase Report', icon: ShoppingCart },
  { id: 'stock', label: 'Current Stock', icon: Package },
  { id: 'ageing', label: 'Stock Ageing', icon: Clock },
  { id: 'size', label: 'Size-wise', icon: Ruler },
  { id: 'brand', label: 'Brand-wise', icon: Tag },
  { id: 'category', label: 'Category-wise', icon: Layers },
  { id: 'low', label: 'Low Stock', icon: AlertTriangle },
  { id: 'dead', label: 'Dead Stock', icon: Skull },
];

export default function StockReportsView() {
  const [tab, setTab] = useState('summary');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [bills, setBills] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [currency, setCurrency] = useState('INR');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [ents, prods, itms, bls, vens, profile] = await Promise.all([
          getAllInventoryEntries(),
          getAllProducts(),
          getAllItems(),
          getAllBills(),
          getAllVendors(),
          getProfile(),
        ]);
        setEntries(ents);
        setProducts(prods);
        setItems(itms);
        setBills(bls);
        setVendors(vens);
        if (profile?.country) setCurrency(getCountryConfig(profile.country).currency);
      } catch {
        toast('Failed to load stock report data', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const summary = useMemo(
    () => getRetailDashboardSummary({ entries, products, items, bills }),
    [entries, products, items, bills],
  );

  const stockRows = useMemo(
    () => buildCurrentStockReport(products, items, entries, bills),
    [products, items, entries, bills],
  );

  const purchaseRows = useMemo(
    () => buildPurchaseReport(entries, vendors),
    [entries, vendors],
  );

  const ageing = useMemo(
    () => buildStockAgeingReport(products, items, bills),
    [products, items, bills],
  );

  const sizeRows = useMemo(() => buildSizeWiseStockReport(stockRows), [stockRows]);
  const brandRows = useMemo(() => buildBrandWiseStockReport(stockRows), [stockRows]);
  const categoryRows = useMemo(() => buildCategoryWiseStockReport(stockRows), [stockRows]);
  const lowRows = useMemo(() => buildLowStockReport(products, items), [products, items]);
  const deadRows = useMemo(() => buildDeadStockReport(products, items, bills), [products, items, bills]);

  const q = search.trim().toLowerCase();
  const match = (text) => !q || String(text || '').toLowerCase().includes(q);

  if (loading) {
    return <div className="empty-state" style={{ padding: '3rem' }}><Package size={40} /><p>Loading stock reports…</p></div>;
  }

  return (
    <div>
      <div className="stats-grid stats-grid-4" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-icon stat-icon-blue"><ShoppingCart size={20} /></div>
          <div><p className="stat-label">Total Purchase</p><h2 className="stat-value" style={{ fontSize: '1.15rem' }}>{formatCurrency(summary.totalPurchase, currency)}</h2></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-green"><Package size={20} /></div>
          <div><p className="stat-label">Total Stock Qty</p><h2 className="stat-value stat-value-green">{summary.totalStockQty}</h2></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-purple"><BarChart3 size={20} /></div>
          <div><p className="stat-label">Stock Value</p><h2 className="stat-value stat-value-purple" style={{ fontSize: '1.15rem' }}>{formatCurrency(summary.stockValue, currency)}</h2></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-amber"><AlertTriangle size={20} /></div>
          <div>
            <p className="stat-label">Low / Dead Stock</p>
            <h2 className="stat-value stat-value-amber" style={{ fontSize: '1rem' }}>
              {summary.lowStockCount} low · {summary.deadStockCount} dead
            </h2>
          </div>
        </div>
      </div>

      <div className="glass-panel p-4 mb-4">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button"
                className={`type-chip ${tab === t.id ? 'type-chip-active' : ''}`}
                onClick={() => setTab(t.id)}>
                <Icon size={13} style={{ marginRight: 4, verticalAlign: -2 }} />{t.label}
              </button>
            );
          })}
        </div>
        {tab !== 'summary' && tab !== 'ageing' && (
          <div className="search-box" style={{ maxWidth: 320 }}>
            <Search size={16} className="search-icon" />
            <input type="text" className="search-input" placeholder="Search…" value={search}
              onChange={e => setSearch(e.target.value)} />
            {search && <button type="button" className="icon-btn" onClick={() => setSearch('')}><X size={14} /></button>}
          </div>
        )}
      </div>

      {tab === 'summary' && (
        <div className="glass-panel p-4">
          <h3 className="section-title" style={{ marginTop: 0 }}>Retail flow</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <strong>Purchase Entry</strong> → stock update → <strong>Sale (Invoice)</strong> → stock deduct →
            reports auto-update from live data. No separate tables needed — inventory entries, products &amp; bills drive all reports.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
            <div className="stat-card" style={{ margin: 0 }}><p className="stat-label">Inventory entries</p><h3 className="stat-value">{entries.length}</h3></div>
            <div className="stat-card" style={{ margin: 0 }}><p className="stat-label">Products in stock</p><h3 className="stat-value">{products.filter(p => (p.stock || 0) > 0).length}</h3></div>
            <div className="stat-card" style={{ margin: 0 }}><p className="stat-label">Items master</p><h3 className="stat-value">{items.length}</h3></div>
            <div className="stat-card" style={{ margin: 0 }}><p className="stat-label">Sales invoices</p><h3 className="stat-value">{bills.length}</h3></div>
          </div>
        </div>
      )}

      {tab === 'purchase' && (
        <ReportTable
          title={`Purchase Report (${purchaseRows.filter(r => match(r.itemName) || match(r.vendorName)).length})`}
          headers={['Date', 'Vendor', 'Bill No', 'Item', 'Qty', 'Rate', 'MRP', 'Amount', 'GST', 'Bill Total']}
          rows={purchaseRows.filter(r => match(r.itemName) || match(r.vendorName) || match(r.billNo)).map(r => [
            r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString('en-IN') : '-',
            r.vendorName, r.billNo, r.itemName, r.qty,
            formatCurrency(r.purchaseRate, currency),
            r.mrp ? formatCurrency(r.mrp, currency) : '-',
            formatCurrency(r.amount, currency),
            formatCurrency(r.gst, currency),
            formatCurrency(r.totalBillAmount, currency),
          ])}
        />
      )}

      {tab === 'stock' && (
        <ReportTable
          title={`Current Stock (${stockRows.filter(r => match(r.itemName) || match(r.barcode)).length})`}
          headers={['Item', 'Barcode', 'Size', 'Color', 'Brand', 'Opening', 'Purchased', 'Sold', 'Current', 'Value']}
          rows={stockRows.filter(r => match(r.itemName) || match(r.barcode) || match(r.brand)).map(r => [
            r.itemName,
            r.barcode || '-',
            r.size || '-',
            r.color || '-',
            r.brand,
            r.openingStock,
            r.purchaseQty,
            r.soldQty,
            r.currentStock,
            formatCurrency(r.stockValue, currency),
          ])}
        />
      )}

      {tab === 'ageing' && (
        <div className="glass-panel">
          <div className="table-header"><h3>Stock Ageing</h3></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Bucket</th><th>Qty in Stock</th><th>Value</th><th>Sample Items</th></tr></thead>
              <tbody>
                {ageing.map(b => (
                  <tr key={b.label}>
                    <td className="font-medium">{b.label}</td>
                    <td>{b.qty}</td>
                    <td>{formatCurrency(b.value, currency)}</td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                      {b.items.slice(0, 4).map(i => `${i.name}${i.size ? ` (${i.size})` : ''}: ${i.stock}`).join(' · ')}
                      {b.items.length > 4 ? ` +${b.items.length - 4} more` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'size' && (
        <ReportTable
          title="Size-wise Stock"
          headers={['Item', 'Size', 'Stock']}
          rows={sizeRows.filter(r => match(r.item)).map(r => [r.item, r.size, r.stock])}
        />
      )}

      {tab === 'brand' && (
        <ReportTable
          title="Brand-wise Stock"
          headers={['Brand', 'Total Stock']}
          rows={brandRows.filter(r => match(r.brand)).map(r => [r.brand, r.stock])}
        />
      )}

      {tab === 'category' && (
        <ReportTable
          title="Category-wise Stock"
          headers={['Category', 'Total Stock']}
          rows={categoryRows.filter(r => match(r.category)).map(r => [r.category, r.stock])}
        />
      )}

      {tab === 'low' && (
        <ReportTable
          title={`Low Stock Alert — Reorder Required (${lowRows.length})`}
          headers={['Item', 'Barcode', 'Size', 'Stock', 'Reorder at']}
          rows={lowRows.filter(r => match(r.itemName)).map(r => [
            r.itemName, r.barcode || '-', r.size || '-',
            <span key="s" style={{ color: r.currentStock <= 0 ? '#dc2626' : '#d97706', fontWeight: 700 }}>{r.currentStock}</span>,
            r.reorderLevel,
          ])}
          emptyText="No low stock items — all good!"
        />
      )}

      {tab === 'dead' && (
        <ReportTable
          title={`Dead Stock — No sale in 90+ days (${deadRows.length})`}
          headers={['Item', 'Barcode', 'Stock', 'Value', 'Last Sale', 'Days idle']}
          rows={deadRows.filter(r => match(r.itemName)).map(r => [
            r.itemName, r.barcode || '-', r.currentStock,
            formatCurrency(r.stockValue, currency),
            r.lastSaleDate,
            r.daysSinceSale,
          ])}
          emptyText="No dead stock found."
        />
      )}
    </div>
  );
}

function ReportTable({ title, headers, rows, emptyText = 'No data for this report.' }) {
  return (
    <div className="glass-panel">
      <div className="table-header"><h3>{title}</h3></div>
      {rows.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem' }}><p>{emptyText}</p></div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

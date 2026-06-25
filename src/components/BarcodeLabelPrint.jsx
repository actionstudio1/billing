import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { formatCurrency } from '../utils';

function renderBarcodeSvg(barcode) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, barcode, {
      format: 'CODE128',
      width: 1.5,
      height: 48,
      displayValue: true,
      fontSize: 12,
      margin: 4,
    });
  } catch {
    return `<text x="0" y="20">${barcode}</text>`;
  }
  return svg.outerHTML;
}

function buildLabelHtml(item, currency, companyName = '') {
  const salePrice = item.salePrice || item.rate || 0;
  const mrp = item.mrp || 0;
  const barcodeSvg = renderBarcodeSvg(item.barcode);
  const meta = [item.size ? `Size: ${item.size}` : ''].filter(Boolean).join(' &nbsp; ');

  return `<div class="barcode-label">
    <div class="barcode-label-name">${escapeHtml(item.name || '—')}</div>
    ${mrp > 0 ? `<div class="barcode-label-mrp">MRP: ${formatCurrency(mrp, currency)}</div>` : ''}
    ${meta ? `<div class="barcode-label-meta">${meta}</div>` : ''}
    <div class="barcode-label-barcode">${barcodeSvg}</div>
    ${companyName ? `<div class="barcode-label-company">${escapeHtml(companyName)}</div>` : ''}
  </div>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintDocument(labelsHtml, title) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: 50mm 30mm; margin: 2mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 2mm; }
  .labels-grid { display: flex; flex-wrap: wrap; gap: 2mm; }
  .barcode-label {
    width: 46mm; min-height: 26mm; padding: 2mm;
    border: 0.2mm solid #ccc; page-break-inside: avoid;
    text-align: center; font-size: 8pt;
  }
  .barcode-label-name { font-weight: 700; font-size: 9pt; margin-bottom: 1mm; line-height: 1.2; }
  .barcode-label-mrp { font-weight: 600; font-size: 8pt; }
  .barcode-label-barcode svg { max-width: 100%; height: auto; }
  .barcode-label-meta, .barcode-label-company { font-size: 7pt; margin-top: 1mm; }
  .barcode-label-company { font-weight: 600; }
  @media print { .barcode-label { border: none; } }
</style></head><body>
<div class="labels-grid">${labelsHtml}</div>
<script>window.onload = function() { window.print(); };</script>
</body></html>`;
}

/** Open print dialog for one or more item labels. */
export function printBarcodeLabels(items, { currency = 'INR', copies = 1, companyName = '' } = {}) {
  const list = (Array.isArray(items) ? items : [items]).filter(i => i?.barcode);
  if (list.length === 0) return false;

  let labelsHtml = '';
  for (const item of list) {
    for (let c = 0; c < (copies || 1); c += 1) {
      labelsHtml += buildLabelHtml(item, currency, companyName);
    }
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  printWindow.document.write(buildPrintDocument(labelsHtml, 'Barcode Labels'));
  printWindow.document.close();
  return true;
}

function LabelCanvas({ item, currency = 'INR' }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !item?.barcode) return;
    try {
      JsBarcode(svgRef.current, item.barcode, {
        format: 'CODE128',
        width: 1.5,
        height: 48,
        displayValue: true,
        fontSize: 12,
        margin: 4,
      });
    } catch { /* show text fallback in parent */ }
  }, [item?.barcode]);

  const salePrice = item.salePrice || item.rate || 0;
  const mrp = item.mrp || 0;

  return (
    <div className="barcode-label-preview">
      <div className="barcode-label-name">{item.name || '—'}</div>
      <div className="barcode-label-barcode">
        <svg ref={svgRef} />
      </div>
      <div className="barcode-label-prices">
        {mrp > 0 && <span>MRP: {formatCurrency(mrp, currency)}</span>}
        {salePrice > 0 && <span>Sale: {formatCurrency(salePrice, currency)}</span>}
      </div>
      <div className="barcode-label-meta">
        {item.size && <span>Size: {item.size}</span>}
        {item.color && <span>Color: {item.color}</span>}
      </div>
    </div>
  );
}

export default function BarcodeLabelPreview({ item, currency = 'INR' }) {
  if (!item?.barcode) return null;
  return (
    <div className="barcode-label-preview-wrap">
      <LabelCanvas item={item} currency={currency} />
    </div>
  );
}

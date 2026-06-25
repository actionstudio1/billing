import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import DOMPurify from 'dompurify';
import { numberToWords, formatCurrency, INVOICE_TYPES, getCountryConfig, CURRENCY_NAMES, formatExchangeRateLine, getAccountById, getStateCode, formatDateGST, getLineDiscountAmount, getLineDiscountPercent, getLineGrossAmount, getLineTaxableAmount } from '../utils';

/** Format address block for invoice PDF — city, state, PIN on one line (Indian standard). */
function buildAddressLines(entity, { showAddress = true, showState = true, taxIdLabel, showTaxId, showEmail, showPhone } = {}) {
  if (!entity) return [];
  const lines = [];
  const address = entity.address?.trim();
  const city = entity.city?.trim();
  const state = entity.state?.trim();
  const pin = entity.pin?.trim();

  if (showAddress && address) {
    if (city) {
      lines.push(address);
    } else if (state && !address.toLowerCase().includes(state.toLowerCase())) {
      lines.push(pin ? `${address}, ${state} - ${pin}` : `${address}, ${state}`);
    } else {
      lines.push(address);
    }
  }

  if (city) {
    const loc = [city, state && pin ? `${state} - ${pin}` : state || pin].filter(Boolean).join(', ');
    if (loc) lines.push(loc);
  } else if (!address && showState && state) {
    lines.push(pin ? `${state} - ${pin}` : state);
  }

  if (showTaxId && entity.gstin?.trim()) {
    lines.push({ type: 'taxId', label: taxIdLabel || 'GSTIN', value: entity.gstin.trim() });
  }

  const email = showEmail && entity.email?.trim();
  const phone = showPhone && entity.phone?.trim();
  if (email || phone) {
    lines.push({ type: 'contact', text: [email, phone ? `Ph: ${phone}` : ''].filter(Boolean).join(' · ') });
  }

  return lines;
}

function renderAddressBlock(lines, { className = '', style = {}, strongTaxId = false } = {}) {
  if (!lines.length) return null;
  return (
    <div className={className} style={style}>
      {lines.map((line, i) => {
        if (typeof line === 'string') {
          return <p key={i} style={{ margin: 0 }}>{line}</p>;
        }
        if (line.type === 'taxId') {
          return (
            <p key={i} style={{ margin: 0 }}>
              {line.label}: {strongTaxId ? <strong>{line.value}</strong> : line.value}
            </p>
          );
        }
        if (line.type === 'contact') {
          return <p key={i} style={{ margin: 0 }}>{line.text}</p>;
        }
        return null;
      })}
    </div>
  );
}

const InvoicePreview = React.forwardRef(({ profile, client, details, items, totals, invoiceType = 'tax-invoice', customTerms, customNotes, extraSections = [], options = {} }, ref) => {
  const businessState = profile?.state?.trim().toLowerCase();
  const clientState = client?.state?.trim().toLowerCase();
  const isInterstate = businessState && clientState && businessState !== clientState;
  const typeConfig = INVOICE_TYPES[invoiceType] || INVOICE_TYPES['tax-invoice'];
  // Seller's country drives tax label (GST / VAT / SST / MwSt etc.) and bank label.
  const sellerCC = getCountryConfig(profile?.country);
  const isIndia = (profile?.country || 'India') === 'India';
  const taxLabel = sellerCC.taxLabel || 'GST';

  // Resolve the payment account once per render. Falls back to the synthesised
  // legacy account (built from flat profile bank fields) when no array exists,
  // so v1.4.3 invoices render byte-identical with no `selectedAccountId`.
  const account = getAccountById(profile, options.selectedAccountId);
  const showAccountLabel = options.showAccountLabel === true;

  // Options with defaults. Each toggle defaults to ON so old invoices keep rendering as
  // before; users opt INTO hiding fields via Customize.
  const opt = (key, fallback = true) => options[key] !== undefined ? options[key] : fallback;
  const pdfStyle = options.pdfStyle === 'classic' ? 'gst' : (options.pdfStyle || 'gst');
  const showGST = opt('showGST', typeConfig.showGST);
  const showState = opt('showState');
  const showGSTIN = opt('showGSTIN');
  const showPlaceOfSupply = opt('showPlaceOfSupply', showGST);
  const showHSN = opt('showHSN');
  const showDiscount = opt('showDiscount', true);
  const showBankDetails = opt('showBankDetails');
  const showUPI = opt('showUPI');
  const showLogo = opt('showLogo');
  const showSignature = opt('showSignature');
  const showSignatoryText = opt('showSignatoryText');
  const showTerms = opt('showTerms');
  const showNotes = opt('showNotes');
  const showAmountWords = opt('showAmountWords');
  const showDueDate = opt('showDueDate');
  const showItemQty = opt('showItemQty');
  const showItemUnit = opt('showItemUnit');
  const showRateColumn = opt('showRateColumn');
  const showSubtotal = opt('showSubtotal');
  // Header / client meta — default ON
  const showBusinessName = opt('showBusinessName');
  const showBusinessAddress = opt('showBusinessAddress');
  const showBusinessPhone = opt('showBusinessPhone');
  const showBusinessEmail = opt('showBusinessEmail');
  const showClientAddress = opt('showClientAddress');
  const showClientPhone = opt('showClientPhone');
  const showClientEmail = opt('showClientEmail');
  const showInvoiceNumber = opt('showInvoiceNumber');
  const showInvoiceDate = opt('showInvoiceDate');
  const customTitle = options.customTitle || typeConfig.title;
  const currencySymbol = options.currency || 'INR';

  const fmt = (amount) => {
    if (currencySymbol === 'INR') return formatCurrency(amount);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencySymbol, minimumFractionDigits: 2 }).format(amount || 0);
  };

  const amountInWords = (num) => {
    if (currencySymbol === 'INR') return numberToWords(num);
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const convert = (n) => {
      if (n === 0) return 'Zero';
      let result = '';
      if (n >= 1000000) { result += convert(Math.floor(n / 1000000)) + ' Million '; n %= 1000000; }
      if (n >= 1000) { result += convert(Math.floor(n / 1000)) + ' Thousand '; n %= 1000; }
      if (n >= 100) { result += a[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
      if (n >= 20) { result += b[Math.floor(n / 10)] + ' '; if (n % 10) result += a[n % 10] + ' '; }
      else if (n > 0) { result += a[n] + ' '; }
      return result.trim();
    };
    const names = CURRENCY_NAMES[currencySymbol] || { major: currencySymbol, minor: 'Cents' };
    const rounded = Math.round(num * 100) / 100;
    const whole = Math.floor(rounded);
    const cents = Math.round((rounded - whole) * 100);
    let result = convert(whole) + ' ' + names.major;
    if (cents > 0) result += ' and ' + convert(cents) + ' ' + names.minor;
    return result + ' Only';
  };

  const [qrDataUrl, setQrDataUrl] = useState('');

  // Generate UPI QR code. The VPA now comes from the selected payment account
  // (so switching account swaps both bank block + QR), with fallback to the
  // legacy flat profile.upiId for invoices that pre-date multi-account support.
  const upiId = account?.upiId || profile?.upiId || '';
  useEffect(() => {
    if (!showUPI || !upiId || !totals.total || currencySymbol !== 'INR') {
      setQrDataUrl('');
      return;
    }
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(profile?.businessName || '')}&am=${totals.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Payment for ${details?.invoiceNumber || 'Invoice'}`)}`;
    QRCode.toDataURL(upiUrl, { width: 120, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [showUPI, upiId, profile?.businessName, totals.total, details?.invoiceNumber, currencySymbol]);

  const accentColors = {
    'tax-invoice': '#1e40af',
    'proforma': '#7c3aed',
    'bill-of-supply': '#0f766e',
    'credit-note': '#be123c',
  };
  const accent = options.accentColor || accentColors[invoiceType] || accentColors['tax-invoice'];

  const fmtDate = (dateStr) => {
    if (!dateStr) return '-';
    return formatDateGST(dateStr) || new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatEntityAddress = (entity) => {
    if (!entity) return [];
    const lines = [];
    if (entity.address?.trim()) lines.push(entity.address.trim());
    const city = entity.city?.trim();
    const state = entity.state?.trim();
    const pin = entity.pin?.trim();
    if (city) {
      lines.push([city, state && pin ? `${state} - ${pin}` : state || pin].filter(Boolean).join(', '));
    } else if (state) {
      lines.push(pin ? `${state} - ${pin}` : state);
    }
    return lines;
  };

  const getLineTaxable = (item) => getLineTaxableAmount(item, totals.taxInclusive && showGST);

  // Show discount column whenever the option is on (not only when values exist)
  const showDiscountColumn = showDiscount;

  // Taxable base after all line discounts — CGST/SGST/IGST are always computed on this.
  const taxableBase = Math.max(0, totals.taxableAmount ?? ((totals.subtotal || 0) - (totals.totalDiscount || 0)));
  const taxRateOnTaxable = (taxAmount) => {
    if (!showGST || !taxableBase || !taxAmount) return null;
    const pct = Math.round((taxAmount / taxableBase) * 10000) / 100;
    return Number.isFinite(pct) ? pct : null;
  };
  const cgstRatePct = taxRateOnTaxable(totals.cgst);
  const sgstRatePct = taxRateOnTaxable(totals.sgst);
  const igstRatePct = taxRateOnTaxable(totals.igst);

  const businessLines = buildAddressLines(profile, {
    showAddress: showBusinessAddress,
    showState,
    taxIdLabel: sellerCC.taxIdLabel,
    showTaxId: showGSTIN,
    showEmail: showBusinessEmail,
    showPhone: showBusinessPhone,
  });

  const clientLines = buildAddressLines(client, {
    showAddress: showClientAddress,
    showState,
    taxIdLabel: sellerCC.taxIdLabel,
    showTaxId: showGSTIN,
    showEmail: showClientEmail,
    showPhone: showClientPhone,
  });

  // Header renderers per style
  const renderModernHeader = () => (
    <>
      <div style={{ background: accent, padding: '1.5rem 2rem', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {showLogo && profile?.logo && (
            <img src={profile.logo} alt="Logo" style={{ maxHeight: `${profile.logoHeight || 48}px`, maxWidth: '180px', objectFit: 'contain', marginBottom: '0.5rem', display: 'block', filter: 'brightness(0) invert(1)' }} />
          )}
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '0.08em' }}>{customTitle}</h1>
          {invoiceType === 'proforma' && (
            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', margin: '0.25rem 0 0' }}>For estimation purposes only</p>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          {showBusinessName && <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.35rem', lineHeight: 1.35 }}>{profile?.businessName || 'Your Business'}</h2>}
          {renderAddressBlock(businessLines, {
            style: { fontSize: '0.72rem', color: 'rgba(255,255,255,0.9)', lineHeight: 1.55, textAlign: 'right' },
          })}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 2rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.78rem' }}>
          {showInvoiceNumber && <span><strong style={{ color: '#64748b' }}>No.</strong> {details?.invoiceNumber}</span>}
          {showInvoiceDate && <span><strong style={{ color: '#64748b' }}>Date</strong> {details?.invoiceDate ? new Date(details.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>}
          {showDueDate && details?.dueDate && <span><strong style={{ color: '#64748b' }}>Due</strong> {new Date(details.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
        </div>
        {invoiceType === 'credit-note' && details?.originalInvoiceRef && (
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Against: <strong style={{ color: '#334155' }}>{details.originalInvoiceRef}</strong></span>
        )}
      </div>
    </>
  );

  const renderMinimalHeader = () => (
    <div style={{ padding: '2rem 2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          {showLogo && profile?.logo && (
            <img src={profile.logo} alt="Logo" style={{ maxHeight: `${profile.logoHeight || 48}px`, maxWidth: '180px', objectFit: 'contain', marginBottom: '0.5rem', display: 'block' }} />
          )}
          {showBusinessName && <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0, lineHeight: 1.35 }}>{profile?.businessName || 'Your Business'}</h2>}
          {renderAddressBlock(businessLines, {
            style: { fontSize: '0.72rem', color: '#64748b', lineHeight: 1.55, marginTop: '0.3rem' },
          })}
        </div>
        <div style={{ textAlign: 'right' }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: accent, margin: '0 0 0.5rem', letterSpacing: '0.05em' }}>{customTitle}</h1>
          <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.8 }}>
            {showInvoiceNumber && <p style={{ margin: 0 }}>{details?.invoiceNumber}</p>}
            {showInvoiceDate && <p style={{ margin: 0 }}>{details?.invoiceDate ? new Date(details.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</p>}
            {showDueDate && details?.dueDate && <p style={{ margin: 0 }}>Due: {new Date(details.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
          </div>
        </div>
      </div>
      {invoiceType === 'proforma' && (
        <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', margin: '0 0 0.5rem' }}>This is not a tax invoice. For estimation purposes only.</p>
      )}
      <div style={{ borderBottom: `1.5px solid ${accent}`, marginBottom: '0' }} />
    </div>
  );

  const renderClassicHeader = () => (
    <>
      <div style={{ height: '6px', background: `linear-gradient(90deg, ${accent}, ${accent}cc, ${accent}88)` }} />
      <div className="inv-header">
        <div className="inv-header-left">
          {showLogo && profile?.logo && (
            <img src={profile.logo} alt="Logo" style={{ maxHeight: `${profile.logoHeight || 48}px`, maxWidth: '180px', objectFit: 'contain', marginBottom: '0.75rem', display: 'block' }} />
          )}
          <h1 className="inv-title" style={{ color: accent }}>{customTitle}</h1>
          {invoiceType === 'proforma' && (
            <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', marginBottom: '0.75rem' }}>This is not a tax invoice. For estimation purposes only.</p>
          )}
          {invoiceType === 'credit-note' && details?.originalInvoiceRef && (
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>Against Invoice: <strong style={{ color: '#334155' }}>{details.originalInvoiceRef}</strong></p>
          )}
          <div className="inv-meta">
            {showInvoiceNumber && <div className="inv-meta-row"><span className="inv-meta-label">No.</span><span className="inv-meta-value">{details?.invoiceNumber}</span></div>}
            {showInvoiceDate && <div className="inv-meta-row"><span className="inv-meta-label">Date</span><span className="inv-meta-value">{details?.invoiceDate ? new Date(details.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span></div>}
            {showDueDate && details?.dueDate && (
              <div className="inv-meta-row"><span className="inv-meta-label">Due Date</span><span className="inv-meta-value">{new Date(details.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
            )}
          </div>
        </div>
        <div className="inv-header-right">
          {showBusinessName && <h2 className="inv-business-name">{profile?.businessName || 'Your Business'}</h2>}
          {renderAddressBlock(businessLines, { className: 'inv-business-details', strongTaxId: true })}
        </div>
      </div>
    </>
  );

  // ── GST Professional layout (A4 portrait, distributor-style) ─────────────────
  const renderGstProfessional = () => {
    const placeOfSupply = details?.placeOfSupply || client?.state || '-';
    const supplyStateCode = getStateCode(placeOfSupply) || getStateCode(client?.gstin) || '';
    const companyAddress = formatEntityAddress(profile);
    const clientAddress = formatEntityAddress(client);
    const MIN_ITEM_ROWS = 6;
    const padRows = Math.max(0, MIN_ITEM_ROWS - items.length);
    const termsHtml = customTerms ? DOMPurify.sanitize(typeof customTerms === 'string' ? customTerms : String(customTerms || '')) : '';
    const hasTerms = termsHtml && termsHtml.replace(/<[^>]*>/g, '').trim();
    const notesHtml = customNotes ? DOMPurify.sanitize(customNotes) : '';
    const hasNotes = notesHtml && notesHtml.replace(/<[^>]*>/g, '').trim();

    return (
      <div className="inv-gst">
        <div className="inv-gst-doc-title">{customTitle}</div>

        {/* Company + Invoice meta */}
        <table className="inv-gst-block-table inv-gst-header-block">
          <tbody>
            <tr>
              <td className="inv-gst-company-cell">
                <div className="inv-gst-company-inner">
                  {showLogo && profile?.logo && (
                    <img src={profile.logo} alt="Logo" className="inv-gst-logo" style={{ maxHeight: `${profile.logoHeight || 48}px` }} />
                  )}
                  {showBusinessName && (
                    <div className="inv-gst-company-name">{profile?.businessName || 'Your Business'}</div>
                  )}
                  {showBusinessAddress && companyAddress.map((line, i) => (
                    <div key={i} className="inv-gst-text-line">{line}</div>
                  ))}
                  {showGSTIN && profile?.gstin && (
                    <div className="inv-gst-text-line"><span className="inv-gst-lbl">GSTIN</span> {profile.gstin}</div>
                  )}
                  {isIndia && profile?.pan && (
                    <div className="inv-gst-text-line"><span className="inv-gst-lbl">PAN No.</span> {profile.pan}</div>
                  )}
                  {showBusinessPhone && profile?.phone && (
                    <div className="inv-gst-text-line"><span className="inv-gst-lbl">Mobile No.</span> {profile.phone}</div>
                  )}
                  {showBusinessEmail && profile?.email && (
                    <div className="inv-gst-text-line"><span className="inv-gst-lbl">Email ID</span> {profile.email}</div>
                  )}
                </div>
              </td>
              <td className="inv-gst-meta-cell">
                <table className="inv-gst-meta-inner">
                  <tbody>
                    {showInvoiceNumber && (
                      <tr><td className="inv-gst-meta-lbl">Invoice No.</td><td className="inv-gst-meta-val">{details?.invoiceNumber || '-'}</td></tr>
                    )}
                    {showInvoiceDate && (
                      <tr><td className="inv-gst-meta-lbl">Invoice Date</td><td className="inv-gst-meta-val">{fmtDate(details?.invoiceDate)}</td></tr>
                    )}
                    {showDueDate && (
                      <tr><td className="inv-gst-meta-lbl">Due Date</td><td className="inv-gst-meta-val">{details?.dueDate ? fmtDate(details.dueDate) : '-'}</td></tr>
                    )}
                    {showPlaceOfSupply && (
                      <tr><td className="inv-gst-meta-lbl">Place of Supply</td><td className="inv-gst-meta-val">{placeOfSupply}</td></tr>
                    )}
                    {showGST && isIndia && (
                      <tr><td className="inv-gst-meta-lbl">State Code</td><td className="inv-gst-meta-val">{supplyStateCode || '-'}</td></tr>
                    )}
                    {invoiceType === 'credit-note' && details?.originalInvoiceRef && (
                      <tr><td className="inv-gst-meta-lbl">Against Inv.</td><td className="inv-gst-meta-val">{details.originalInvoiceRef}</td></tr>
                    )}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Bill To */}
        <table className="inv-gst-block-table inv-gst-billto-block">
          <tbody>
            <tr>
              <td className="inv-gst-billto-cell">
                <div className="inv-gst-section-hd">Bill To</div>
                <div className="inv-gst-party-name">{client?.name || 'Client Name'}</div>
                {showClientAddress && clientAddress.map((line, i) => (
                  <div key={i} className="inv-gst-text-line">{line}</div>
                ))}
                {showClientPhone && client?.phone && (
                  <div className="inv-gst-text-line"><span className="inv-gst-lbl">Mobile No.</span> {client.phone}</div>
                )}
                {showGSTIN && client?.gstin && (
                  <div className="inv-gst-text-line"><span className="inv-gst-lbl">GSTIN</span> {client.gstin}</div>
                )}
                {showClientEmail && client?.email && (
                  <div className="inv-gst-text-line"><span className="inv-gst-lbl">Email ID</span> {client.email}</div>
                )}
              </td>
              {showGST && isIndia && (
                <td className="inv-gst-supply-cell">
                  <div className="inv-gst-section-hd">Supply Type</div>
                  <div className="inv-gst-text-line" style={{ fontWeight: 600 }}>
                    {isInterstate ? 'Interstate Supply (IGST)' : 'Intrastate Supply (CGST + SGST)'}
                  </div>
                </td>
              )}
            </tr>
          </tbody>
        </table>

        {invoiceType === 'proforma' && (
          <div className="inv-gst-proforma-note">This is not a tax invoice. For estimation purposes only.</div>
        )}

        {/* Items table */}
        <table className="inv-gst-block-table inv-gst-items-table">
          <thead>
            <tr>
              <th className="inv-gst-th inv-gst-col-sr">Sr No.</th>
              <th className="inv-gst-th inv-gst-col-desc">Description</th>
              {showHSN && <th className="inv-gst-th inv-gst-col-hsn">HSN/SAC</th>}
              {showItemQty && <th className="inv-gst-th inv-gst-col-qty">Qty</th>}
              {showRateColumn && <th className="inv-gst-th inv-gst-col-rate">Rate</th>}
              {showDiscountColumn && <th className="inv-gst-th inv-gst-col-disc">Disc. %</th>}
              {showDiscountColumn && <th className="inv-gst-th inv-gst-col-disc-amt">Disc. ₹</th>}
              {showGST && <th className="inv-gst-th inv-gst-col-tax">Tax %</th>}
              <th className="inv-gst-th inv-gst-col-amt">{showDiscountColumn ? 'Taxable' : 'Amount'}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="inv-gst-td inv-gst-td-center">{index + 1}</td>
                <td className="inv-gst-td inv-gst-td-desc">{item.name || '-'}</td>
                {showHSN && <td className="inv-gst-td inv-gst-td-center">{item.hsn || '-'}</td>}
                {showItemQty && (
                  <td className="inv-gst-td inv-gst-td-center">
                    {item.quantity}{showItemUnit && item.unit ? ` ${item.unit}` : ''}
                  </td>
                )}
                {showRateColumn && <td className="inv-gst-td inv-gst-td-right">{fmt(item.rate)}</td>}
                {showDiscountColumn && (
                  <td className="inv-gst-td inv-gst-td-center">
                    {getLineDiscountPercent(item) > 0 ? `${getLineDiscountPercent(item)}%` : '0%'}
                  </td>
                )}
                {showDiscountColumn && (
                  <td className="inv-gst-td inv-gst-td-right">
                    {getLineDiscountAmount(item) > 0 ? fmt(getLineDiscountAmount(item)) : '—'}
                  </td>
                )}
                {showGST && <td className="inv-gst-td inv-gst-td-center">{item.taxPercent || 0}%</td>}
                <td className="inv-gst-td inv-gst-td-right inv-gst-td-bold">{fmt(getLineTaxable(item))}</td>
              </tr>
            ))}
            {Array.from({ length: padRows }).map((_, i) => (
              <tr key={`pad-${i}`} className="inv-gst-pad-row">
                <td className="inv-gst-td">&nbsp;</td>
                <td className="inv-gst-td">&nbsp;</td>
                {showHSN && <td className="inv-gst-td">&nbsp;</td>}
                {showItemQty && <td className="inv-gst-td">&nbsp;</td>}
                {showRateColumn && <td className="inv-gst-td">&nbsp;</td>}
                {showDiscountColumn && <td className="inv-gst-td">&nbsp;</td>}
                {showDiscountColumn && <td className="inv-gst-td">&nbsp;</td>}
                {showGST && <td className="inv-gst-td">&nbsp;</td>}
                <td className="inv-gst-td">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Amount in words + Summary */}
        <table className="inv-gst-block-table inv-gst-summary-block">
          <tbody>
            <tr>
              <td className="inv-gst-words-cell" rowSpan={2}>
                {showAmountWords && (
                  <>
                    <div className="inv-gst-section-hd">Amount in Words</div>
                    <div className="inv-gst-words-text">{amountInWords(totals.total)}</div>
                  </>
                )}
                {qrDataUrl && showUPI && (
                  <div className="inv-gst-qr-block">
                    <div className="inv-gst-section-hd">UPI QR</div>
                    <div className="inv-gst-qr-row">
                      <img src={qrDataUrl} alt="UPI QR" className="inv-gst-qr-img" />
                      <div>
                        <div className="inv-gst-text-line"><span className="inv-gst-lbl">UPI ID</span> {upiId}</div>
                        <div className="inv-gst-text-line"><span className="inv-gst-lbl">Amount</span> {fmt(totals.total)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </td>
              <td className="inv-gst-totals-cell">
                <table className="inv-gst-totals-inner">
                  <tbody>
                    {showDiscountColumn && totals.totalDiscount > 0 && (
                      <tr>
                        <td className="inv-gst-total-lbl">Discount</td>
                        <td className="inv-gst-total-val">− {fmt(totals.totalDiscount)}</td>
                      </tr>
                    )}
                    {showGST && (
                      <tr>
                        <td className="inv-gst-total-lbl">Taxable Amount</td>
                        <td className="inv-gst-total-val">{fmt(taxableBase)}</td>
                      </tr>
                    )}
                    {showGST && isIndia && isInterstate && (
                      <tr>
                        <td className="inv-gst-total-lbl">{igstRatePct != null ? `IGST (${igstRatePct}%)` : 'IGST'}</td>
                        <td className="inv-gst-total-val">{fmt(totals.igst)}</td>
                      </tr>
                    )}
                    {showGST && isIndia && !isInterstate && (
                      <>
                        <tr>
                          <td className="inv-gst-total-lbl">{cgstRatePct != null ? `CGST (${cgstRatePct}%)` : 'CGST'}</td>
                          <td className="inv-gst-total-val">{fmt(totals.cgst)}</td>
                        </tr>
                        <tr>
                          <td className="inv-gst-total-lbl">{sgstRatePct != null ? `SGST (${sgstRatePct}%)` : 'SGST'}</td>
                          <td className="inv-gst-total-val">{fmt(totals.sgst)}</td>
                        </tr>
                      </>
                    )}
                    {showGST && !isIndia && (
                      <tr>
                        <td className="inv-gst-total-lbl">{taxLabel}</td>
                        <td className="inv-gst-total-val">{fmt((totals.cgst || 0) + (totals.sgst || 0) + (totals.igst || 0))}</td>
                      </tr>
                    )}
                    {totals.cess > 0 && (
                      <tr>
                        <td className="inv-gst-total-lbl">GST Cess</td>
                        <td className="inv-gst-total-val">{fmt(totals.cess)}</td>
                      </tr>
                    )}
                    {totals.tcsAmount > 0 && (
                      <tr>
                        <td className="inv-gst-total-lbl">TCS</td>
                        <td className="inv-gst-total-val">{fmt(totals.tcsAmount)}</td>
                      </tr>
                    )}
                    {(totals.roundOff !== undefined && totals.roundOff !== 0) && (
                      <tr>
                        <td className="inv-gst-total-lbl">Round Off</td>
                        <td className="inv-gst-total-val">{totals.roundOff > 0 ? '+' : ''}{fmt(totals.roundOff)}</td>
                      </tr>
                    )}
                    {(totals.adjustment !== undefined && totals.adjustment !== 0) && (
                      <tr>
                        <td className="inv-gst-total-lbl">{totals.adjustment > 0 ? 'Add' : 'Less'}</td>
                        <td className="inv-gst-total-val">
                          {totals.adjustment > 0 ? '+' : '−'} {fmt(Math.abs(totals.adjustment))}
                        </td>
                      </tr>
                    )}
                    <tr className="inv-gst-grand-total-row">
                      <td className="inv-gst-total-lbl inv-gst-grand-lbl">
                        {invoiceType === 'credit-note' ? 'Credit Amount' : 'Grand Total'}
                      </td>
                      <td className="inv-gst-total-val inv-gst-grand-val">{fmt(totals.total)}</td>
                    </tr>
                    {options.showTDS && totals.tdsAmount > 0 && (
                      <>
                        <tr>
                          <td className="inv-gst-total-lbl">Less: TDS</td>
                          <td className="inv-gst-total-val">− {fmt(totals.tdsAmount)}</td>
                        </tr>
                        <tr>
                          <td className="inv-gst-total-lbl">Net Receivable</td>
                          <td className="inv-gst-total-val">{fmt(totals.netReceivable)}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {options.reverseCharge && isIndia && showGST && (
          <div className="inv-gst-rcm-note">
            <strong>Reverse Charge applicable.</strong> GST is payable by the recipient under Section 9(3)/9(4) of the CGST Act.
          </div>
        )}

        {/* Bank details + Terms */}
        <table className="inv-gst-block-table inv-gst-footer-block">
          <tbody>
            <tr>
              <td className="inv-gst-bank-cell">
                {showBankDetails && (account?.bankName || profile?.bankName) && (
                  <>
                    <div className="inv-gst-section-hd">Bank Details</div>
                    {showAccountLabel && account?.label && (
                      <div className="inv-gst-text-line" style={{ fontStyle: 'italic' }}>Account: {account.label}</div>
                    )}
                    <div className="inv-gst-text-line"><span className="inv-gst-lbl">Bank Name</span> {account?.bankName || profile.bankName}</div>
                    <div className="inv-gst-text-line"><span className="inv-gst-lbl">Account Number</span> {account?.accountNumber || profile.accountNumber}</div>
                    {(account?.ifsc || profile.ifsc) && (
                      <div className="inv-gst-text-line"><span className="inv-gst-lbl">IFSC Code</span> {account?.ifsc || profile.ifsc}</div>
                    )}
                    {(account?.swift || profile.swift) && (
                      <div className="inv-gst-text-line"><span className="inv-gst-lbl">SWIFT/BIC</span> {account?.swift || profile.swift}</div>
                    )}
                  </>
                )}
                {showTerms && hasTerms && (
                  <div className="inv-gst-terms-block">
                    <div className="inv-gst-section-hd">Terms &amp; Conditions</div>
                    <div className="inv-gst-terms inv-rich" dangerouslySetInnerHTML={{ __html: termsHtml }} />
                  </div>
                )}
                {showNotes && hasNotes && (
                  <div className="inv-gst-terms-block">
                    <div className="inv-gst-section-hd">Notes / Remarks</div>
                    <div className="inv-gst-terms inv-rich" dangerouslySetInnerHTML={{ __html: notesHtml }} />
                  </div>
                )}
              </td>
              <td className="inv-gst-sign-cell">
                {showSignature && (
                <div className="inv-gst-sign-box">
                  {profile?.signature ? (
                    <>
                      <div className="inv-gst-sign-hd">Authorized Signatory</div>
                      <img src={profile.signature} alt="Signature" className="inv-gst-sign-img" />
                      <div className="inv-gst-sign-name">{profile?.businessName}</div>
                    </>
                  ) : (
                    <>
                      <div className="inv-gst-sign-hd">Authorized Signatory</div>
                      <div className="inv-gst-sign-line" />
                      <div className="inv-gst-sign-name">{profile?.businessName || ''}</div>
                    </>
                  )}
                </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // Billing parties section (shared but styled per variant)
  const renderParties = () => {
    const padStyle = pdfStyle === 'modern' ? { padding: '1rem 2rem' } : pdfStyle === 'minimal' ? { padding: '0 2rem 1rem', border: 'none' } : {};
    return (
      <div className="inv-parties" style={padStyle}>
        <div className="inv-party">
          <h4 className="inv-section-label">BILL TO</h4>
          <p className="inv-party-name">{client?.name || 'Client Name'}</p>
          {renderAddressBlock(clientLines, { className: 'inv-party-details', strongTaxId: true })}
        </div>
        {showPlaceOfSupply && (
          <div className="inv-party inv-party-right">
            <h4 className="inv-section-label">PLACE OF SUPPLY</h4>
            <p className="inv-party-name">{details?.placeOfSupply || client?.state || '-'}</p>
            {showGST && isIndia && isInterstate && <span className="inv-tax-badge">Interstate (IGST)</span>}
            {showGST && isIndia && !isInterstate && businessState && clientState && <span className="inv-tax-badge inv-tax-badge-green">Intrastate (CGST + SGST)</span>}
            {showGST && !isIndia && <span className="inv-tax-badge inv-tax-badge-green">{taxLabel}</span>}
          </div>
        )}
      </div>
    );
  };

  const renderExtraSections = () => {
    const filtered = extraSections.filter(s => s.title || s.content);
    const totalPages = filtered.length > 0 ? 1 + filtered.length : 1;
    return filtered.map((section, idx) => (
      <div key={section.id} className="inv-extra-page" data-pdf-page={idx + 2}>
        <div className="inv-extra-page-header">
          <div>
            <span className="inv-extra-ref">{customTitle} — {details?.invoiceNumber}</span>
            {client?.name && <span className="inv-extra-ref"> | {client.name}</span>}
          </div>
          <span className="inv-extra-page-num">Page {idx + 2} of {totalPages}</span>
        </div>
        {section.title && <h4 className="inv-section-label" style={{ marginBottom: '0.75rem' }}>{section.title.toUpperCase()}</h4>}
        {section.content && (
          <div className="inv-extra-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(section.content) }} />
        )}
      </div>
    ));
  };

  const renderWatermark = () => invoiceType === 'proforma' ? (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%) rotate(-35deg)',
      fontSize: '5rem', fontWeight: 800, color: `${accent}0a`,
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      ESTIMATE
    </div>
  ) : null;

  if (pdfStyle === 'gst') {
    return (
      <div className="invoice-preview-container inv-gst-container" ref={ref} id="invoice-preview">
        {renderGstProfessional()}
        {renderExtraSections()}
        {renderWatermark()}
      </div>
    );
  }

  return (
    <div className="invoice-preview-container" ref={ref} id="invoice-preview">
      {pdfStyle === 'modern' && renderModernHeader()}
      {pdfStyle === 'minimal' && renderMinimalHeader()}
      {pdfStyle === 'classic' && renderClassicHeader()}

      {renderParties()}

      {/* Items table */}
      <table className="inv-table" style={{ tableLayout: 'auto', ...(pdfStyle === 'modern' ? { margin: '0 2rem', width: 'calc(100% - 4rem)' } : pdfStyle === 'minimal' ? { margin: '0 2rem', width: 'calc(100% - 4rem)', borderTop: 'none' } : {}) }}>
        <thead>
          {showGST ? (
            isIndia && isInterstate ? (
              <>
                <tr>
                  <th className="inv-th" rowSpan="2">#</th>
                  <th className="inv-th" rowSpan="2">Description</th>
                  {showHSN && <th className="inv-th inv-th-center" rowSpan="2">HSN/SAC</th>}
                  {showItemQty && <th className="inv-th inv-th-center" rowSpan="2">Qty</th>}
                  {showRateColumn && <th className="inv-th inv-th-right" rowSpan="2">Rate</th>}
                  {showDiscountColumn && <th className="inv-th inv-th-right" rowSpan="2">Disc. %</th>}
                  {showDiscountColumn && <th className="inv-th inv-th-right" rowSpan="2">Disc. ₹</th>}
                  <th className="inv-th inv-th-center" colSpan="2" style={{ borderBottom: '1px solid #cbd5e1' }}>IGST</th>
                  <th className="inv-th inv-th-right" rowSpan="2">Amount</th>
                </tr>
                <tr>
                  <th className="inv-th inv-th-center">%</th>
                  <th className="inv-th inv-th-right">Amt</th>
                </tr>
              </>
            ) : isIndia ? (
              <>
                <tr>
                  <th className="inv-th" rowSpan="2">#</th>
                  <th className="inv-th" rowSpan="2">Description</th>
                  {showHSN && <th className="inv-th inv-th-center" rowSpan="2">HSN/SAC</th>}
                  {showItemQty && <th className="inv-th inv-th-center" rowSpan="2">Qty</th>}
                  {showRateColumn && <th className="inv-th inv-th-right" rowSpan="2">Rate</th>}
                  {showDiscountColumn && <th className="inv-th inv-th-right" rowSpan="2">Disc. %</th>}
                  {showDiscountColumn && <th className="inv-th inv-th-right" rowSpan="2">Disc. ₹</th>}
                  <th className="inv-th inv-th-center" colSpan="2" style={{ borderBottom: '1px solid #cbd5e1' }}>CGST</th>
                  <th className="inv-th inv-th-center" colSpan="2" style={{ borderBottom: '1px solid #cbd5e1' }}>SGST</th>
                  <th className="inv-th inv-th-right" rowSpan="2">Amount</th>
                </tr>
                <tr>
                  <th className="inv-th inv-th-center">%</th>
                  <th className="inv-th inv-th-right">Amt</th>
                  <th className="inv-th inv-th-center">%</th>
                  <th className="inv-th inv-th-right">Amt</th>
                </tr>
              </>
            ) : (
              // Foreign: single tax column (VAT/SST/etc.) — no CGST/SGST/IGST split
              <>
                <tr>
                  <th className="inv-th" rowSpan="2">#</th>
                  <th className="inv-th" rowSpan="2">Description</th>
                  {showHSN && <th className="inv-th inv-th-center" rowSpan="2">HSN/SAC</th>}
                  {showItemQty && <th className="inv-th inv-th-center" rowSpan="2">Qty</th>}
                  {showRateColumn && <th className="inv-th inv-th-right" rowSpan="2">Rate</th>}
                  {showDiscountColumn && <th className="inv-th inv-th-right" rowSpan="2">Disc. %</th>}
                  {showDiscountColumn && <th className="inv-th inv-th-right" rowSpan="2">Disc. ₹</th>}
                  <th className="inv-th inv-th-center" colSpan="2" style={{ borderBottom: '1px solid #cbd5e1' }}>{taxLabel}</th>
                  <th className="inv-th inv-th-right" rowSpan="2">Amount</th>
                </tr>
                <tr>
                  <th className="inv-th inv-th-center">%</th>
                  <th className="inv-th inv-th-right">Amt</th>
                </tr>
              </>
            )
          ) : (
            <tr>
              <th className="inv-th">#</th>
              <th className="inv-th">Description</th>
              {showHSN && <th className="inv-th inv-th-center">HSN/SAC</th>}
              {showItemQty && <th className="inv-th inv-th-center">Qty</th>}
              {showRateColumn && <th className="inv-th inv-th-right">Rate</th>}
              {showDiscountColumn && <th className="inv-th inv-th-right">Disc. %</th>}
              {showDiscountColumn && <th className="inv-th inv-th-right">Disc. ₹</th>}
              <th className="inv-th inv-th-right">Amount</th>
            </tr>
          )}
        </thead>
        <tbody>
          {items.map((item, index) => {
            const lineAmount = getLineGrossAmount(item);
            const discount = getLineDiscountAmount(item);
            const grossAfterDiscount = lineAmount - discount;
            const taxRate = item.taxPercent || 0;
            const isTaxInclusive = totals.taxInclusive;
            const afterDiscount = isTaxInclusive && showGST ? grossAfterDiscount / (1 + taxRate / 100) : grossAfterDiscount;
            const taxAmount = isTaxInclusive && showGST ? grossAfterDiscount - afterDiscount : afterDiscount * taxRate / 100;
            const halfRate = taxRate / 2;
            const halfTax = taxAmount / 2;
            return (
              <tr key={item.id} className={index % 2 === 0 ? 'inv-tr-even' : ''}>
                <td className="inv-td inv-td-muted">{index + 1}</td>
                <td className="inv-td inv-td-name">{item.name || '-'}</td>
                {showHSN && <td className="inv-td inv-td-center inv-td-muted">{item.hsn || '-'}</td>}
                {showItemQty && <td className="inv-td inv-td-center">{item.quantity}{showItemUnit && item.unit ? ` ${item.unit}` : ''}</td>}
                {showRateColumn && <td className="inv-td inv-td-right">{fmt(item.rate)}</td>}
                {showDiscountColumn && (
                  <td className="inv-td inv-td-center">
                    {getLineDiscountPercent(item) > 0 ? `${getLineDiscountPercent(item)}%` : '0%'}
                  </td>
                )}
                {showDiscountColumn && (
                  <td className="inv-td inv-td-right">
                    {discount > 0 ? fmt(discount) : '—'}
                  </td>
                )}
                {showGST && (
                  isIndia && isInterstate ? (
                    <>
                      <td className="inv-td inv-td-center">{taxRate}%</td>
                      <td className="inv-td inv-td-right">{fmt(taxAmount)}</td>
                    </>
                  ) : isIndia ? (
                    <>
                      <td className="inv-td inv-td-center">{halfRate}%</td>
                      <td className="inv-td inv-td-right">{fmt(halfTax)}</td>
                      <td className="inv-td inv-td-center">{halfRate}%</td>
                      <td className="inv-td inv-td-right">{fmt(halfTax)}</td>
                    </>
                  ) : (
                    <>
                      <td className="inv-td inv-td-center">{taxRate}%</td>
                      <td className="inv-td inv-td-right">{fmt(taxAmount)}</td>
                    </>
                  )
                )}
                <td className="inv-td inv-td-right inv-td-amount">{fmt(afterDiscount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals section */}
      <div className="inv-totals-section" style={pdfStyle !== 'classic' ? { padding: '1rem 2rem' } : {}}>
        <div className="inv-words">
          {showAmountWords && (
            <>
              <h4 className="inv-section-label">AMOUNT IN WORDS</h4>
              <p className="inv-words-text">{amountInWords(totals.total)}</p>
            </>
          )}
          {/* UPI QR Code */}
          {qrDataUrl && (
            <div style={{ marginTop: '1.25rem' }}>
              <h4 className="inv-section-label">SCAN TO PAY (UPI)</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <img src={qrDataUrl} alt="UPI QR" style={{ width: '90px', height: '90px', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.5 }}>
                  <p style={{ margin: 0, color: '#94a3b8' }}>UPI ID:</p>
                  <p style={{ margin: 0, color: '#334155', fontWeight: 600, fontSize: '0.75rem' }}>{upiId}</p>
                  <p style={{ margin: '0.25rem 0 0', color: '#94a3b8' }}>{fmt(totals.total)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="inv-totals">
          {showSubtotal && (
            <div className="inv-total-row">
              <span>Subtotal</span>
              <span>{fmt(totals.subtotal)}</span>
            </div>
          )}
          {showDiscount && totals.totalDiscount > 0 && (
            <div className="inv-total-row" style={{ color: '#dc2626' }}>
              <span>Discount</span>
              <span>- {fmt(totals.totalDiscount)}</span>
            </div>
          )}
          {showGST && (
            <div className="inv-total-row">
              <span>Taxable Amount</span>
              <span>{fmt(taxableBase)}</span>
            </div>
          )}
          {showGST && (
            isIndia && isInterstate ? (
              <div className="inv-total-row">
                <span>{igstRatePct != null ? `IGST (${igstRatePct}%)` : 'IGST'}</span>
                <span>{fmt(totals.igst)}</span>
              </div>
            ) : isIndia ? (
              <>
                <div className="inv-total-row">
                  <span>{cgstRatePct != null ? `CGST (${cgstRatePct}%)` : 'CGST'}</span>
                  <span>{fmt(totals.cgst)}</span>
                </div>
                <div className="inv-total-row">
                  <span>{sgstRatePct != null ? `SGST (${sgstRatePct}%)` : 'SGST'}</span>
                  <span>{fmt(totals.sgst)}</span>
                </div>
              </>
            ) : (
              <div className="inv-total-row">
                <span>{taxLabel}</span>
                <span>{fmt((totals.cgst || 0) + (totals.sgst || 0) + (totals.igst || 0))}</span>
              </div>
            )
          )}
          {totals.cess > 0 && (
            <div className="inv-total-row">
              <span>GST Cess</span>
              <span>{fmt(totals.cess)}</span>
            </div>
          )}
          {totals.tcsAmount > 0 && (
            <div className="inv-total-row">
              <span>TCS{options.tcsSection ? ` (${options.tcsSection} @ ${options.tcsRate}%)` : ''}</span>
              <span>{fmt(totals.tcsAmount)}</span>
            </div>
          )}
          {totals.roundOff !== undefined && totals.roundOff !== 0 && (
            <div className="inv-total-row" style={{ color: '#64748b', fontStyle: 'italic' }}>
              <span>Round-off</span>
              <span>{totals.roundOff > 0 ? '+' : ''}{fmt(totals.roundOff)}</span>
            </div>
          )}
          {totals.adjustment !== undefined && totals.adjustment !== 0 && (
            <div className="inv-total-row" style={{ color: totals.adjustment > 0 ? '#0f766e' : '#dc2626' }}>
              <span>{totals.adjustment > 0 ? 'Add' : 'Less'}</span>
              <span>{totals.adjustment > 0 ? '+' : '−'} {fmt(Math.abs(totals.adjustment))}</span>
            </div>
          )}
          {pdfStyle === 'modern' ? (
            <div className="inv-total-row inv-total-final inv-total-modern" style={{ background: accent, color: '#fff', borderRadius: '6px', padding: '0.6rem 0.75rem', marginTop: '0.25rem' }}>
              <span style={{ color: '#fff' }}>{invoiceType === 'credit-note' ? 'Credit Amount' : 'Total Due'}</span>
              <span style={{ color: '#fff' }}>{fmt(totals.total)}</span>
            </div>
          ) : (
            <div className="inv-total-row inv-total-final">
              <span>{invoiceType === 'credit-note' ? 'Credit Amount' : 'Total Due'}</span>
              <span style={{ color: accent }}>{fmt(totals.total)}</span>
            </div>
          )}
          {options.showTDS && totals.tdsAmount > 0 && (
            <>
              <div className="inv-total-row" style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem', borderTop: '1px dashed #e2e8f0', paddingTop: '0.4rem' }}>
                <span>Less: TDS{options.tdsSection ? ` (${options.tdsSection} @ ${options.tdsRate}%)` : ''}</span>
                <span>− {fmt(totals.tdsAmount)}</span>
              </div>
              <div className="inv-total-row" style={{ fontWeight: 600, color: '#0f766e', fontSize: '0.78rem' }}>
                <span>Net Receivable</span>
                <span>{fmt(totals.netReceivable)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Reverse-charge declaration (India) — printed prominently between the
          tax block and the footer when the seller has flagged this invoice as
          RCM. The buyer is responsible for paying GST under Section 9(3)/9(4). */}
      {options.reverseCharge && isIndia && showGST && (
        <div style={{ margin: '0 2rem 0.5rem', padding: '0.5rem 0.75rem', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: 4, fontSize: '0.78rem', color: 'var(--warn-text)' }}>
          <strong>Reverse Charge applicable.</strong> GST is payable by the recipient under Section 9(3)/9(4) of the CGST Act.
        </div>
      )}

      {/* Composition-scheme mandatory declaration — Rule 46A of CGST Rules. The
          exact wording is prescribed; do not paraphrase. */}
      {invoiceType === 'composition' && (
        <div style={{ margin: '0 2rem 0.5rem', padding: '0.5rem 0.75rem', background: 'var(--info-bg)', border: '1px solid var(--info-border)', borderRadius: 4, fontSize: '0.78rem', color: 'var(--info-text)', fontStyle: 'italic' }}>
          "Composition taxable person, not eligible to collect tax on supplies."
          &nbsp;<span style={{ fontStyle: 'normal', fontSize: '0.7rem' }}>(Rule 46A, CGST Rules)</span>
        </div>
      )}

      {/* Footer */}
      <div className="inv-footer" style={pdfStyle !== 'classic' ? { padding: '1rem 2rem' } : {}}>
        <div className="inv-footer-left">
          {/* Bank details render from the resolved payment account. Account fields
              fall back to the flat profile fields when neither array entry nor flat
              field exists — guarantees byte-identical PDFs for v1.4.3 invoices. */}
          {showBankDetails && (account?.bankName || profile?.bankName) && (
            <div className="inv-footer-block">
              <h4 className="inv-section-label">BANK DETAILS</h4>
              {showAccountLabel && account?.label && (
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                  Pay via: <strong style={{ color: '#334155' }}>{account.label}</strong>
                </p>
              )}
              <div className="inv-footer-details">
                <p><span className="inv-detail-label">Bank:</span> {account?.bankName || profile.bankName}</p>
                <p><span className="inv-detail-label">A/C No:</span> {account?.accountNumber || profile.accountNumber}</p>
                {(account?.ifsc || profile.ifsc) && <p><span className="inv-detail-label">{sellerCC.bankLabel || 'IFSC'}:</span> {account?.ifsc || profile.ifsc}</p>}
                {(account?.swift || profile.swift) && <p><span className="inv-detail-label">SWIFT/BIC:</span> {account?.swift || profile.swift}</p>}
                {profile.pan && isIndia && <p><span className="inv-detail-label">PAN:</span> {profile.pan}</p>}
              </div>
            </div>
          )}
          {options.exchangeRate && currencySymbol !== 'INR' && (
            <div className="inv-footer-block">
              <h4 className="inv-section-label">EXCHANGE RATE</h4>
              <p className="inv-terms">{formatExchangeRateLine(currencySymbol, options.exchangeRate, profile?.country === 'India' || !profile?.country ? 'INR' : sellerCC.currency)}</p>
            </div>
          )}
          {/* Terms and notes accept rich HTML; same DOMPurify sanitization the extraSections
              block uses, which keeps b/i/u/lists/links/headings and strips everything else. */}
          {(() => {
            const termsHtml = customTerms ? DOMPurify.sanitize(typeof customTerms === 'string' ? customTerms : String(customTerms || '')) : '';
            const hasTerms = termsHtml && termsHtml.replace(/<[^>]*>/g, '').trim();
            return showTerms && hasTerms ? (
              <div className="inv-footer-block">
                <h4 className="inv-section-label">TERMS & CONDITIONS</h4>
                <div className="inv-terms inv-rich" dangerouslySetInnerHTML={{ __html: termsHtml }} />
              </div>
            ) : null;
          })()}
          {(() => {
            const notesHtml = customNotes ? DOMPurify.sanitize(customNotes) : '';
            const hasNotes = notesHtml && notesHtml.replace(/<[^>]*>/g, '').trim();
            return showNotes && hasNotes ? (
              <div className="inv-footer-block">
                <h4 className="inv-section-label">NOTES / REMARKS</h4>
                <div className="inv-terms inv-rich" dangerouslySetInnerHTML={{ __html: notesHtml }} />
              </div>
            ) : null;
          })()}
        </div>
        {showSignature && (
          <div className="inv-signature">
            {showSignatoryText && <p className="inv-sig-label">Authorized Signatory</p>}
            {profile?.signature ? (
              <img src={profile.signature} alt="Signature" style={{
                maxHeight: '60px', maxWidth: '180px', objectFit: 'contain',
                display: 'block', marginLeft: 'auto', marginBottom: '0.4rem'
              }} />
            ) : (
              <div className="inv-sig-line" />
            )}
            <p className="inv-sig-name">{profile?.businessName}</p>
          </div>
        )}
      </div>

      {/* Extra Sections - each starts on new page */}
      {renderExtraSections()}

      {/* Watermark for proforma */}
      {renderWatermark()}

      {/* Bottom bar for modern style */}
      {pdfStyle === 'modern' && (
        <div style={{ height: '4px', background: accent, marginTop: 'auto' }} />
      )}
    </div>
  );
});

export default InvoicePreview;

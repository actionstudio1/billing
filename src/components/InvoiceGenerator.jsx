import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Plus, Trash2, Download, UserPlus, Pencil, Settings, ChevronUp, ChevronDown, MessageCircle, Check, Loader, Truck, Save, Upload } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { saveBill, getNextInvoiceNumber, getTermsTemplates, saveTermsTemplate, getDefaultInvoiceTerms, saveDefaultInvoiceTerms, getAllClients, saveClient, getProfile, getAllProducts, getAllItems, saveProduct, getInvoiceDisplayOptions, saveInvoiceDisplayOptions, getAllProfiles, getRegionMode, saveRecurring, savePdf, isSupabaseMode } from '../store';
import { resolveBarcodeLookup } from '../lib/barcode';
import { waitForSession } from '../lib/supabase';
import { INVOICE_TYPES, generateEWayBillJSON, formatCurrency, getCountryConfig, getStatesForCountry, getAllUnits, addCustomUnit, removeCustomUnit, calculateRoundOff, calculateLineItemTax, getLineDiscountAmount, getLineDiscountPercent, getLineGrossAmount, getLineTaxableAmount, getCountriesForRegion, TDS_SECTIONS, TCS_SECTIONS, TERMS_PRESETS, getActiveAccounts, getDefaultAccount, getAccountById, getDefaultUnitForMode, filterUnitsByMode } from '../utils';
import { ensureToken, findOrCreateFolder, uploadPDF } from '../services/googleDrive';
import DOMPurify from 'dompurify';
import InvoicePreview from './InvoicePreview';
import ClientModal from './ClientModal';
import BarcodeScannerInput from './BarcodeScannerInput';
import { toast } from './Toast';

// Normalize terms HTML/plain text from DB, drafts, or templates.
function normalizeTermsContent(content) {
  if (content == null) return '';
  if (typeof content !== 'string') return String(content);
  return content;
}

function termsHasText(content) {
  return normalizeTermsContent(content).replace(/<[^>]*>/g, '').trim().length > 0;
}

// Rich text editor — contentEditable with safe external sync (no update loops).
function RichEditor({ value, onChange, placeholder, toolbar = false }) {
  const ref = useRef(null);
  const lastHtmlRef = useRef('');
  const focusedRef = useRef(false);

  const syncFromValue = useCallback((nextValue, force = false) => {
    if (!ref.current) return;
    const sanitized = DOMPurify.sanitize(normalizeTermsContent(nextValue));
    if (!force && focusedRef.current) return;
    if (sanitized === lastHtmlRef.current && ref.current.innerHTML === sanitized) return;
    lastHtmlRef.current = sanitized;
    ref.current.innerHTML = sanitized;
  }, []);

  useEffect(() => {
    syncFromValue(value, false);
  }, [value, syncFromValue]);

  const handleInput = useCallback(() => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastHtmlRef.current = html;
    onChange(html);
  }, [onChange]);

  const applyFormat = (cmd, val) => {
    try {
      if (ref.current) ref.current.focus();
      document.execCommand(cmd, false, val);
      if (ref.current) {
        const html = ref.current.innerHTML;
        lastHtmlRef.current = html;
        onChange(html);
      }
    } catch (err) {
      console.error('RichEditor format failed:', err);
    }
  };
  const btnStyle = { padding: '0.2rem 0.5rem', fontSize: '0.78rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: 'pointer', minWidth: '28px' };

  return (
    <>
      {toolbar && (
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
          <button type="button" onClick={() => applyFormat('bold')}        title="Bold (Ctrl+B)"      style={{ ...btnStyle, fontWeight: 700 }}>B</button>
          <button type="button" onClick={() => applyFormat('italic')}      title="Italic (Ctrl+I)"    style={{ ...btnStyle, fontStyle: 'italic' }}>I</button>
          <button type="button" onClick={() => applyFormat('underline')}   title="Underline (Ctrl+U)" style={{ ...btnStyle, textDecoration: 'underline' }}>U</button>
          <span style={{ width: 1, background: 'var(--border-color)', margin: '0 0.2rem' }} />
          <button type="button" onClick={() => applyFormat('insertUnorderedList')} title="Bullet list"  style={btnStyle}>•&nbsp;List</button>
          <button type="button" onClick={() => applyFormat('insertOrderedList')}   title="Numbered list" style={btnStyle}>1.&nbsp;List</button>
          <span style={{ width: 1, background: 'var(--border-color)', margin: '0 0.2rem' }} />
          <button type="button" onClick={() => applyFormat('formatBlock', '<h4>')}  title="Heading"   style={{ ...btnStyle, fontWeight: 700, fontSize: '0.85rem' }}>H</button>
          <button type="button" onClick={() => applyFormat('formatBlock', '<p>')}   title="Paragraph" style={btnStyle}>¶</button>
          <button type="button" onClick={() => { const url = window.prompt('Link URL:'); if (url) applyFormat('createLink', url); }} title="Insert link" style={btnStyle}>🔗</button>
          <span style={{ width: 1, background: 'var(--border-color)', margin: '0 0.2rem' }} />
          <button type="button" onClick={() => applyFormat('removeFormat')} title="Clear formatting" style={btnStyle}>✕</button>
        </div>
      )}
      <div ref={ref} contentEditable suppressContentEditableWarning
        className="form-input rich-editor"
        onInput={handleInput}
        onFocus={() => { focusedRef.current = true; }}
        onBlur={() => { focusedRef.current = false; }}
        style={{ minHeight: '100px', whiteSpace: 'pre-wrap' }}
        data-placeholder={placeholder} />
    </>
  );
}

class TermsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Terms & Conditions render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="glass-panel p-6 mb-6" style={{ border: '1px solid #fecaca', background: '#fef2f2' }}>
          <h3 className="section-title" style={{ margin: '0 0 0.5rem', color: '#b91c1c' }}>Terms & Conditions</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#7f1d1d' }}>
            {this.state.error?.message || 'Something went wrong loading this section.'}
          </p>
          <button type="button" className="btn btn-secondary" style={{ marginTop: '0.75rem' }}
            onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Load draft from sessionStorage — validate shape so bad data cannot crash the page.
function loadDraft() {
  try {
    const saved = sessionStorage.getItem('gst_invoiceDraft');
    if (!saved) return null;
    const d = JSON.parse(saved);
    if (!d || typeof d !== 'object') return null;
    if (d.items != null && !Array.isArray(d.items)) delete d.items;
    if (d.extraSections != null && !Array.isArray(d.extraSections)) delete d.extraSections;
    return d;
  } catch {
    try { sessionStorage.removeItem('gst_invoiceDraft'); } catch { /* ignore */ }
    return null;
  }
}

const DEFAULT_LINE_ITEM = () => ({
  id: Date.now().toString(),
  name: '', hsn: '', quantity: 1, unit: 'Nos', rate: 0, discountPercent: 0, discount: 0, taxPercent: 18, cessPercent: 0,
});

const DEFAULT_OPTIONS = {
  showGST: true,
  showState: true,
  showGSTIN: true,
  showPlaceOfSupply: true,
  showHSN: true,
  showDiscount: true,
  showBankDetails: true,
  showUPI: true,
  showLogo: true,
  showSignature: true,
  showTerms: true,
  showNotes: true,
  showAmountWords: true,
  showDueDate: true,
  showItemQty: true,
  showRoundOff: false,
  manualAdjustment: 0,   // +0.60 add, −0.40 less — rounds Grand Total
  invoiceMode: 'goods',    // 'goods' | 'services' | 'mixed' — drives default unit + dropdown filter
  recurring: null,         // null OR { enabled, frequency, interval, nextDate, endMode, endDate, maxOccurrences }
  showCess: false,         // when true, exposes per-line Cess % input (India-only)
  reverseCharge: false,    // when true, GST is paid by the recipient (Section 9(3)/9(4))
  showTDS: false,
  tdsSection: '194Q',
  tdsRate: 0,
  showTCS: false,
  tcsSection: '206C(1H)',
  tcsRate: 0.1,
  customTitle: '',
  currency: 'INR',
  exchangeRate: '',
  selectedAccountId: null,   // null ⇒ resolve via last-used / default / first-active at render time
  showAccountLabel: false,   // when true, prints "Pay via: <account label>" above the bank block
  accentColor: '',
  pdfStyle: 'gst',
};

const ACCENT_PRESETS = [
  { color: '#1e40af', label: 'Blue' },
  { color: '#7c3aed', label: 'Purple' },
  { color: '#0f766e', label: 'Teal' },
  { color: '#be123c', label: 'Red' },
  { color: '#c2410c', label: 'Orange' },
  { color: '#15803d', label: 'Green' },
  { color: '#0369a1', label: 'Sky' },
  { color: '#1e293b', label: 'Dark' },
];

const PDF_STYLES = [
  { id: 'gst', label: 'GST Professional', desc: 'A4 bordered layout for Tax Invoice / Credit Note' },
  { id: 'modern', label: 'Modern', desc: 'Bold header with color block' },
  { id: 'minimal', label: 'Minimal', desc: 'Simple, borderless layout' },
];

/** Logo/signature live in user_settings — merge them onto any business-profile snapshot. */
function mergeProfileBranding(base, branding) {
  if (!base) return branding || null;
  if (!branding) return base;
  return {
    ...base,
    logo: branding.logo || base.logo || '',
    logoHeight: branding.logoHeight ?? base.logoHeight ?? 48,
    signature: branding.signature || base.signature || '',
  };
}

/** Ensure embedded images are decoded before html2canvas captures the invoice. */
function waitForImages(root) {
  if (!root) return Promise.resolve();
  return Promise.all(
    Array.from(root.querySelectorAll('img')).map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        if (img.src?.startsWith('data:')) {
          const src = img.src;
          img.src = '';
          img.src = src;
        }
      });
    }),
  );
}

export default function InvoiceGenerator({ onBack, profile: profileProp, editingBill }) {
  const draft = loadDraft();
  const [allProfiles, setAllProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(profileProp);
  const profile = activeProfile || profileProp;

  // Always pull the latest saved profile from storage and merge branding (logo,
  // signature) so invoices never lose images when a stale business-profile snapshot
  // or App-level profileProp is used.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const latest = await getProfile();
        if (cancelled) return;
        const base = latest?.businessName?.trim()
          ? latest
          : (profileProp?.businessName?.trim() ? profileProp : null);
        if (base) setActiveProfile(mergeProfileBranding(base, latest));
      } catch {
        if (!cancelled && profileProp) setActiveProfile(profileProp);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [profileProp]);
  const [invoiceType, setInvoiceType] = useState(draft?.invoiceType || 'tax-invoice');
  const [client, setClient] = useState(draft?.client || { name: '', address: '', city: '', pin: '', state: '', gstin: '', country: '' });
  const [details, setDetails] = useState(draft?.details || {
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    placeOfSupply: '',
    originalInvoiceRef: '',
  });

  const [items, setItems] = useState(() => {
    const d = loadDraft();
    const rows = Array.isArray(d?.items) ? d.items.filter(Boolean) : [];
    return rows.length > 0 ? rows : [DEFAULT_LINE_ITEM()];
  });
  const [units, setUnits] = useState(getAllUnits());
  const [taxInclusive, setTaxInclusive] = useState(draft?.taxInclusive || false);

  const [totals, setTotals] = useState({ subtotal: 0, totalDiscount: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [termsTemplates, setTermsTemplates] = useState([]);
  const [selectedTermsId, setSelectedTermsId] = useState(draft?.selectedTermsId || '');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [customTerms, setCustomTerms] = useState(draft?.customTerms || '');
  const [termsSaving, setTermsSaving] = useState(false);
  const [termsLoading, setTermsLoading] = useState(false);
  const [termsInitError, setTermsInitError] = useState('');
  const [customNotes, setCustomNotes] = useState(draft?.customNotes || '');
  const [internalNote, setInternalNote] = useState(draft?.internalNote || '');
  const [extraSections, setExtraSections] = useState(() => {
    const d = loadDraft();
    return Array.isArray(d?.extraSections) ? d.extraSections.filter(Boolean) : [];
  });
  const [savedClients, setSavedClients] = useState([]);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [modalClient, setModalClient] = useState(null);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const clientNameRef = useRef(null);
  const clientSuggestionsRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [itemsMaster, setItemsMaster] = useState([]);
  const [productSearch, setProductSearch] = useState({ itemId: null, query: '' });
  const [invoiceOptions, setInvoiceOptions] = useState(() => {
    try {
      const saved = localStorage.getItem('freegstbill_invoiceOptions');
      const persisted = saved ? JSON.parse(saved) : {};
      // Persisted options are the user's defaults, draft can override for in-progress work
      return { ...DEFAULT_OPTIONS, ...persisted, ...(draft?.invoiceOptions || {}), showDiscount: true, showTDS: false };
    } catch { return draft?.invoiceOptions || { ...DEFAULT_OPTIONS }; }
  });
  const [showOptions, setShowOptions] = useState(false);
  const printRef = useRef(null);
  const draftInitialized = useRef(!!draft);
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const autoSaveTimer = useRef(null);
  const stockDeducted = useRef(!!editingBill); // skip stock deduction for existing invoices
  const hasInitialized = useRef(false); // prevent auto-save during initial load

  const typeConfig = INVOICE_TYPES[invoiceType] || INVOICE_TYPES['tax-invoice'];
  const showGST = invoiceOptions.showGST;
  // Tax label and rate presets follow the seller's country, not the client's, since
  // the seller charges and remits the tax. Sellers without a country fall back to India.
  const sellerCountryConfig = getCountryConfig(profile?.country);
  const countryTaxRates = sellerCountryConfig.taxRates && sellerCountryConfig.taxRates.length
    ? sellerCountryConfig.taxRates
    : [0, 5, 12, 18, 28];
  const taxLabel = sellerCountryConfig.taxLabel || 'GST';

  const clampPercent = (raw) => {
    const n = parseFloat(raw);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(100, n);
  };

  // Clamp a numeric input to non-negative (and finite). Used for qty/rate.
  const clampNonNeg = (raw) => {
    const n = parseFloat(raw);
    if (!isFinite(n) || n < 0) return 0;
    return n;
  };

  // Persist options to both localStorage (instant) and server (durable)
  useEffect(() => {
    localStorage.setItem('freegstbill_invoiceOptions', JSON.stringify(invoiceOptions));
    if (hasInitialized.current) {
      saveInvoiceDisplayOptions(invoiceOptions).catch(() => {});
    }
  }, [invoiceOptions]);

  // Load saved display options from server on mount (overrides localStorage if available)
  useEffect(() => {
    getInvoiceDisplayOptions().then(serverOpts => {
      if (serverOpts) {
        const merged = { ...DEFAULT_OPTIONS, ...serverOpts, showDiscount: true, showTDS: false };
        setInvoiceOptions(prev => {
          // Only update if different to avoid unnecessary re-renders
          const changed = Object.keys(merged).some(k => merged[k] !== prev[k]);
          if (changed) {
            localStorage.setItem('freegstbill_invoiceOptions', JSON.stringify(merged));
            return merged;
          }
          return prev;
        });
      }
    }).catch(() => {});
  }, []);

  // Auto-save draft to sessionStorage
  useEffect(() => {
    const draftData = { invoiceType, client, details, items, customTerms, customNotes, internalNote, extraSections, selectedTermsId, invoiceOptions, taxInclusive };
    sessionStorage.setItem('gst_invoiceDraft', JSON.stringify(draftData));
  }, [invoiceType, client, details, items, customTerms, customNotes, internalNote, extraSections, selectedTermsId, invoiceOptions, taxInclusive]);

  // Mark initialized after first render cycle so auto-save doesn't trigger on load
  useEffect(() => {
    const t = setTimeout(() => { hasInitialized.current = true; }, 1500);
    return () => clearTimeout(t);
  }, []);

  // An invoice is "meaningful" once it has a client name AND at least one line item
  // with a description and a non-zero amount. Until then we only auto-save to
  // sessionStorage (draft) — never to the persistent bills list. This prevents the
  // bug where opening "New Invoice" and clicking away saves an empty bill to the list.
  const isMeaningfulInvoice = useCallback(() => {
    if (editingBill) return true; // editing an existing bill — always persist changes
    if (!client?.name?.trim()) return false;
    return items.some(item => (item.name || '').trim() && (item.quantity || 0) * (item.rate || 0) > 0);
  }, [client?.name, items, editingBill]);

  // Debounced auto-save to server (2s after last change), gated on meaningful content.
  useEffect(() => {
    if (!hasInitialized.current) return;
    if (!details.invoiceNumber) return;
    if (!isMeaningfulInvoice()) {
      // Reset status badge if user emptied the invoice — stops "All changes saved" from lying.
      setAutoSaveStatus(s => s === 'saved' ? 'idle' : s);
      return;
    }

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        setAutoSaveStatus('saving');
        await saveInvoiceToDB(true);
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus(s => s === 'saved' ? 'idle' : s), 2000);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setAutoSaveStatus('idle');
      }
    }, 2000);

    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [invoiceType, client, details, items, customTerms, customNotes, internalNote, extraSections, invoiceOptions, isMeaningfulInvoice]);

  // Save-before-leave guard. If the user has typed something real but the auto-save hasn't
  // landed yet, prompt before they navigate away — works for the in-app Back button and
  // for browser-level navigation (refresh, close tab).
  const handleBack = async () => {
    if (isMeaningfulInvoice() && autoSaveStatus !== 'saved') {
      const choice = window.confirm('You have unsaved changes on this invoice.\n\nClick OK to save and exit, or Cancel to keep editing.');
      if (!choice) return; // stay on the page
      try {
        setAutoSaveStatus('saving');
        await saveInvoiceToDB(true);
        toast('Invoice saved', 'success');
      } catch {
        toast('Save failed — staying on the page so you can retry', 'error');
        return;
      }
    }
    clearDraft();
    onBack();
  };

  useEffect(() => {
    const handler = (e) => {
      if (isMeaningfulInvoice() && autoSaveStatus !== 'saved') {
        e.preventDefault();
        e.returnValue = ''; // browsers show their own confirmation dialog
        return '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isMeaningfulInvoice, autoSaveStatus]);

  const clearDraft = () => {
    sessionStorage.removeItem('gst_invoiceDraft');
  };

  // Load terms templates, saved clients, and default terms from cloud
  useEffect(() => {
    getAllProfiles().then(p => { setAllProfiles(p); if (!activeProfile && p.length > 0) setActiveProfile(profileProp); }).catch(() => {});

    const initTermsAndClients = async () => {
      try {
        setTermsInitError('');
        if (isSupabaseMode()) {
          const session = await waitForSession(8);
          if (!session) return; // not signed in yet — page still works with empty terms
        }
        const templates = (await getTermsTemplates()).filter(t => t && typeof t === 'object');
        setTermsTemplates(templates);

        if (!editingBill) {
          const draftHasTerms = termsHasText(draft?.customTerms);
          if (!draftHasTerms) {
            let loaded = false;
            try {
              const saved = await getDefaultInvoiceTerms();
              if (termsHasText(saved?.content)) {
                setCustomTerms(normalizeTermsContent(saved.content));
                if (saved.templateId) setSelectedTermsId(String(saved.templateId));
                loaded = true;
              }
            } catch (err) {
              console.warn('Default terms load skipped:', err?.message || err);
            }
            if (!loaded && templates.length > 0 && templates[0]) {
              setSelectedTermsId(String(templates[0].id || ''));
              setCustomTerms(normalizeTermsContent(templates[0].content));
            }
          } else if (draft?.selectedTermsId) {
            setSelectedTermsId(String(draft.selectedTermsId));
            setCustomTerms(normalizeTermsContent(draft.customTerms));
          }
        }
      } catch (err) {
        console.error('Terms init failed:', err);
        setTermsInitError(err?.message || 'Could not load terms & conditions');
      }
    };

    initTermsAndClients();

    getAllClients().then(clients => {
      setSavedClients(clients);
      if (client.name.trim()) {
        const match = clients.find(c => c.name.toLowerCase() === client.name.trim().toLowerCase());
        if (match) setSelectedClientId(match.id);
      }
    });
    getAllProducts().then(setProducts);
    getAllItems().then(setItemsMaster);
  }, []);

  // Assign invoice number (never crash the page if cloud/API is unavailable)
  const assignInvoiceNumber = useCallback(async (prefix = 'INV') => {
    try {
      const num = await getNextInvoiceNumber(prefix);
      if (num) {
        setDetails(prev => ({ ...prev, invoiceNumber: num }));
        return num;
      }
    } catch (err) {
      console.error('Invoice number generation failed:', err);
      toast('Using temporary invoice number — check connection or sign in again', 'warning');
    }
    const yr = new Date().getFullYear();
    const fallback = `${prefix}/${yr}/${String(Date.now()).slice(-4)}`;
    setDetails(prev => ({ ...prev, invoiceNumber: prev.invoiceNumber || fallback }));
    return fallback;
  }, []);

  // Initialize from editing bill or generate new number (skip if restoring from draft)
  useEffect(() => {
    if (draftInitialized.current) {
      draftInitialized.current = false;
      return;
    }
    if (editingBill?.data) {
      const d = editingBill.data;
      setClient(d.client || { name: '', address: '', city: '', pin: '', state: '', gstin: '', country: '' });
      setItems(Array.isArray(d.items) && d.items.length ? d.items : [DEFAULT_LINE_ITEM()]);
      setInvoiceType(d.invoiceType || 'tax-invoice');
      if (d.customTerms !== undefined) setCustomTerms(typeof d.customTerms === 'string' ? d.customTerms : String(d.customTerms || ''));
      if (d.customNotes !== undefined) setCustomNotes(d.customNotes);
      if (d.internalNote !== undefined) setInternalNote(d.internalNote);
      if (d.extraSections) setExtraSections(d.extraSections);
      if (d.taxInclusive !== undefined) setTaxInclusive(d.taxInclusive);
      if (d.invoiceOptions) {
        // User's persisted defaults as base, bill options overlay
        try {
          const saved = localStorage.getItem('freegstbill_invoiceOptions');
          const persisted = saved ? JSON.parse(saved) : {};
          setInvoiceOptions({ ...DEFAULT_OPTIONS, ...persisted, ...d.invoiceOptions });
        } catch { setInvoiceOptions({ ...DEFAULT_OPTIONS, ...d.invoiceOptions }); }
      }

      if (editingBill._isDuplicate) {
        const convertType = editingBill._convertToType;
        const type = convertType || d.invoiceType || 'tax-invoice';
        if (convertType) {
          setInvoiceType(convertType);
          const config = INVOICE_TYPES[convertType];
          if (config) setInvoiceOptions(prev => ({ ...prev, showGST: config.showGST, showPlaceOfSupply: config.showGST }));
        }
        const prefix = INVOICE_TYPES[type]?.prefix || 'INV';
        assignInvoiceNumber(prefix).then((num) => {
          setDetails({ ...d.details, invoiceNumber: num || d.details?.invoiceNumber || '', invoiceDate: new Date().toISOString().split('T')[0] });
        });
      } else {
        setDetails(d.details || {});
      }
    } else if (!details.invoiceNumber) {
      assignInvoiceNumber('INV');
    }
  }, [editingBill, assignInvoiceNumber]);

  // Seed the payment-account selection on first render. For a freshly-created
  // invoice (no editingBill, no value yet) we look up the last-used account for
  // this profile in localStorage, falling back to the profile's ⭐ default,
  // then the first active account. Resolving here once means the dropdown shows
  // the right value immediately rather than flickering through nulls.
  useEffect(() => {
    if (editingBill) return; // editing — keep whatever the bill stored
    if (invoiceOptions.selectedAccountId) return; // already set
    if (!profile) return;
    const lastUsedKey = `gst_lastUsedAccountId_${profile.id || profile.businessName || 'default'}`;
    let candidate = null;
    try { candidate = localStorage.getItem(lastUsedKey); } catch { /* sandboxed */ }
    const active = getActiveAccounts(profile);
    const resolves = candidate && active.some(a => a.id === candidate);
    const next = resolves ? candidate : (getDefaultAccount(profile)?.id || active[0]?.id || null);
    if (next) setInvoiceOptions(prev => ({ ...prev, selectedAccountId: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.businessName, editingBill]);

  // Persist the just-used account to localStorage so the NEXT new invoice on
  // this profile defaults to the same one. Saved on every change rather than
  // only on Save so power users typing through 5 invoices in a row get sticky
  // behaviour even if they navigate without saving each one.
  useEffect(() => {
    if (!profile || !invoiceOptions.selectedAccountId) return;
    const lastUsedKey = `gst_lastUsedAccountId_${profile.id || profile.businessName || 'default'}`;
    try { localStorage.setItem(lastUsedKey, invoiceOptions.selectedAccountId); } catch { /* ignore */ }
  }, [profile?.id, profile?.businessName, invoiceOptions.selectedAccountId]);

  // When loading a saved bill, prefer the LIVE business profile that matches the bill's
  // snapshot (by id, falling back to businessName). Means a Settings rename / address
  // edit / new logo flows through to all historical invoices on next PDF render. Falls
  // back to the snapshot if that profile was deleted. Branding always comes from the
  // canonical user_settings profile so signature/logo are never dropped.
  useEffect(() => {
    if (!editingBill?.data?.profile || allProfiles.length === 0) return;
    const snap = editingBill.data.profile;
    const liveMatch = allProfiles.find(p =>
      (p.id && snap.id && p.id === snap.id) ||
      (p.businessName && p.businessName === snap.businessName)
    );
    if (!liveMatch) return;
    let cancelled = false;
    getProfile().then((latest) => {
      if (cancelled) return;
      setActiveProfile(mergeProfileBranding(liveMatch, latest));
    }).catch(() => {
      if (!cancelled) setActiveProfile(liveMatch);
    });
    return () => { cancelled = true; };
  }, [editingBill, allProfiles]);

  const handleTypeChange = async (type) => {
    setInvoiceType(type);
    const config = INVOICE_TYPES[type];
    const prefix = config?.prefix || 'INV';
    const num = await getNextInvoiceNumber(prefix);
    setDetails(prev => ({ ...prev, invoiceNumber: num }));

    // Auto-set options based on type
    if (type === 'bill-of-supply') {
      setInvoiceOptions(prev => ({ ...prev, showGST: false, showPlaceOfSupply: false }));
    } else {
      setInvoiceOptions(prev => ({ ...prev, showGST: config.showGST, showPlaceOfSupply: config.showGST }));
    }
  };

  const toggleOption = (key) => {
    setInvoiceOptions(prev => {
      const offByDefault = key === 'showRoundOff' || key === 'showAccountLabel'
        || key === 'showCess' || key === 'reverseCharge';
      const currentlyOn = offByDefault ? !!prev[key] : prev[key] !== false;
      return { ...prev, [key]: !currentlyOn };
    });
  };

  // Recalculate totals
  useEffect(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let taxTotal = 0;
    let cessTotal = 0; // GST Compensation Cess — separate from CGST/SGST/IGST,
                        // applies to specific HSN ranges (tobacco, auto, coal, etc.)

    items.forEach(item => {
      const line = calculateLineItemTax(item, taxInclusive && showGST);
      const cessPercent = Number(item.cessPercent) || 0;

      subtotal += line.amount;
      totalDiscount += line.discount;
      // GST/CGST/SGST/IGST always on post-discount taxable value — never on gross.
      if (showGST) taxTotal += line.taxAmount;
      if (showGST && cessPercent > 0) {
        cessTotal += (line.afterDiscount * cessPercent) / 100;
      }
    });

    const businessState = profile?.state?.trim().toLowerCase();
    const clientState = client?.state?.trim().toLowerCase();
    // GST law follows the *place of supply* — when set explicitly (e.g. goods consumed in
    // a third state), it overrides the client's registered address.
    const placeOfSupply = details?.placeOfSupply?.trim().toLowerCase() || clientState;
    const isIndia = (profile?.country || 'India') === 'India';
    // SEZ supplies are zero-rated under IGST regardless of state (Section 16, IGST Act).
    const isSEZ = !!client?.isSEZ;
    // Inter/intra-state CGST/SGST/IGST split is India-specific. Outside India, all tax goes
    // into one bucket (we use IGST as the single-tax slot to keep the data shape stable).
    const isInterstate = isIndia && (isSEZ || (businessState && placeOfSupply && businessState !== placeOfSupply));
    const cgst = isIndia ? (isInterstate ? 0 : taxTotal / 2) : 0;
    const sgst = isIndia ? (isInterstate ? 0 : taxTotal / 2) : 0;
    const igst = isIndia ? (isInterstate ? taxTotal : 0) : taxTotal;

    const taxableForTDS = subtotal - totalDiscount; // TDS/TCS apply to taxable value, not GST-inclusive total
    const baseTotal = taxInclusive && showGST ? subtotal - totalDiscount : subtotal - totalDiscount + taxTotal;

    // TCS is collected from the buyer and ADDED to the invoice total.
    // TDS is deducted by the buyer from their payment to us — informational only,
    // does NOT change the invoice total.
    const round2 = (n) => Math.round(n * 100) / 100;
    const tcsAmount = invoiceOptions.showTCS && Number(invoiceOptions.tcsRate) > 0
      ? round2(taxableForTDS * Number(invoiceOptions.tcsRate) / 100) : 0;
    const tdsAmount = invoiceOptions.showTDS && Number(invoiceOptions.tdsRate) > 0
      ? round2(taxableForTDS * Number(invoiceOptions.tdsRate) / 100) : 0;

    // Cess is added on top — same treatment as TCS but a GST-side number, not Income-Tax.
    const cessRounded = round2(cessTotal);
    const totalBeforeRound = baseTotal + tcsAmount + cessRounded;
    const manualAdj = round2(Number(invoiceOptions.manualAdjustment) || 0);
    const autoRound = invoiceOptions.showRoundOff ? calculateRoundOff(totalBeforeRound + manualAdj) : 0;
    const roundOff = round2(autoRound);
    const adjustment = manualAdj;
    const finalTotal = totalBeforeRound + roundOff + adjustment;

    if (taxInclusive && showGST) {
      // Tax-inclusive: total is the subtotal minus discount (already includes tax)
      const taxableAmount = (subtotal - totalDiscount) - taxTotal;
      setTotals({
        subtotal,
        totalDiscount,
        taxableAmount,
        cgst, sgst, igst,
        cess: cessRounded,
        roundOff,
        adjustment,
        tcsAmount,
        tdsAmount,
        total: finalTotal,
        netReceivable: finalTotal - tdsAmount, // what we actually receive after buyer deducts TDS
        taxInclusive: true,
      });
    } else {
      setTotals({
        subtotal,
        totalDiscount,
        taxableAmount: subtotal - totalDiscount,
        cgst, sgst, igst,
        cess: cessRounded,
        roundOff,
        adjustment,
        tcsAmount,
        tdsAmount,
        total: finalTotal,
        netReceivable: finalTotal - tdsAmount,
        taxInclusive: false,
      });
    }
  }, [items, client.state, profile?.state, profile?.country, showGST, taxInclusive, invoiceOptions.showRoundOff, invoiceOptions.manualAdjustment, invoiceOptions.showTDS, invoiceOptions.tdsRate, invoiceOptions.showTCS, invoiceOptions.tcsRate]);

  // Warn when the seller's state is missing for Indian GST invoices — without it, the
  // interstate detection silently defaults to intrastate (CGST+SGST) which is a real money bug.
  useEffect(() => {
    const isIndia = (profile?.country || 'India') === 'India';
    if (!isIndia || !showGST) return;
    if (!profile?.state && client?.state) {
      const key = `gst_stateWarning_${profile?.businessName || 'profile'}`;
      if (!sessionStorage.getItem(key)) {
        toast('Set your business State in Settings — required for correct CGST/SGST vs IGST split.', 'warning');
        sessionStorage.setItem(key, '1');
      }
    }
  }, [profile?.state, profile?.country, profile?.businessName, client?.state, showGST]);

  const handleItemChange = (id, field, value) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    if (field === 'name') {
      setProductSearch({ itemId: id, query: value });
    }
  };

  const selectProduct = (itemId, product) => {
    setItems(prev => prev.map(item => item.id === itemId ? {
      ...item,
      name: product.name,
      hsn: product.hsn || '',
      rate: product.rate || 0,
      unit: product.unit || item.unit || 'Nos',
      taxPercent: product.taxPercent ?? (countryTaxRates[countryTaxRates.length - 2] ?? 18),
      productId: product.id,
    } : item));
    setProductSearch({ itemId: null, query: '' });
  };

  const addProductToBill = (product, masterItem) => {
    const rate = product?.rate || masterItem?.salePrice || masterItem?.mrp || 0;
    const existingIdx = items.findIndex(
      line => line.productId && product?.id && line.productId === product.id
    );
    if (existingIdx >= 0) {
      setItems(prev => prev.map((line, idx) => idx === existingIdx
        ? { ...line, quantity: (parseFloat(line.quantity) || 0) + 1 }
        : line
      ));
      toast(`+1 ${product?.name || masterItem?.name}`, 'success');
      return;
    }
    const defaultUnit = items.length > 0 && items[items.length - 1].unit
      ? items[items.length - 1].unit
      : getDefaultUnitForMode(invoiceOptions.invoiceMode);
    const emptyRow = items.find(line => !line.name?.trim() && !line.productId);
    const newLine = {
      id: Date.now().toString(),
      name: product?.name || masterItem?.name || '',
      hsn: product?.hsn || masterItem?.hsn || '',
      quantity: 1,
      unit: product?.unit || defaultUnit,
      rate,
      discountPercent: 0,
      discount: 0,
      taxPercent: product?.taxPercent ?? (showGST ? (countryTaxRates[countryTaxRates.length - 2] ?? 18) : 0),
      cessPercent: 0,
      productId: product?.id || '',
    };
    if (emptyRow) {
      setItems(prev => prev.map(line => line.id === emptyRow.id ? { ...newLine, id: line.id } : line));
    } else {
      setItems(prev => [...prev, newLine]);
    }
    toast(`Added: ${newLine.name}`, 'success');
  };

  const handleBarcodeScan = (barcode) => {
    const { item, product } = resolveBarcodeLookup(barcode, itemsMaster, products);
    if (!item && !product) {
      toast(`No item found for barcode: ${barcode}`, 'warning');
      return;
    }
    addProductToBill(product, item);
  };

  const getProductSuggestions = (itemId) => {
    if (productSearch.itemId !== itemId || !productSearch.query.trim()) return [];
    const q = productSearch.query.toLowerCase();
    return products.filter(p =>
      p.name?.toLowerCase().includes(q)
      || p.hsn?.toLowerCase().includes(q)
      || p.barcode?.toLowerCase().includes(q)
      || itemsMaster.some(i => String(i.id) === String(p.itemId) && i.barcode?.toLowerCase().includes(q))
    ).slice(0, 5);
  };

  const addItem = () => {
    // Default unit depends on whether this invoice is for goods or services —
    // freelancers and consultants get 'Hrs' by default, retailers/manufacturers
    // get 'Nos'. The dropdown still shows the user's last-used unit if they've
    // overridden a previous row.
    const defaultUnit = items.length > 0 && items[items.length - 1].unit
      ? items[items.length - 1].unit
      : getDefaultUnitForMode(invoiceOptions.invoiceMode);
    setItems(prev => [...prev, {
      id: Date.now().toString(), name: '', hsn: '', quantity: 1, unit: defaultUnit, rate: 0, discountPercent: 0, discount: 0,
      taxPercent: showGST ? (countryTaxRates[countryTaxRates.length - 2] ?? 18) : 0,
      cessPercent: 0,
    }]);
  };

  // Custom unit handler — prompts for a label, persists to localStorage, applies to current item.
  const handleAddCustomUnit = (itemId) => {
    const label = (typeof window !== 'undefined' ? window.prompt('New unit (e.g. Carat, Bundle, Bushel):') : '');
    if (!label) return;
    const trimmed = label.trim();
    if (!trimmed) return;
    if (trimmed.length > 20) { toast('Unit name must be 20 characters or fewer', 'warning'); return; }
    const ok = addCustomUnit(trimmed);
    setUnits(getAllUnits());
    if (!ok) {
      toast(`Unit "${trimmed}" already exists or is reserved`, 'info');
    } else {
      toast(`Unit "${trimmed}" added`, 'success');
    }
    handleItemChange(itemId, 'unit', trimmed);
  };

  const handleRemoveCustomUnit = (label) => {
    if (!confirm(`Remove custom unit "${label}"? Existing invoices keep this label, but it will no longer appear in dropdowns.`)) return;
    removeCustomUnit(label);
    setUnits(getAllUnits());
    toast(`Removed custom unit "${label}"`, 'success');
  };

  const removeItem = (id) => {
    if (items.length > 1) setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleTermsSelect = (templateId) => {
    setSelectedTermsId(templateId);
    if (!templateId) return;
    const tpl = termsTemplates.find(t => t && String(t.id) === String(templateId));
    if (tpl) {
      setCustomTerms(normalizeTermsContent(tpl.content));
      toast(`Loaded template: ${tpl.name || 'Saved terms'}`, 'success');
    } else {
      toast('Template not found', 'warning');
    }
  };

  const handleInsertPreset = () => {
    if (!selectedPresetId) {
      toast('Select a business type preset first', 'warning');
      return;
    }
    const preset = TERMS_PRESETS.find(p => p.id === selectedPresetId);
    if (!preset?.body) {
      toast('Preset not found', 'error');
      return;
    }
    if (termsHasText(customTerms)) {
      if (!confirm('Replace your current Terms with this preset? Your existing text will be lost.')) {
        return;
      }
    }
    setCustomTerms(normalizeTermsContent(preset.body));
    setSelectedTermsId('');
    toast(`Inserted "${preset.label}" preset`, 'success');
  };

  const handleLoadTerms = async () => {
    setTermsLoading(true);
    setTermsInitError('');
    try {
      const saved = await getDefaultInvoiceTerms();
      if (termsHasText(saved?.content)) {
        setCustomTerms(normalizeTermsContent(saved.content));
        setSelectedTermsId(saved.templateId ? String(saved.templateId) : '');
        toast(
          isSupabaseMode() ? 'Loaded saved terms from cloud' : 'Loaded saved terms',
          'success',
        );
        return;
      }

      const templates = (await getTermsTemplates()).filter(t => t && typeof t === 'object');
      setTermsTemplates(templates);
      if (templates.length > 0 && templates[0]) {
        setCustomTerms(normalizeTermsContent(templates[0].content));
        setSelectedTermsId(String(templates[0].id || ''));
        toast(`Loaded template: ${templates[0].name || 'Saved terms'}`, 'success');
      } else {
        toast('No saved terms found — type your terms and click Save', 'warning');
      }
    } catch (err) {
      console.error('Load terms failed:', err);
      setTermsInitError(err?.message || 'Failed to load terms');
      toast(err?.message || 'Failed to load terms', 'error');
    } finally {
      setTermsLoading(false);
    }
  };

  const handleSaveTerms = async () => {
    if (!termsHasText(customTerms)) {
      toast('Enter terms before saving', 'warning');
      return;
    }
    setTermsSaving(true);
    setTermsInitError('');
    try {
      const content = normalizeTermsContent(customTerms);
      let templateId = selectedTermsId;

      if (selectedTermsId) {
        const tpl = termsTemplates.find(t => t && String(t.id) === String(selectedTermsId));
        if (tpl) {
          await saveTermsTemplate({ ...tpl, content });
        }
      } else {
        const savedTpl = await saveTermsTemplate({
          id: 'user_default',
          name: 'My Saved Terms',
          content,
        });
        templateId = savedTpl?.id || 'user_default';
        const updated = (await getTermsTemplates()).filter(t => t && typeof t === 'object');
        setTermsTemplates(updated);
        setSelectedTermsId(String(templateId));
      }

      await saveDefaultInvoiceTerms({ content, templateId: templateId || '' });
      toast(
        isSupabaseMode()
          ? 'Terms & Conditions saved permanently to cloud'
          : 'Terms & Conditions saved',
        'success',
      );
    } catch (err) {
      console.error('Save terms failed:', err);
      setTermsInitError(err?.message || 'Failed to save terms');
      toast(err?.message || 'Failed to save terms', 'error');
    } finally {
      setTermsSaving(false);
    }
  };

  const selectSavedClient = (cli) => {
    setClient({ name: cli.name, address: cli.address || '', city: cli.city || '', pin: cli.pin || '', state: cli.state || '', gstin: cli.gstin || '' });
    setSelectedClientId(cli.id);
    setShowClientSuggestions(false);
    toast(`Loaded client: ${cli.name}`, 'info');
  };

  // Open modal to add new client (pre-fill from current invoice fields)
  const openAddClientModal = () => {
    setModalClient({ name: client.name || '', address: client.address || '', city: client.city || '', pin: client.pin || '', state: client.state || '', gstin: client.gstin || '' });
    setIsEditingClient(false);
    setShowClientModal(true);
    setShowClientSuggestions(false);
  };

  // Open modal to edit existing saved client
  const openEditClientModal = (cli) => {
    setModalClient(cli);
    setIsEditingClient(true);
    setShowClientModal(true);
  };

  // Save from modal (add or update)
  const handleClientModalSave = async (formData) => {
    const data = { ...formData };
    if (isEditingClient && modalClient?.id) data.id = modalClient.id;
    await saveClient(data);
    const updated = await getAllClients();
    setSavedClients(updated);
    // Also update the invoice form fields
    setClient({ name: data.name, address: data.address, city: data.city || '', pin: data.pin || '', state: data.state, gstin: data.gstin });
    if (isEditingClient && modalClient?.id) {
      setSelectedClientId(modalClient.id);
      toast(`Client "${data.name}" updated!`, 'success');
    } else {
      const found = updated.find(c => c.name === data.name.trim() && !savedClients.some(old => old.id === c.id));
      if (found) setSelectedClientId(found.id);
      toast(`Client "${data.name}" saved!`, 'success');
    }
    setShowClientModal(false);
  };

  // Filter saved clients based on typed name
  const filteredClients = client.name.trim()
    ? savedClients.filter(cli => cli.name.toLowerCase().includes(client.name.trim().toLowerCase()))
    : savedClients;

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (clientSuggestionsRef.current && !clientSuggestionsRef.current.contains(e.target) &&
          clientNameRef.current && !clientNameRef.current.contains(e.target)) {
        setShowClientSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const saveInvoiceToDB = async (skipStockDeduction = false) => {
    const bill = {
      id: details.invoiceNumber,
      clientName: client.name,
      invoiceNumber: details.invoiceNumber,
      invoiceDate: details.invoiceDate,
      invoiceType,
      currency: invoiceOptions.currency || 'INR',
      totalAmount: totals.total,
      totalTaxAmount: totals.cgst + totals.sgst + totals.igst,
      status: editingBill?.status || 'unpaid',
      paidAmount: editingBill?.paidAmount || 0,
      payments: editingBill?.payments || [],
      data: { profile, client, details, items, totals, invoiceType, customTerms, customNotes, internalNote, extraSections, invoiceOptions, taxInclusive }
    };
    await saveBill(bill);

    // If the user ticked "Make this recurring", create/update the recurring
    // template alongside the invoice. We store enough on the template to
    // regenerate identical future invoices: client snapshot + items +
    // invoice options. Server-side processDueRecurring uses these.
    if (invoiceOptions.recurring?.enabled) {
      try {
        const rec = invoiceOptions.recurring;
        const templateId = `tpl_${details.invoiceNumber}`; // stable: tied to source invoice number
        await saveRecurring({
          id: templateId,
          sourceInvoiceId: details.invoiceNumber,
          active: true,
          frequency: rec.frequency || 'monthly',
          interval: rec.interval || 1,
          nextDate: rec.nextDate,
          endMode: rec.endMode || 'never',
          endDate: rec.endDate || '',
          maxOccurrences: rec.maxOccurrences || null,
          occurrencesCreated: 0,
          createdAt: new Date().toISOString(),
          lastGenerated: null,
          // Snapshot the data needed to regenerate. Profile is resolved live at
          // generation time (so business renames flow through), but client,
          // items, invoiceType, customTerms, etc. are frozen as the user wants
          // them on every recurring instance.
          clientName: client.name,
          clientState: client.state,
          clientGstin: client.gstin,
          clientAddress: client.address,
          clientCountry: client.country,
          clientCity: client.city,
          clientPin: client.pin,
          clientEmail: client.email,
          clientPhone: client.phone,
          isSEZ: client.isSEZ,
          invoiceType,
          profileId: profile?.id || null,
          profileBusinessName: profile?.businessName || null,
          items: items.map(i => ({ ...i })),
          customTerms,
          customNotes,
          extraSections,
          taxInclusive,
          invoiceOptions: { ...invoiceOptions, recurring: null }, // strip the recurring config from clones
        });
      } catch (err) {
        console.error('Failed to save recurring template:', err);
        toast('Invoice saved, but recurring template failed to save', 'warning');
      }
    }

    // Auto-deduct stock only once for new invoices (not edits, not auto-saves)
    if (!skipStockDeduction && !stockDeducted.current) {
      stockDeducted.current = true;
      const currentProducts = await getAllProducts();
      const lowStockWarnings = [];

      for (const item of items) {
        if (!item.productId) continue;
        const product = currentProducts.find(p => p.id === item.productId);
        if (!product) continue;

        const updatedStock = (product.stock || 0) - (item.quantity || 0);
        await saveProduct({ ...product, stock: updatedStock });

        if (updatedStock <= 0) {
          lowStockWarnings.push(`${product.name} is now out of stock!`);
        } else if (updatedStock <= 5) {
          lowStockWarnings.push(`${product.name} has only ${updatedStock} left in stock`);
        }
      }

      const refreshed = await getAllProducts();
      setProducts(refreshed);

      for (const warning of lowStockWarnings) {
        toast(warning, 'warning');
      }
    }
  };

  // Upload PDF to Google Drive if configured
  const uploadToGoogleDrive = async (pdfBlob, fileName) => {
    try {
      const latestProfile = await getProfile();
      const clientId = latestProfile.googleClientId;
      const folderName = latestProfile.googleDriveFolder || 'GST Billing Invoices';
      if (!clientId) return;

      const hasToken = await ensureToken(clientId);
      if (!hasToken) {
        toast('Google Drive: Please reconnect in Settings', 'warning');
        return;
      }

      const folderId = await findOrCreateFolder(folderName);
      await uploadPDF(fileName, pdfBlob, folderId);
      toast(`Saved to Google Drive → ${folderName}`, 'success');
    } catch (err) {
      console.error('Google Drive upload error:', err);
      toast('Google Drive upload failed: ' + err.message, 'warning');
    }
  };

  // Shared PDF generation helper
  const buildPDF = async () => {
    const scalerEl = printRef.current.closest('.preview-scaler');
    if (scalerEl) scalerEl.style.transform = 'none';

    // PDF quality / size trade-off:
    //   - `compress: true` deflate-compresses PDF streams (incl. embedded images).
    //     Adds ~50-150ms but typically shrinks output by 15-30%.
    //   - Render scale = max(3, devicePixelRatio * 2). Bumping from 2 to 3 makes text
    //     visibly sharper without much file-size increase, because JPEG compresses
    //     clean line-art / glyphs efficiently. On Retina/4K screens we go higher.
    //   - JPEG quality 0.95 vs old 0.92: gain in legibility for small text outweighs
    //     the modest size bump.
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfPageHeight = pdf.internal.pageSize.getHeight();
    const extraPages = printRef.current.querySelectorAll('[data-pdf-page]');
    const renderScale = Math.max(3, Math.round((window.devicePixelRatio || 1) * 2));

    const captureOptions = (el) => ({
      scale: renderScale,
      useCORS: true,
      logging: false,
      letterRendering: true,
      backgroundColor: '#ffffff', // ensures opaque background; some PDF readers render transparent JPEGs as black
      imageTimeout: 0,
      width: el.scrollWidth,
      height: el.scrollHeight,
    });

    // Hide extra pages, capture main invoice
    extraPages.forEach(el => el.style.display = 'none');
    await waitForImages(printRef.current);
    const mainCanvas = await html2canvas(printRef.current, {
      ...captureOptions(printRef.current),
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll('*').forEach(n => { n.style.letterSpacing = '0px'; n.style.wordSpacing = '0px'; });
        const inv = clonedDoc.getElementById('invoice-preview');
        if (inv) { inv.style.width = '210mm'; inv.style.overflow = 'visible'; inv.style.minHeight = 'unset'; inv.style.border = 'none'; inv.style.boxShadow = 'none'; inv.style.borderRadius = '0'; }
        clonedDoc.querySelectorAll('[data-pdf-page]').forEach(el => el.style.display = 'none');
      }
    });
    extraPages.forEach(el => el.style.display = '');

    // Add main invoice page(s)
    const mainImg = mainCanvas.toDataURL('image/jpeg', 0.95);
    const mainImgHeight = (mainCanvas.height * pdfWidth) / mainCanvas.width;
    if (mainImgHeight <= pdfPageHeight + 2) {
      pdf.addImage(mainImg, 'JPEG', 0, 0, pdfWidth, Math.min(mainImgHeight, pdfPageHeight), undefined, 'MEDIUM');
    } else {
      let heightLeft = mainImgHeight, position = 0;
      pdf.addImage(mainImg, 'JPEG', 0, position, pdfWidth, mainImgHeight, undefined, 'MEDIUM');
      heightLeft -= pdfPageHeight;
      while (heightLeft > 2) { position -= pdfPageHeight; pdf.addPage(); pdf.addImage(mainImg, 'JPEG', 0, position, pdfWidth, mainImgHeight, undefined, 'MEDIUM'); heightLeft -= pdfPageHeight; }
    }

    // Capture each extra section as a separate PDF page
    for (const pageEl of extraPages) {
      await waitForImages(pageEl);
      const c = await html2canvas(pageEl, {
        ...captureOptions(pageEl),
        onclone: (cd) => { cd.querySelectorAll('*').forEach(n => { n.style.letterSpacing = '0px'; n.style.wordSpacing = '0px'; }); }
      });
      pdf.addPage();
      pdf.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfWidth, Math.min((c.height * pdfWidth) / c.width, pdfPageHeight), undefined, 'MEDIUM');
    }

    if (scalerEl) scalerEl.style.transform = '';
    return pdf;
  };

  // Per-view keyboard shortcuts. Ctrl+S saves the invoice (without PDF) if it's
  // meaningful; Ctrl+P kicks off the PDF download. Lives here rather than in
  // App.jsx because both actions need invoice-form state (totals, items, etc.).
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 's' || e.key === 'S') {
        if (!isMeaningfulInvoice()) return; // nothing to save
        e.preventDefault();
        saveInvoiceToDB(true).then(() => toast('Invoice saved', 'success')).catch(() => toast('Save failed', 'error'));
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        // Defer to the next tick so the keydown doesn't race the PDF render.
        setTimeout(() => generatePDF(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMeaningfulInvoice]);

  const generatePDF = async () => {
    if (!printRef.current) return;
    try {
      setSaving(true);
      const pdf = await buildPDF();
      const fileName = `${typeConfig.prefix}_${details.invoiceNumber.replace(/\//g, '-')}.pdf`;
      pdf.save(fileName);
      await saveInvoiceToDB();
      clearDraft();

      const pdfBlob = pdf.output('blob');

      // Save to local "Saved Invoices" folder (Client Name / Month / file.pdf)
      const invoiceDate = details.invoiceDate ? new Date(details.invoiceDate) : new Date();
      const monthName = invoiceDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      const clientName = client?.name || 'General';
      savePdf(pdfBlob, { fileName, clientName, month: monthName }).catch(() => {});

      toast(isSupabaseMode()
        ? 'Invoice downloaded & saved to cloud storage'
        : `Invoice downloaded & saved to Saved Invoices/${clientName}/`, 'success');
      uploadToGoogleDrive(pdfBlob, fileName);
    } catch (err) {
      console.error(err);
      toast('Failed to generate PDF.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const shareWhatsApp = () => {
    const phone = client?.phone ? client.phone.replace(/\D/g, '') : '';
    const amount = formatCurrency(items.reduce((s, i) => s + (i.quantity * i.rate), 0));
    const msg = `*Invoice: ${details.invoiceNumber}*\nClient: ${client?.name || ''}\nAmount: ${amount}\nDate: ${details.invoiceDate}`;
    const encoded = encodeURIComponent(msg);
    const waUrl = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
    window.location.href = waUrl;
  };

  const exportEWayBill = () => {
    if (!profile?.gstin) { toast('Set your GSTIN in Settings first', 'warning'); return; }
    const ewb = generateEWayBillJSON(profile, client, details, items, totals, invoiceType);
    const blob = new Blob([JSON.stringify(ewb, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EWB-${details.invoiceNumber?.replace(/\//g, '-') || 'draft'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('E-Way Bill JSON downloaded', 'success');
  };

  return (
    <div className="generator-container">
      <div className="generator-toolbar">
        <div className="flex gap-2 items-center">
          <button className="btn btn-secondary" onClick={handleBack}><ArrowLeft size={18} /> Back</button>
          <span style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4,
            color: autoSaveStatus === 'saving' ? 'var(--text-muted)'
                 : autoSaveStatus === 'saved' ? '#059669'
                 : isMeaningfulInvoice() ? '#94a3b8' : '#cbd5e1' }}>
            {autoSaveStatus === 'saving' && <><Loader size={13} className="spin" /> Saving...</>}
            {autoSaveStatus === 'saved' && <><Check size={13} /> All changes saved</>}
            {autoSaveStatus === 'idle' && !isMeaningfulInvoice() && <span title="Add a client name and at least one item to start saving">Draft only — not saved yet</span>}
          </span>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={generatePDF} disabled={saving}>
            <Download size={18} /> {saving ? 'Generating...' : 'Download PDF'}
          </button>
          <button className="btn btn-secondary" onClick={shareWhatsApp} disabled={saving} style={{ background: '#25d366', color: '#fff', borderColor: '#25d366' }}>
            <MessageCircle size={18} /> WhatsApp
          </button>
          {(invoiceType === 'tax-invoice' || invoiceType === 'delivery-challan') && (
            <button className="btn btn-secondary" onClick={exportEWayBill} title="Download E-Way Bill JSON for NIC portal upload">
              <Truck size={18} /> E-Way Bill
            </button>
          )}
        </div>
      </div>

      <div className="split-view">
        <div className="editor-pane">

          {/* Business Profile Selector — shown only if multiple profiles saved */}
          {allProfiles.length > 1 && (
            <div className="glass-panel p-6 mb-6">
              <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Billing From (Business Profile)</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                {allProfiles.map(bp => {
                  const isSelected = (activeProfile?.businessName || profileProp?.businessName) === bp.businessName;
                  return (
                    <button key={bp.id} type="button"
                      onClick={async () => {
                        try {
                          const latest = await getProfile();
                          setActiveProfile(mergeProfileBranding(bp, latest));
                        } catch {
                          setActiveProfile(bp);
                        }
                      }}
                      style={{
                        padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.85rem', cursor: 'pointer',
                        border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: isSelected ? 'rgba(59,130,246,0.08)' : 'var(--surface)',
                        color: isSelected ? 'var(--primary)' : 'var(--text)',
                        fontWeight: isSelected ? 700 : 400,
                      }}>
                      {bp.businessName}
                      {bp.gstin && <span style={{ fontSize: '0.72rem', marginLeft: 6, opacity: 0.7 }}>{bp.gstin}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Invoice Type */}
          <div className="glass-panel p-6 mb-6">
            <div className="flex justify-between items-center">
              <h3 className="section-title" style={{ margin: 0 }}>Invoice Type</h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setShowOptions(!showOptions)}>
                <Settings size={15} /> {showOptions ? 'Hide Options' : 'Customize'}
              </button>
            </div>
            <div className="type-selector" style={{ marginTop: '0.75rem' }}>
              {Object.entries(INVOICE_TYPES).map(([key, val]) => (
                <button key={key} className={`type-chip ${invoiceType === key ? 'type-chip-active' : ''}`}
                  onClick={() => handleTypeChange(key)}>{val.label}</button>
              ))}
            </div>
            <p className="type-desc">{typeConfig?.description}</p>

            {/* Goods / Services / Mixed selector — drives default line-item unit
                (Hrs vs Nos) and filters the unit dropdown. Stays out of the way
                for users who never touch services. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>This invoice is for:</span>
              {[
                { id: 'goods',    label: '📦 Goods',    desc: 'Physical products — defaults to Nos / Kg / Pcs units' },
                { id: 'services', label: '⏱ Services', desc: 'Time / work-based — defaults to Hrs and surfaces Session / Visit / Month units' },
                { id: 'mixed',    label: '🔀 Mixed',   desc: 'Both — full unit list available, no filtering' },
              ].map(opt => (
                <button key={opt.id} type="button"
                  className={`type-chip ${(invoiceOptions.invoiceMode || 'goods') === opt.id ? 'type-chip-active' : ''}`}
                  onClick={() => setInvoiceOptions(prev => ({ ...prev, invoiceMode: opt.id }))}
                  title={opt.desc}
                  style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
                  {opt.label}
                </button>
              ))}
              {invoiceOptions.invoiceMode === 'services' && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  💡 Use a <strong>SAC code</strong> (services accounting code) in the HSN field
                </span>
              )}
            </div>

            {/* Customization Options */}
            {showOptions && (
              <div className="invoice-options">
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">Invoice Title</label>
                  <input type="text" className="form-input" value={invoiceOptions.customTitle}
                    onChange={(e) => setInvoiceOptions(prev => ({ ...prev, customTitle: e.target.value }))}
                    placeholder={typeConfig?.title || 'TAX INVOICE'} />
                </div>
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">Currency</label>
                  <select className="form-input" value={invoiceOptions.currency}
                    onChange={(e) => setInvoiceOptions(prev => ({ ...prev, currency: e.target.value }))}>
                    {/* Deduped currencies pulled from the region-filtered country list. */}
                    {Array.from(new Map(getCountriesForRegion(getRegionMode()).map(c => [c.currency, c])).values()).map(c => (
                      <option key={c.currency} value={c.currency}>{c.currency} ({c.currencySymbol === c.currency ? c.name : c.currencySymbol})</option>
                    ))}
                  </select>
                </div>
                {invoiceOptions.currency !== 'INR' && (
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Exchange Rate (optional, snapshot)</label>
                    <input type="number" step="any" min="0" className="form-input"
                      value={invoiceOptions.exchangeRate}
                      onChange={(e) => setInvoiceOptions(prev => ({ ...prev, exchangeRate: e.target.value }))}
                      placeholder={`1 ${invoiceOptions.currency} = ? INR`} />
                    <small style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Stored on this invoice — historical reports stay accurate even if rates change.</small>
                  </div>
                )}

                {/* Inline recurring — turn any invoice into a recurring template
                    without leaving the form. On save, this writes both the
                    invoice AND a recurring template the server auto-fires on
                    schedule. Edit/cancel the template later via the Recurring
                    Invoices view in the sidebar. */}
                {(() => {
                  const rec = invoiceOptions.recurring;
                  const isOn = !!rec?.enabled;
                  const toggle = () => {
                    if (isOn) {
                      setInvoiceOptions(prev => ({ ...prev, recurring: { ...prev.recurring, enabled: false } }));
                    } else {
                      const next = new Date(details.invoiceDate || new Date().toISOString());
                      next.setMonth(next.getMonth() + 1);
                      setInvoiceOptions(prev => ({
                        ...prev,
                        recurring: {
                          enabled: true,
                          frequency: 'monthly',
                          interval: 1,
                          nextDate: next.toISOString().split('T')[0],
                          endMode: 'never',
                          endDate: '',
                          maxOccurrences: '',
                        },
                      }));
                    }
                  };
                  const set = (key, val) => setInvoiceOptions(prev => ({
                    ...prev, recurring: { ...prev.recurring, [key]: val },
                  }));
                  return (
                    <div className={`form-group${isOn ? ' notice notice-info' : ''}`} style={{ marginBottom: '0.75rem', padding: '0.6rem', borderRadius: '6px', display: 'block' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={isOn} onChange={toggle}
                          style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
                        <strong>🔁 Make this a recurring invoice</strong>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          (auto-generate a new invoice on schedule, same items, new number)
                        </span>
                      </label>
                      {isOn && (
                        <div style={{ marginTop: '0.6rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Frequency</label>
                            <select className="form-input" value={rec.frequency}
                              onChange={e => set('frequency', e.target.value)}>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                              <option value="quarterly">Quarterly</option>
                              <option value="yearly">Yearly</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Every N (interval)</label>
                            <input type="number" min="1" max="12" className="form-input"
                              value={rec.interval || 1}
                              onChange={e => set('interval', parseInt(e.target.value) || 1)} />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Next invoice date</label>
                            <input type="date" className="form-input" value={rec.nextDate || ''}
                              onChange={e => set('nextDate', e.target.value)} />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">End condition</label>
                            <select className="form-input" value={rec.endMode || 'never'}
                              onChange={e => set('endMode', e.target.value)}>
                              <option value="never">Never (until I stop it)</option>
                              <option value="onDate">On a specific date</option>
                              <option value="afterN">After N invoices</option>
                            </select>
                          </div>
                          {rec.endMode === 'onDate' && (
                            <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                              <label className="form-label">Stop generating after this date</label>
                              <input type="date" className="form-input" value={rec.endDate || ''}
                                onChange={e => set('endDate', e.target.value)} />
                            </div>
                          )}
                          {rec.endMode === 'afterN' && (
                            <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                              <label className="form-label">Stop after this many invoices have been generated</label>
                              <input type="number" min="1" className="form-input"
                                value={rec.maxOccurrences || ''}
                                onChange={e => set('maxOccurrences', parseInt(e.target.value) || '')}
                                placeholder="e.g. 12 for a 1-year monthly contract" />
                            </div>
                          )}
                          <div style={{ gridColumn: 'span 2', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            Auto-generation fires every time you open the app (or daily if it stays running).
                            Future invoices get fresh sequential numbers, today's date as their invoice date,
                            and the same client + items + amounts as this one. Edit or pause the template any
                            time via <strong>Recurring</strong> in the sidebar.
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* TCS — collected by seller, ADDS to total (Section 206C, Income Tax Act) */}
                {(profile?.country || 'India') === 'India' && (
                  <div className={`form-group${invoiceOptions.showTCS ? ' notice notice-warn' : ''}`} style={{ marginBottom: '0.75rem', padding: '0.6rem', borderRadius: '6px', display: 'block' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!invoiceOptions.showTCS}
                        onChange={() => setInvoiceOptions(prev => ({ ...prev, showTCS: !prev.showTCS }))}
                        style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
                      <strong>TCS — Tax Collected at Source</strong>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>(Adds to invoice total)</span>
                    </label>
                    {invoiceOptions.showTCS && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <select className="form-input" value={invoiceOptions.tcsSection || '206C(1H)'}
                          onChange={(e) => {
                            const code = e.target.value;
                            const section = TCS_SECTIONS.find(s => s.code === code);
                            setInvoiceOptions(prev => ({ ...prev, tcsSection: code, tcsRate: code === 'custom' ? prev.tcsRate : section?.rate ?? prev.tcsRate }));
                          }}>
                          {TCS_SECTIONS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                        </select>
                        <input type="number" step="any" min="0" max="100" className="form-input"
                          value={invoiceOptions.tcsRate}
                          onChange={(e) => setInvoiceOptions(prev => ({ ...prev, tcsRate: e.target.value }))}
                          placeholder="Rate %" />
                      </div>
                    )}
                  </div>
                )}

                {/* TDS — deducted by buyer from payment, INFORMATIONAL on invoice */}
                {(profile?.country || 'India') === 'India' && (
                  <div className={`form-group${invoiceOptions.showTDS ? ' notice notice-info' : ''}`} style={{ marginBottom: '0.75rem', padding: '0.6rem', borderRadius: '6px', display: 'block' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!invoiceOptions.showTDS}
                        onChange={() => setInvoiceOptions(prev => ({ ...prev, showTDS: !prev.showTDS }))}
                        style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
                      <strong>TDS — Tax Deducted at Source</strong>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>(Buyer deducts; informational)</span>
                    </label>
                    {invoiceOptions.showTDS && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <select className="form-input" value={invoiceOptions.tdsSection || '194Q'}
                          onChange={(e) => {
                            const code = e.target.value;
                            const section = TDS_SECTIONS.find(s => s.code === code);
                            setInvoiceOptions(prev => ({ ...prev, tdsSection: code, tdsRate: code === 'custom' ? prev.tdsRate : section?.rate ?? prev.tdsRate }));
                          }}>
                          {TDS_SECTIONS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                        </select>
                        <input type="number" step="any" min="0" max="100" className="form-input"
                          value={invoiceOptions.tdsRate}
                          onChange={(e) => setInvoiceOptions(prev => ({ ...prev, tdsRate: e.target.value }))}
                          placeholder="Rate %" />
                      </div>
                    )}
                  </div>
                )}
                {/* Payment account picker — lists the active business profile's active
                    accounts. Hidden when the profile has 0 accounts (preserves v1.4.3
                    "no bank block" behaviour). Stored as invoiceOptions.selectedAccountId
                    so re-opening the invoice produces the same PDF. */}
                {(() => {
                  const accounts = getActiveAccounts(profile);
                  if (accounts.length === 0) return null;
                  const resolved = getAccountById(profile, invoiceOptions.selectedAccountId);
                  return (
                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                      <label className="form-label">Payment account on this invoice</label>
                      <select className="form-input" value={resolved?.id || ''}
                        onChange={(e) => setInvoiceOptions(prev => ({ ...prev, selectedAccountId: e.target.value || null }))}>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.isDefault ? '⭐ ' : ''}{a.label || a.bankName || 'Untitled account'}
                            {a.bankName && a.label !== a.bankName ? ` — ${a.bankName}` : ''}
                          </option>
                        ))}
                      </select>
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                        Bank details and UPI QR on the PDF come from the selected account.
                        Manage accounts in Settings → Payment Accounts.
                      </small>
                    </div>
                  );
                })()}
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">PDF Style</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {PDF_STYLES.map(s => (
                      <button key={s.id} type="button"
                        className={`type-chip ${(invoiceOptions.pdfStyle || 'gst') === s.id ? 'type-chip-active' : ''}`}
                        onClick={() => setInvoiceOptions(prev => ({ ...prev, pdfStyle: s.id }))}
                        title={s.desc}>{s.label}</button>
                    ))}
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">Accent Color</label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" title="Auto (match invoice type)"
                      style={{ width: '28px', height: '28px', borderRadius: '50%', border: !invoiceOptions.accentColor ? '2.5px solid #334155' : '2px solid #cbd5e1', background: 'conic-gradient(#1e40af, #7c3aed, #0f766e, #be123c, #1e40af)', cursor: 'pointer', position: 'relative' }}
                      onClick={() => setInvoiceOptions(prev => ({ ...prev, accentColor: '' }))}>
                      {!invoiceOptions.accentColor && <span style={{ position: 'absolute', inset: '3px', borderRadius: '50%', border: '2px solid white' }} />}
                    </button>
                    {ACCENT_PRESETS.map(p => (
                      <button key={p.color} type="button" title={p.label}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: p.color, border: invoiceOptions.accentColor === p.color ? '2.5px solid #334155' : '2px solid #cbd5e1', cursor: 'pointer', position: 'relative' }}
                        onClick={() => setInvoiceOptions(prev => ({ ...prev, accentColor: p.color }))}>
                        {invoiceOptions.accentColor === p.color && <span style={{ position: 'absolute', inset: '3px', borderRadius: '50%', border: '2px solid white' }} />}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Field-level toggles, grouped. Lets the user hide any default field on the
                    PDF without losing the data on the invoice itself. */}
                {[
                  { group: 'Header & branding', items: [
                    ['showLogo', 'Logo'],
                    ['showBusinessName', 'Business name'],
                    ['showBusinessAddress', 'Business address'],
                    ['showBusinessPhone', 'Business phone'],
                    ['showBusinessEmail', 'Business email'],
                    ['showState', 'Business state'],
                    ['showGSTIN', 'Tax ID (GSTIN/VAT/etc.)'],
                  ]},
                  { group: 'Client / Bill-to', items: [
                    ['showClientAddress', 'Client address'],
                    ['showClientPhone', 'Client phone'],
                    ['showClientEmail', 'Client email'],
                    ['showPlaceOfSupply', 'Place of Supply'],
                  ]},
                  { group: 'Invoice meta', items: [
                    ['showInvoiceNumber', 'Invoice number'],
                    ['showInvoiceDate', 'Invoice date'],
                    ['showDueDate', 'Due date'],
                  ]},
                  { group: 'Items table', items: [
                    ['showHSN', 'HSN/SAC column'],
                    ['showItemQty', 'Qty column'],
                    ['showItemUnit', 'Unit column'],
                    ['showRateColumn', 'Rate column'],
                    ['showDiscount', 'Discount % column'],
                    ['showGST', 'Tax % column (GST/VAT/etc.)'],
                    ['showCess', 'GST Cess % column (India — tobacco/auto/coal)'],
                  ]},
                  { group: 'Totals', items: [
                    ['showSubtotal', 'Subtotal row'],
                    ['showAmountWords', 'Amount in words'],
                    ['showRoundOff', 'Round-off line'],
                  ]},
                  { group: 'Compliance flags (India)', items: [
                    ['reverseCharge', 'Reverse Charge applies (Section 9(3)/9(4)) — recipient pays GST'],
                  ]},
                  { group: 'Footer', items: [
                    ['showBankDetails', 'Bank details'],
                    ['showAccountLabel', 'Show "Pay via: <account>" label above bank block'],
                    ['showUPI', 'UPI QR (India only)'],
                    ['showSignature', 'Signature block'],
                    ['showSignatoryText', 'Show "Authorized Signatory" caption'],
                    ['showTerms', 'Terms & Conditions'],
                    ['showNotes', 'Notes / Remarks'],
                  ]},
                ].map(section => (
                  <div key={section.group} style={{ marginBottom: '0.6rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{section.group}</div>
                    <div className="options-grid">
                      {section.items.map(([key, label]) => {
                        // These default to OFF; everything else defaults to ON.
                        const offByDefault = key === 'showRoundOff' || key === 'showAccountLabel'
                          || key === 'showCess' || key === 'reverseCharge';
                        const checked = offByDefault ? !!invoiceOptions[key] : invoiceOptions[key] !== false;
                        return (
                          <label key={key} className="option-toggle">
                            <input type="checkbox" checked={checked} onChange={() => toggleOption(key)} />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <button type="button" className="btn btn-secondary"
                    onClick={() => {
                      const allKeys = ['showLogo','showBusinessName','showBusinessAddress','showBusinessPhone','showBusinessEmail','showState','showGSTIN','showClientAddress','showClientPhone','showClientEmail','showPlaceOfSupply','showInvoiceNumber','showInvoiceDate','showDueDate','showHSN','showItemQty','showItemUnit','showRateColumn','showDiscount','showGST','showSubtotal','showAmountWords','showRoundOff','showBankDetails','showAccountLabel','showUPI','showSignature','showSignatoryText','showTerms','showNotes'];
                      setInvoiceOptions(prev => { const out = { ...prev }; allKeys.forEach(k => { out[k] = false; }); return out; });
                    }}
                    style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }}>
                    Hide all
                  </button>
                  <button type="button" className="btn btn-secondary"
                    onClick={() => setInvoiceOptions(DEFAULT_OPTIONS)}
                    style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }}>
                    Reset to default
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Client Modal */}
          <ClientModal show={showClientModal} onClose={() => setShowClientModal(false)} onSave={handleClientModalSave} client={modalClient} isEditing={isEditingClient} defaultCountry={profile?.country} />

          {/* Client Details */}
          <div className="glass-panel p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="section-title" style={{ margin: 0 }}>Billed To</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group full-width" style={{ position: 'relative' }}>
                <label className="form-label">Client Name</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input type="text" className="form-input" style={{ flex: 1 }} value={client.name} ref={clientNameRef}
                    onChange={(e) => {
                      setClient({ ...client, name: e.target.value });
                      setSelectedClientId(null);
                      setShowClientSuggestions(true);
                    }}
                    onFocus={() => { if (savedClients.length > 0) setShowClientSuggestions(true); }}
                    placeholder="Type client name to search or add new" autoComplete="off" />
                  {selectedClientId && (
                    <button type="button" className="btn-client-edit" onClick={() => openEditClientModal(savedClients.find(c => c.id === selectedClientId))} title="Edit saved client">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
                {showClientSuggestions && savedClients.length > 0 && (
                  <div className="client-suggestions" ref={clientSuggestionsRef}>
                    {filteredClients.length > 0 && filteredClients.map(cli => (
                      <div key={cli.id} className="client-suggestion-row">
                        <button type="button" className="client-suggestion-item" onClick={() => selectSavedClient(cli)}>
                          <div className="client-suggestion-main">
                            <strong>{cli.name}</strong>
                            {(cli.city || cli.address) && <small className="client-suggestion-addr">{cli.city || cli.address.substring(0, 30)}{!cli.city && cli.address.length > 30 ? '...' : ''}</small>}
                          </div>
                          <span>{cli.state}{cli.gstin ? ` · ${cli.gstin}` : ''}</span>
                        </button>
                        <button type="button" className="client-suggestion-edit" onClick={() => { openEditClientModal(cli); setShowClientSuggestions(false); }} title="Edit client">
                          <Pencil size={12} />
                        </button>
                      </div>
                    ))}
                    {client.name.trim() && (
                      <button type="button" className="client-suggestion-save" onClick={openAddClientModal}>
                        <UserPlus size={14} /> Save "{client.name.trim()}" as new client
                      </button>
                    )}
                    {filteredClients.length === 0 && !client.name.trim() && (
                      <div className="client-picker-empty">Type to search clients</div>
                    )}
                  </div>
                )}
              </div>
              <div className="form-group full-width">
                <label className="form-label">Billing Address</label>
                <input type="text" className="form-input" value={client.address}
                  onChange={(e) => setClient({ ...client, address: e.target.value })} placeholder="Street address, locality" />
              </div>
              <div className="form-group">
                <label className="form-label">Country</label>
                <select className="form-input" value={client.country || profile?.country || 'India'}
                  onChange={(e) => setClient({ ...client, country: e.target.value, state: '' })}>
                  {(() => {
                    const visible = getCountriesForRegion(getRegionMode());
                    const cur = client.country || profile?.country;
                    const out = [];
                    if (cur && !visible.some(c => c.name === cur)) {
                      out.push(<option key={cur} value={cur}>{cur}</option>);
                    }
                    return out.concat(visible.map(c => <option key={c.code} value={c.name}>{c.name}</option>));
                  })()}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">City</label>
                <input type="text" className="form-input" value={client.city}
                  onChange={(e) => setClient({ ...client, city: e.target.value })} placeholder="e.g. Mumbai" />
              </div>
              <div className="form-group">
                {(() => { const cc = getCountryConfig(client.country || profile?.country); return <label className="form-label">{cc.postalLabel}</label>; })()}
                <input type="text" className="form-input" value={client.pin}
                  onChange={(e) => setClient({ ...client, pin: e.target.value })} placeholder="Postal / PIN code" />
              </div>
              {invoiceOptions.showState && (() => {
                const cc = getCountryConfig(client.country || profile?.country);
                const stateOpts = getStatesForCountry(client.country || profile?.country);
                return (
                  <div className="form-group">
                    <label className="form-label">{cc.stateLabel}</label>
                    {stateOpts.length > 0 ? (
                      <select className="form-input" value={client.state} onChange={(e) => setClient({ ...client, state: e.target.value })}>
                        <option value="">Select {cc.stateLabel}</option>
                        {stateOpts.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <input type="text" className="form-input" value={client.state}
                        onChange={(e) => setClient({ ...client, state: e.target.value })} placeholder={cc.stateLabel} />
                    )}
                  </div>
                );
              })()}
              {invoiceOptions.showGSTIN && (() => {
                const cc = getCountryConfig(client.country || profile?.country);
                return (
                  <div className="form-group">
                    <label className="form-label">{cc.taxIdLabel}</label>
                    <input type="text" className="form-input" value={client.gstin}
                      onChange={(e) => setClient({ ...client, gstin: e.target.value.toUpperCase() })} placeholder="Optional" maxLength={20} />
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Invoice Details */}
          <div className="glass-panel p-6 mb-6">
            <h3 className="section-title">Invoice Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Invoice Number</label>
                <input type="text" className="form-input" value={details.invoiceNumber}
                  onChange={(e) => setDetails({ ...details, invoiceNumber: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Invoice Date</label>
                <input type="date" className="form-input" value={details.invoiceDate}
                  onChange={(e) => setDetails({ ...details, invoiceDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <input type="date" className="form-input" value={details.dueDate}
                  onChange={(e) => setDetails({ ...details, dueDate: e.target.value })} />
              </div>
              {invoiceOptions.showPlaceOfSupply && (() => {
                const posOpts = getStatesForCountry(profile?.country);
                return (
                  <div className="form-group">
                    <label className="form-label">Place of Supply</label>
                    {posOpts.length > 0 ? (
                      <select className="form-input" value={details.placeOfSupply}
                        onChange={(e) => setDetails({ ...details, placeOfSupply: e.target.value })}>
                        <option value="">Defaults to Client State</option>
                        {posOpts.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <input type="text" className="form-input" value={details.placeOfSupply}
                        onChange={(e) => setDetails({ ...details, placeOfSupply: e.target.value })} placeholder="State / Region" />
                    )}
                  </div>
                );
              })()}
              {invoiceType === 'credit-note' && (
                <div className="form-group full-width">
                  <label className="form-label">Original Invoice Reference</label>
                  <input type="text" className="form-input" value={details.originalInvoiceRef}
                    onChange={(e) => setDetails({ ...details, originalInvoiceRef: e.target.value })} placeholder="e.g. INV/2025-26/0001" />
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="glass-panel p-6 mb-6">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 className="section-title" style={{ margin: 0 }}>Line Items</h3>
              <div style={{ flex: '1 1 280px', maxWidth: 360 }}>
                <BarcodeScannerInput
                  onScan={handleBarcodeScan}
                  placeholder="Scan barcode to add item…"
                  autoFocus={false}
                  showIcon
                />
              </div>
              {showGST && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={taxInclusive} onChange={e => setTaxInclusive(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                  <span style={{ fontWeight: 500 }}>Prices include tax</span>
                </label>
              )}
            </div>
            {items.map((item) => (
              <div key={item.id} className="line-item-row">
                <div className="line-item-field" style={{ flex: 2.5, position: 'relative' }}>
                  <label className="form-label">Description</label>
                  <input type="text" className="form-input" value={item.name}
                    onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                    onBlur={() => setTimeout(() => setProductSearch({ itemId: null, query: '' }), 200)}
                    autoComplete="off" />
                  {getProductSuggestions(item.id).length > 0 && (
                    <div className="product-suggestions">
                      {getProductSuggestions(item.id).map(p => (
                        <div key={p.id} className="product-suggestion-item"
                          onMouseDown={() => selectProduct(item.id, p)}>
                          <span className="product-suggestion-name">{p.name}</span>
                          <span className="product-suggestion-meta">
                            {p.hsn && `HSN: ${p.hsn}`}{p.hsn && p.rate ? ' · ' : ''}{p.rate ? formatCurrency(p.rate, invoiceOptions.currency || 'INR') : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {invoiceOptions.showHSN && (
                  <div className="line-item-field" style={{ flex: 1 }}>
                    <label className="form-label">HSN/SAC</label>
                    <input type="text" className="form-input" value={item.hsn}
                      onChange={(e) => handleItemChange(item.id, 'hsn', e.target.value)} />
                  </div>
                )}
                <div className="line-item-field" style={{ flex: 0.7 }}>
                  <label className="form-label">Qty</label>
                  <input type="number" min="0" step="any" className="form-input" value={item.quantity}
                    onChange={(e) => handleItemChange(item.id, 'quantity', clampNonNeg(e.target.value))} />
                </div>
                <div className="line-item-field" style={{ flex: 0.9 }}>
                  <label className="form-label">Unit</label>
                  <select className="form-input" value={item.unit || 'Nos'}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') { handleAddCustomUnit(item.id); return; }
                      if (e.target.value.startsWith('__remove__::')) {
                        const label = e.target.value.replace('__remove__::', '');
                        handleRemoveCustomUnit(label);
                        return;
                      }
                      handleItemChange(item.id, 'unit', e.target.value);
                    }}>
                    {/* Filter units by invoice mode so a Services invoice doesn't drown
                        the user in 'Kg / Ltr / Tonne / Bag', and Goods invoices don't
                        show 'Word / Session / Visit'. Custom user-defined units always
                        appear. The currently-selected unit always appears even if it
                        wouldn't otherwise match the filter — so converting a goods
                        invoice to services mid-edit doesn't blank the dropdown. */}
                    {(() => {
                      const visible = filterUnitsByMode(units, invoiceOptions.invoiceMode);
                      const showCurrentExtra = item.unit && !visible.some(u => u.label === item.unit);
                      return (
                        <>
                          {showCurrentExtra && <option value={item.unit}>{item.unit}</option>}
                          {visible.map(u => (
                            <option key={u.label} value={u.label}>{u.label}{u.custom ? ' ★' : ''}</option>
                          ))}
                        </>
                      );
                    })()}
                    <option value="__custom__">＋ Add custom…</option>
                    {units.some(u => u.custom) && units.filter(u => u.custom).map(u => (
                      <option key={`rm-${u.label}`} value={`__remove__::${u.label}`}>− Remove "{u.label}"</option>
                    ))}
                  </select>
                </div>
                <div className="line-item-field" style={{ flex: 1.2 }}>
                  <label className="form-label">Rate</label>
                  <input type="number" min="0" step="any" className="form-input" value={item.rate}
                    onChange={(e) => handleItemChange(item.id, 'rate', clampNonNeg(e.target.value))} />
                </div>
                {invoiceOptions.showDiscount !== false && (
                  <div className="line-item-field" style={{ flex: 1.1 }}>
                    <label className="form-label">Disc. %</label>
                    <input type="number" min="0" max="100" step="0.01" className="form-input"
                      value={item.discountPercent ?? ''}
                      onChange={(e) => handleItemChange(item.id, 'discountPercent', clampPercent(e.target.value))}
                      placeholder="0" />
                    {getLineDiscountPercent(item) > 0 && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.45, marginTop: '0.15rem' }}>
                        <div>Discount: <strong style={{ color: '#dc2626' }}>− {formatCurrency(getLineDiscountAmount(item))}</strong></div>
                        <div>Net (Taxable): <strong>{formatCurrency(getLineTaxableAmount(item, taxInclusive && showGST))}</strong></div>
                      </div>
                    )}
                  </div>
                )}
                {showGST && (
                  <div className="line-item-field" style={{ flex: 1 }}>
                    <label className="form-label">{taxLabel} %</label>
                    <select className="form-input"
                      value={countryTaxRates.includes(Number(item.taxPercent)) ? String(item.taxPercent) : '__custom__'}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          const raw = window.prompt(`Custom ${taxLabel} rate (%):`, String(item.taxPercent || 0));
                          if (raw === null) return;
                          const n = parseFloat(raw);
                          if (!isFinite(n) || n < 0 || n > 100) { toast('Tax rate must be between 0 and 100', 'warning'); return; }
                          handleItemChange(item.id, 'taxPercent', n);
                        } else {
                          handleItemChange(item.id, 'taxPercent', parseFloat(e.target.value) || 0);
                        }
                      }}>
                      {countryTaxRates.map(r => (
                        <option key={r} value={String(r)}>{r}%</option>
                      ))}
                      <option value="__custom__">{countryTaxRates.includes(Number(item.taxPercent)) ? 'Custom…' : `${item.taxPercent}% (custom)`}</option>
                    </select>
                  </div>
                )}
                {showGST && invoiceOptions.showCess && (profile?.country || 'India') === 'India' && (
                  <div className="line-item-field" style={{ flex: 0.8 }}>
                    <label className="form-label" title="GST Compensation Cess (tobacco / auto / coal etc.)">Cess %</label>
                    <input type="number" min="0" max="500" step="any" className="form-input"
                      value={item.cessPercent || 0}
                      onChange={(e) => handleItemChange(item.id, 'cessPercent', clampNonNeg(e.target.value))} />
                  </div>
                )}
                <div className="line-item-field line-item-delete">
                  <button className="icon-btn icon-btn-red" onClick={() => removeItem(item.id)} title="Remove"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
            <button className="btn btn-secondary mt-2" onClick={addItem}><Plus size={18} /> Add Item</button>
          </div>

          {/* Add / Less — manual round to nearest rupee */}
          <div className="glass-panel p-6 mb-6">
            <h3 className="section-title" style={{ margin: '0 0 0.5rem' }}>Add / Less (Round)</h3>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Grand Total ko round karne ke liye — jaise <strong>+0.60</strong> add karo taaki ₹42,456.40 → <strong>₹42,457.00</strong> ho jaye.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: '1 1 140px', maxWidth: 200 }}>
                <label className="form-label">Amount (₹)</label>
                <input type="number" step="0.01" className="form-input"
                  value={invoiceOptions.manualAdjustment === 0 || invoiceOptions.manualAdjustment == null ? '' : invoiceOptions.manualAdjustment}
                  onChange={(e) => {
                    const v = e.target.value;
                    setInvoiceOptions(prev => ({
                      ...prev,
                      manualAdjustment: v === '' || v === '-' ? 0 : parseFloat(v) || 0,
                    }));
                  }}
                  placeholder="+0.60 ya −0.40" />
                <small style={{ fontSize: '0.68rem', color: '#94a3b8' }}>+ add · − less</small>
              </div>
              <button type="button" className="btn btn-secondary" style={{ marginBottom: 0 }}
                onClick={() => {
                  const preAdj = (totals.taxableAmount ?? (totals.subtotal - totals.totalDiscount))
                    + totals.cgst + totals.sgst + totals.igst
                    + (totals.cess || 0) + (totals.tcsAmount || 0) + (totals.roundOff || 0);
                  const adj = calculateRoundOff(preAdj);
                  setInvoiceOptions(prev => ({ ...prev, manualAdjustment: adj }));
                  toast(adj === 0 ? 'Already a whole rupee amount' : `Set ${adj > 0 ? 'Add' : 'Less'} ${formatCurrency(Math.abs(adj))}`, 'success');
                }}>
                Auto round to ₹1
              </button>
              {(invoiceOptions.manualAdjustment || 0) !== 0 && (
                <button type="button" className="btn btn-secondary" style={{ marginBottom: 0 }}
                  onClick={() => setInvoiceOptions(prev => ({ ...prev, manualAdjustment: 0 }))}>
                  Clear
                </button>
              )}
            </div>
            {(invoiceOptions.manualAdjustment || 0) !== 0 && (
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: '#0f766e' }}>
                PDF par dikhega: <strong>{Number(invoiceOptions.manualAdjustment) > 0 ? 'Add' : 'Less'}</strong>{' '}
                {formatCurrency(Math.abs(Number(invoiceOptions.manualAdjustment)))} → Grand Total{' '}
                <strong>{formatCurrency(totals.total)}</strong>
              </p>
            )}
          </div>

          {/* Terms */}
          <TermsErrorBoundary>
          <div className="glass-panel p-6 mb-6">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <h3 className="section-title" style={{ margin: 0 }}>Terms & Conditions</h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={handleLoadTerms} disabled={termsLoading}>
                  <Upload size={16} /> {termsLoading ? 'Loading...' : 'Load'}
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSaveTerms} disabled={termsSaving}>
                  <Save size={16} /> {termsSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
            {termsInitError && (
              <p style={{ margin: '0 0 0.75rem', padding: '0.5rem 0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: '0.85rem', color: '#b91c1c' }}>
                {termsInitError}
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: termsTemplates.length > 0 ? '1fr 1fr auto' : '1fr auto', gap: '0.75rem', marginBottom: '0.5rem', alignItems: 'end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Insert preset (by business type)</label>
                <select className="form-input" value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}>
                  <option value="">— Pick a business type —</option>
                  {TERMS_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <small style={{ color: '#94a3b8', fontSize: '0.7rem' }}>India-specific starter wording. Edit freely.</small>
              </div>
              {termsTemplates.length > 0 && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Load saved template</label>
                  <select className="form-input" value={selectedTermsId} onChange={(e) => handleTermsSelect(e.target.value)}>
                    <option value="">— Custom —</option>
                    {termsTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <button type="button" className="btn btn-secondary" onClick={handleInsertPreset} style={{ marginBottom: 0 }}>
                Insert
              </button>
            </div>
            <div className="form-group">
              <label className="form-label">Terms (appears on invoice — supports rich formatting)</label>
              <RichEditor toolbar value={customTerms}
                onChange={(v) => { setCustomTerms(v); setSelectedTermsId(''); }}
                placeholder="Enter or paste your terms & conditions..." />
            </div>
            <div className="form-group">
              <label className="form-label">Notes / Remarks (optional)</label>
              <RichEditor toolbar value={customNotes}
                onChange={(v) => setCustomNotes(v)}
                placeholder="Project details, special instructions, additional notes..." />
            </div>
            <div className="form-group" style={{ background: '#fefce8', border: '1px dashed #ca8a04', borderRadius: 8, padding: '0.75rem 1rem' }}>
              <label className="form-label" style={{ color: '#92400e', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v4m0 4h.01"/></svg>
                Private Note (not shown on invoice)
              </label>
              <textarea rows="2" className="form-input" value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                style={{ background: '#fffef5', fontSize: '0.82rem' }}
                placeholder="e.g. Client asked for 15-day credit, follow up on 20th, referred by Ravi..." />
            </div>
          </div>
          </TermsErrorBoundary>

          {/* Extra Sections */}
          <div className="glass-panel p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="section-title" style={{ margin: 0 }}>Additional Pages / Sections</h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setExtraSections(prev => [...prev, { id: Date.now().toString(), title: '', content: '' }])}>
                <Plus size={15} /> Add Section
              </button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
              Add extra sections that appear after the invoice footer. You can paste formatted HTML content (bold, lists, tables, etc.).
            </p>
            {extraSections.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>No extra sections. Click "Add Section" to create one.</p>
            ) : (
              extraSections.map((section, idx) => (
                <div key={section.id} className="extra-section-editor">
                  <div className="flex gap-2 items-center mb-2">
                    <input type="text" className="form-input" value={section.title}
                      onChange={(e) => setExtraSections(prev => prev.map(s => s.id === section.id ? { ...s, title: e.target.value } : s))}
                      placeholder="Section title (e.g. Scope of Work, Delivery Timeline)" style={{ flex: 1 }} />
                    <button className="icon-btn" onClick={() => {
                      if (idx > 0) setExtraSections(prev => { const arr = [...prev]; [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]; return arr; });
                    }} title="Move up" disabled={idx === 0}><ChevronUp size={14} /></button>
                    <button className="icon-btn" onClick={() => {
                      if (idx < extraSections.length - 1) setExtraSections(prev => { const arr = [...prev]; [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]; return arr; });
                    }} title="Move down" disabled={idx === extraSections.length - 1}><ChevronDown size={14} /></button>
                    <button className="icon-btn icon-btn-red" onClick={() => setExtraSections(prev => prev.filter(s => s.id !== section.id))} title="Remove"><Trash2 size={14} /></button>
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <RichEditor
                      value={section.content}
                      onChange={(html) => setExtraSections(prev => prev.map(s => s.id === section.id ? { ...s, content: html } : s))}
                      placeholder="Type or paste formatted content here (supports bold, lists, tables from Word/Docs)..." />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Preview */}
        <div className="preview-pane">
          <div className="preview-pane-label">PDF Preview — This is how your invoice will look</div>
          <div className="preview-scaler">
            <InvoicePreview ref={printRef} profile={profile} client={client} details={details}
              items={items} totals={totals} invoiceType={invoiceType} customTerms={customTerms}
              customNotes={customNotes} extraSections={extraSections} options={invoiceOptions} />
          </div>
        </div>
      </div>
    </div>
  );
}

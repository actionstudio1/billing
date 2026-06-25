const STORAGE_KEY = 'gst_masterPerms';

const DEFAULTS = { add: true, edit: true, delete: true, save: true, print: true };

/** Role-based master permissions — defaults allow all; set false in localStorage to restrict. */
export function getMasterPermissions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function canMaster(action) {
  return getMasterPermissions()[action] !== false;
}

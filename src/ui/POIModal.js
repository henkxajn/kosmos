// POIModal — DOM modal dla create/edit POI (M3 P2.2)
//
// Pattern function-based + Promise<>, jak ModalInput/TransportModal/EventChoiceModal
// (V4 confirmed). z=1000 (powyżej wszystkich istniejących modali, BattleIntro=500).
//
// Public API:
//   showPOIModalCreate(initialType?) → Promise<{ ok, poiId }|null>
//   showPOIModalEdit(poi)            → Promise<{ ok }|{ deleted:true }|null>
//
// Form rendering wg getPOIFormSchema(type) z POIFormLogic.js (pure helper).
// Validation on submit (D7=γ). Type immutable w edit mode (V2 mandate).
// L28: full-screen overlay z dim background, centered card.

import { THEME, hexToRgb }                                 from '../config/ThemeConfig.js';
import { t }                                               from '../i18n/i18n.js';
import {
  getPOIFormSchema, validatePOIForm, formToPOIParams,
  poiToFormData, makeDefaultFormData,
}                                                           from '../utils/POIFormLogic.js';

const POI_TYPES_LIST = ['waypoint', 'patrol', 'picket', 'rally', 'ambush'];
const Z_INDEX = 1000;

/**
 * Otwórz modal w trybie Create.
 * @param {string} initialType — 'waypoint' | 'patrol' | ... (default 'waypoint')
 */
export function showPOIModalCreate(initialType = 'waypoint') {
  return _showModal('create', { type: initialType });
}

/**
 * Otwórz modal w trybie Edit z pre-filled values.
 * @param {object} poi — POI entity z POIRegistry.getPOI(id)
 */
export function showPOIModalEdit(poi) {
  if (!poi || !poi.id) {
    console.warn('[POIModal] showPOIModalEdit: invalid poi', poi);
    return Promise.resolve(null);
  }
  return _showModal('edit', poi);
}

// ── Internal ──────────────────────────────────────────────────────────

function _showModal(mode, initialData) {
  return new Promise((resolve) => {
    // Stan formularza
    const isEdit = mode === 'edit';
    let currentType = isEdit ? initialData.type : (initialData.type || 'waypoint');
    let formData = isEdit ? poiToFormData(initialData) : makeDefaultFormData(currentType);
    let errors = {};

    // ── DOM build ─────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'kosmos-poi-modal-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(2,4,5,0.75)',
      zIndex: String(Z_INDEX),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: THEME.bgSecondary,
      border: `1px solid ${THEME.border}`,
      borderRadius: '6px',
      boxShadow: (() => { const c = hexToRgb(THEME.borderActive); return `0 0 30px rgba(${c.r},${c.g},${c.b},0.3)`; })(),
      padding: '20px 24px',
      width: '520px',
      maxHeight: '80vh',
      overflowY: 'auto',
      fontFamily: THEME.fontFamily,
      color: THEME.textPrimary,
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '16px', paddingBottom: '10px',
      borderBottom: `1px solid ${THEME.border}`,
    });

    const title = document.createElement('div');
    title.textContent = isEdit ? t('poi.modal.edit') : t('poi.modal.create');
    Object.assign(title.style, {
      color: THEME.accent,
      fontSize: `${THEME.fontSizeLarge}px`,
      letterSpacing: '1px',
    });
    header.appendChild(title);

    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      cursor: 'pointer',
      color: THEME.textDim,
      fontSize: '18px',
      padding: '0 6px',
    });
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = THEME.accent; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = THEME.textDim; });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Type selector row
    const typeRow = _makeFieldRow(t('poi.modal.type'));
    const typeSelect = document.createElement('select');
    Object.assign(typeSelect.style, _inputStyle());
    for (const tp of POI_TYPES_LIST) {
      const opt = document.createElement('option');
      opt.value = tp;
      opt.textContent = t(`poi.type.label.${tp}`);
      if (tp === currentType) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    if (isEdit) {
      typeSelect.disabled = true;
      typeSelect.style.opacity = '0.5';
      typeSelect.style.cursor = 'not-allowed';
    }
    typeRow.appendChild(typeSelect);
    panel.appendChild(typeRow);

    // Body container (re-rendered on type change)
    const body = document.createElement('div');
    panel.appendChild(body);

    // Footer (created early — referenced by Save/Delete)
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display: 'flex', justifyContent: 'flex-end', gap: '10px',
      marginTop: '20px', paddingTop: '14px',
      borderTop: `1px solid ${THEME.border}`,
    });

    let btnDelete = null;
    if (isEdit) {
      btnDelete = _makeButton(t('poi.modal.btn.delete'), 'danger');
      Object.assign(btnDelete.style, { marginRight: 'auto' });
      footer.appendChild(btnDelete);
    }
    const btnCancel = _makeButton(t('poi.modal.btn.cancel'), 'secondary');
    const btnSave   = _makeButton(t('poi.modal.btn.save'), 'primary');
    footer.appendChild(btnCancel);
    footer.appendChild(btnSave);
    panel.appendChild(footer);

    // ── Cleanup + resolve ─────────────────────────────────────
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      document.removeEventListener('keydown', onKeyDown, true);
      if (overlay.parentNode) document.body.removeChild(overlay);
    };
    const finishWith = (result) => { cleanup(); resolve(result); };

    // ── Re-render body ────────────────────────────────────────
    function rerenderBody() {
      body.innerHTML = '';
      const schema = getPOIFormSchema(currentType);
      if (!schema) return;
      for (const field of schema) {
        const row = _renderField(field, formData, errors, rerenderBody);
        body.appendChild(row);
      }
    }

    // ── Type change (create only) ────────────────────────────
    typeSelect.addEventListener('change', () => {
      if (isEdit) return;
      currentType = typeSelect.value;
      formData = makeDefaultFormData(currentType);
      errors = {};
      rerenderBody();
    });

    // ── Save handler ──────────────────────────────────────────
    function attemptSave() {
      _collectFormData(body, formData, currentType);
      const validation = validatePOIForm(currentType, formData);
      errors = validation.errors;
      if (!validation.valid) {
        rerenderBody();
        return;
      }
      const params = formToPOIParams(currentType, formData);
      const reg = window.KOSMOS?.poiRegistry;
      if (!reg) {
        errors._general = 'registry_failed';
        rerenderBody();
        return;
      }
      let result;
      if (isEdit) {
        // updatePOI nie akceptuje 'type' — usuń z params (type immutable)
        const updates = { ...params };
        delete updates.type;
        result = reg.updatePOI(initialData.id, updates);
      } else {
        result = reg.createPOI(params);
      }
      if (!result?.ok) {
        errors._general = result?.reason || 'registry_failed';
        rerenderBody();
        return;
      }
      finishWith(result);
    }

    // ── Delete handler ────────────────────────────────────────
    function attemptDelete() {
      if (!isEdit) return;
      const confirmMsg = `${t('poi.confirm.delete')} "${initialData.name}"?`;
      if (!window.confirm(confirmMsg)) return;
      const reg = window.KOSMOS?.poiRegistry;
      if (!reg) { finishWith(null); return; }
      const result = reg.deletePOI(initialData.id);
      if (result?.ok) finishWith({ deleted: true, poiId: initialData.id });
      else            finishWith(null);
    }

    // ── Wire handlers ─────────────────────────────────────────
    btnSave.addEventListener('click', attemptSave);
    btnCancel.addEventListener('click', () => finishWith(null));
    closeBtn.addEventListener('click', () => finishWith(null));
    if (btnDelete) btnDelete.addEventListener('click', attemptDelete);

    // Backdrop click = cancel
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finishWith(null);
    });

    // Block propagation z panelu do canvas
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
    }

    // ── Klawisze ──────────────────────────────────────────────
    function onKeyDown(e) {
      // Ignore w textarea (multiline string_array) — newline default
      const tag = e.target?.tagName;
      const isTextarea = tag === 'TEXTAREA';
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        finishWith(null);
      } else if (e.key === 'Enter' && !isTextarea) {
        // Enter na <input type=text|number> = Save
        // Enter na <button> = native click (browser default) — NIE Save
        if (tag === 'BUTTON') return;  // np. + Dodaj punkt
        e.preventDefault(); e.stopPropagation();
        attemptSave();
      }
      // Block keys propagating do GameScene (Space, 1-5, N, etc.)
      e.stopPropagation();
    }
    document.addEventListener('keydown', onKeyDown, true);

    // Initial render
    rerenderBody();
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Autofocus pierwsze pole
    requestAnimationFrame(() => {
      const firstInput = panel.querySelector('input, select, textarea');
      if (firstInput && !firstInput.disabled) firstInput.focus();
      if (firstInput?.tagName === 'INPUT' && firstInput.type === 'text') firstInput.select();
    });
  });
}

// ── Field rendering ───────────────────────────────────────────────────

/**
 * Render single field row wg field schema. Mutuje formData przez DOM event listeners.
 */
function _renderField(field, formData, errors, rerenderBody) {
  const row = _makeFieldRow(t(field.label));
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { width: '100%' });

  const value = formData[field.id];
  const errKey = errors[field.id];

  switch (field.type) {
    case 'text':           wrap.appendChild(_renderText(field, value, formData));       break;
    case 'number':         wrap.appendChild(_renderNumber(field, value, formData));     break;
    case 'point2d':        wrap.appendChild(_renderPoint2D(field, value, formData));    break;
    case 'point2d_array':  wrap.appendChild(_renderPointArray(field, value, formData, rerenderBody)); break;
    case 'enum':           wrap.appendChild(_renderEnum(field, value, formData));       break;
    case 'checkbox':       wrap.appendChild(_renderCheckbox(field, value, formData));   break;
    case 'string_array':   wrap.appendChild(_renderStringArray(field, value, formData));break;
    default:               wrap.textContent = `[unsupported field: ${field.type}]`;
  }

  // Error message
  if (errKey) {
    const err = document.createElement('div');
    err.textContent = t(`poi.modal.error.${errKey}`);
    Object.assign(err.style, {
      color: THEME.danger,
      fontSize: `${THEME.fontSizeSmall + 1}px`,
      marginTop: '4px',
    });
    wrap.appendChild(err);
  }

  row.appendChild(wrap);
  return row;
}

function _renderText(field, value, formData) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value ?? '';
  if (field.maxLength) input.maxLength = field.maxLength;
  Object.assign(input.style, _inputStyle());
  input.dataset.fieldId = field.id;
  input.dataset.fieldType = field.type;
  input.addEventListener('input', () => { formData[field.id] = input.value; });
  return input;
}

function _renderNumber(field, value, formData) {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = (value ?? '').toString();
  if (field.min != null) input.min = field.min;
  if (field.max != null) input.max = field.max;
  Object.assign(input.style, _inputStyle());
  input.dataset.fieldId = field.id;
  input.dataset.fieldType = field.type;
  input.addEventListener('input', () => {
    const n = Number(input.value);
    formData[field.id] = Number.isFinite(n) ? n : input.value;
  });
  return input;
}

function _renderPoint2D(field, value, formData) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { display: 'flex', gap: '8px' });
  const v = value && typeof value === 'object' ? value : { x: 0, y: 0 };
  formData[field.id] = { x: v.x ?? 0, y: v.y ?? 0 };

  const makeAxis = (axis) => {
    const sub = document.createElement('div');
    Object.assign(sub.style, { display: 'flex', alignItems: 'center', gap: '4px', flex: '1' });
    const lbl = document.createElement('span');
    lbl.textContent = axis.toUpperCase() + ':';
    Object.assign(lbl.style, { color: THEME.textDim, fontSize: `${THEME.fontSizeSmall + 1}px`, minWidth: '14px' });
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = String(formData[field.id][axis] ?? 0);
    Object.assign(inp.style, { ..._inputStyle(), flex: '1' });
    inp.dataset.fieldId = field.id;
    inp.dataset.fieldType = field.type;
    inp.dataset.axis = axis;
    inp.addEventListener('input', () => {
      const n = Number(inp.value);
      formData[field.id][axis] = Number.isFinite(n) ? n : NaN;
    });
    sub.appendChild(lbl);
    sub.appendChild(inp);
    return sub;
  };

  wrap.appendChild(makeAxis('x'));
  wrap.appendChild(makeAxis('y'));
  return wrap;
}

function _renderPointArray(field, value, formData, rerenderBody) {
  const wrap = document.createElement('div');
  if (!Array.isArray(formData[field.id])) formData[field.id] = [];
  const arr = formData[field.id];

  const list = document.createElement('div');
  Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '6px' });

  arr.forEach((pt, idx) => {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '6px', alignItems: 'center' });

    const lbl = document.createElement('span');
    lbl.textContent = `#${idx + 1}`;
    Object.assign(lbl.style, { color: THEME.textDim, fontSize: `${THEME.fontSizeSmall}px`, minWidth: '24px' });
    row.appendChild(lbl);

    const makeAxis = (axis) => {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = String(pt?.[axis] ?? 0);
      Object.assign(inp.style, { ..._inputStyle(), flex: '1', padding: '4px 6px' });
      inp.addEventListener('input', () => {
        const n = Number(inp.value);
        if (!arr[idx] || typeof arr[idx] !== 'object') arr[idx] = { x: 0, y: 0 };
        arr[idx][axis] = Number.isFinite(n) ? n : NaN;
      });
      return inp;
    };

    row.appendChild(makeAxis('x'));
    row.appendChild(makeAxis('y'));

    const removeBtn = _makeMiniButton(t('poi.modal.waypoints.remove'), 'danger');
    removeBtn.addEventListener('click', () => {
      arr.splice(idx, 1);
      rerenderBody();
    });
    row.appendChild(removeBtn);
    list.appendChild(row);
  });

  const addBtn = _makeMiniButton(t('poi.modal.waypoints.add'), 'secondary');
  addBtn.addEventListener('click', () => {
    arr.push({ x: 0, y: 0 });
    rerenderBody();
  });

  wrap.appendChild(list);
  wrap.appendChild(addBtn);
  return wrap;
}

function _renderEnum(field, value, formData) {
  const sel = document.createElement('select');
  Object.assign(sel.style, _inputStyle());
  for (const opt of (field.options || [])) {
    const o = document.createElement('option');
    o.value = opt;
    // Translation key conwencja: poi.modal.{fieldId}.{value}
    o.textContent = t(`poi.modal.${field.id}.${opt}`) || opt;
    if (opt === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { formData[field.id] = sel.value; });
  return sel;
}

function _renderCheckbox(field, value, formData) {
  const wrap = document.createElement('label');
  Object.assign(wrap.style, { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' });
  const inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.checked = !!value;
  Object.assign(inp.style, { width: '16px', height: '16px', cursor: 'pointer' });
  inp.addEventListener('change', () => { formData[field.id] = inp.checked; });
  const txt = document.createElement('span');
  txt.textContent = inp.checked ? '✓' : '—';
  Object.assign(txt.style, { color: THEME.textSecondary, fontSize: `${THEME.fontSizeSmall + 1}px` });
  inp.addEventListener('change', () => { txt.textContent = inp.checked ? '✓' : '—'; });
  wrap.appendChild(inp);
  wrap.appendChild(txt);
  return wrap;
}

function _renderStringArray(field, value, formData) {
  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.placeholder = 'emp_1, emp_2';
  ta.value = Array.isArray(value) ? value.join(', ') : '';
  Object.assign(ta.style, { ..._inputStyle(), resize: 'vertical', minHeight: '40px', fontFamily: THEME.fontFamily });
  ta.addEventListener('input', () => {
    formData[field.id] = ta.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  });
  return ta;
}

// ── Helpers (style / DOM factories) ───────────────────────────────────

function _makeFieldRow(labelText) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex', flexDirection: 'column', gap: '4px',
    marginBottom: '12px',
  });
  const lbl = document.createElement('div');
  lbl.textContent = labelText;
  Object.assign(lbl.style, {
    color: THEME.textSecondary,
    fontSize: `${THEME.fontSizeSmall + 1}px`,
    letterSpacing: '0.5px',
  });
  row.appendChild(lbl);
  return row;
}

function _inputStyle() {
  return {
    width: '100%',
    boxSizing: 'border-box',
    background: THEME.bgPrimary,
    border: `1px solid ${THEME.border}`,
    borderRadius: '3px',
    color: THEME.textPrimary,
    fontFamily: THEME.fontFamily,
    fontSize: '13px',
    padding: '6px 10px',
    outline: 'none',
  };
}

function _makeButton(label, kind /* 'primary' | 'secondary' | 'danger' */) {
  const btn = document.createElement('button');
  btn.textContent = label;
  const palette = {
    primary:   { border: THEME.successDim, text: THEME.success },
    secondary: { border: THEME.textDim,    text: THEME.textSecondary },
    danger:    { border: 'rgba(255,51,68,0.6)', text: THEME.danger },
  }[kind] ?? { border: THEME.border, text: THEME.textDim };

  Object.assign(btn.style, {
    background: 'transparent',
    border: `1px solid ${palette.border}`,
    borderRadius: '3px',
    color: palette.text,
    fontFamily: THEME.fontFamily,
    fontSize: `${THEME.fontSizeNormal + 1}px`,
    padding: '7px 18px',
    cursor: 'pointer',
    letterSpacing: '0.5px',
  });
  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.05)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
  return btn;
}

function _makeMiniButton(label, kind) {
  const btn = _makeButton(label, kind);
  Object.assign(btn.style, { padding: '3px 10px', fontSize: `${THEME.fontSizeSmall + 1}px` });
  return btn;
}

/**
 * Re-collect formData z DOM przed walidacją. Eventy 'input' aktualizują formData
 * na bieżąco — to fallback dla edge case (np. brak fire 'input' przed Save).
 */
function _collectFormData(bodyEl, formData, type) {
  const schema = getPOIFormSchema(type);
  if (!schema) return;
  // Większość pól aktualizuje formData przez 'input' listenery — to no-op
  // safety. Zwracamy bez modyfikacji jeśli wszystko już zsynchronizowane.
  // (W praktyce: formData jest aktualne — funkcja zostawiona dla future-proof.)
}

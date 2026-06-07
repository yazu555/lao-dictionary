const PAGE_SIZE = 50;
const FAVORITES_KEY = "tetchanPdfFaithfulFavorites";
const USER_PHRASES_KEY = "laoDictionaryCustomPhrases";
const CUSTOM_CATEGORY = "自分で追加";
const state = {
  entries: [],
  initialEntries: [],
  initialResults: [],
  phrases: [],
  matches: [],
  visibleLimit: PAGE_SIZE,
  query: "",
  view: "all",
  highlightEnabled: false,
  favorites: new Set(loadStoredIds(FAVORITES_KEY)),
  userPhrases: loadUserPhrases(),
  openPhraseCategories: new Set(),
  dataMetadata: { dictionary: null, phrases: null },
  editingPhraseId: null,
  statusTimer: null,
  toastTimer: null,
  refreshing: false,
};
const search = document.querySelector("#search");
const clear = document.querySelector("#clear");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const empty = document.querySelector("#empty");
const more = document.querySelector("#more");
const contentScroll = document.querySelector(".content-scroll");
const manual = document.querySelector("#manual");
const manualOpen = document.querySelector("#manual-open");
const manualClose = document.querySelector("#manual-close");
const highlightToggle = document.querySelector("#highlight-toggle");
const phraseAddOpen = document.querySelector("#phrase-add-open");
const phraseCsvButton = document.querySelector("#phrase-csv");
const phraseFormOverlay = document.querySelector("#phrase-form-overlay");
const phraseForm = document.querySelector("#phrase-form");
const phraseFormTitle = document.querySelector("#phrase-form-title");
const phraseFormClose = document.querySelector("#phrase-form-close");
const phraseFormCancel = document.querySelector("#phrase-form-cancel");
const phraseFormSave = document.querySelector("#phrase-form-save");
const phraseEditId = document.querySelector("#phrase-edit-id");
const phraseJaInput = document.querySelector("#phrase-ja");
const phraseLaoInput = document.querySelector("#phrase-lao");
const phraseReadingInput = document.querySelector("#phrase-reading");
const phraseRomanInput = document.querySelector("#phrase-roman");
const phraseFormError = document.querySelector("#phrase-form-error");
const dataOpen = document.querySelector("#data-open");
const dataOverlay = document.querySelector("#data-overlay");
const dataClose = document.querySelector("#data-close");
const dictionaryDataSelect = document.querySelector("#dictionary-data-select");
const dictionaryDataFile = document.querySelector("#dictionary-data-file");
const dictionaryDataStatus = document.querySelector("#dictionary-data-status");
const phraseDataSelect = document.querySelector("#phrase-data-select");
const phraseDataFile = document.querySelector("#phrase-data-file");
const phraseDataStatus = document.querySelector("#phrase-data-status");
const dataError = document.querySelector("#data-error");
const viewButtons = Array.from(document.querySelectorAll(".view-button"));
let basePhraseData = [];
const normalize = (text) => String(text || "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\s:：\\\/\-‐‑‒–—―−]+/g, "");
const entryResult = (entry) => ({ kind: "dictionary", entry });
const phraseResult = (phrase) => ({ kind: "phrase", phrase });
const escapeHtml = (text) => String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function matchingSourceIndexes(value) {
  const text = String(value ?? "");
  if (!state.highlightEnabled || !state.query) return new Set();
  let normalizedText = "";
  const sourceIndexes = [];
  Array.from(text).forEach((char, index) => {
    for (const normalizedChar of normalize(char)) {
      normalizedText += normalizedChar;
      sourceIndexes.push(index);
    }
  });
  const indexes = new Set();
  let start = 0;
  while ((start = normalizedText.indexOf(state.query, start)) !== -1) {
    for (let index = start; index < start + state.query.length; index += 1) indexes.add(sourceIndexes[index]);
    start += Math.max(1, state.query.length);
  }
  return indexes;
}
function highlightText(value) {
  const chars = Array.from(String(value ?? ""));
  const indexes = matchingSourceIndexes(value);
  if (!indexes.size) return escapeHtml(chars.join(""));
  let html = "";
  let highlighted = false;
  for (let index = 0; index < chars.length; index += 1) {
    const nextHighlighted = indexes.has(index);
    if (nextHighlighted !== highlighted) {
      html += nextHighlighted ? '<mark class="search-highlight">' : "</mark>";
      highlighted = nextHighlighted;
    }
    html += escapeHtml(chars[index]);
  }
  return html + (highlighted ? "</mark>" : "");
}
function chips(values) {
  return [...new Set(values.filter(Boolean))].map((value) => '<span class="chip">' + highlightText(value) + '</span>').join("");
}
function copyButton(value, label) {
  return '<button class="copy-button" type="button" data-copy="' + escapeHtml(value) + '" aria-label="' + escapeHtml(label) + 'をコピー" title="' + escapeHtml(label) + 'をコピー">' +
    '<svg aria-hidden="true" viewBox="0 0 24 24"><rect width="13" height="13" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>' +
  '</button>';
}
async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try { copied = document.execCommand("copy"); } catch {}
  textarea.remove();
  return copied;
}
function loadStoredIds(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}
function saveFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(state.favorites))); } catch {}
}
function normalizeText(value) {
  return String(value || "").trim();
}
function createUserPhraseId() {
  if (window.crypto?.randomUUID) return "custom-phrase-" + window.crypto.randomUUID();
  return "custom-phrase-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}
function loadUserPhrases() {
  try {
    const rows = JSON.parse(localStorage.getItem(USER_PHRASES_KEY) || "[]");
    if (!Array.isArray(rows)) return [];
    return rows.map(sanitizeUserPhrase).filter(Boolean);
  } catch {
    return [];
  }
}
function sanitizeUserPhrase(row) {
  if (!row || typeof row !== "object") return null;
  const japanese = normalizeText(row.japanese || row.ja);
  const lao = normalizeText(row.lao);
  const kana = normalizeText(row.kana || row.reading);
  const roman = normalizeText(row.roman);
  if (!japanese || !lao) return null;
  const now = new Date().toISOString();
  const createdAt = String(row.created_at || row.createdAt || now);
  return {
    id: String(row.id || createUserPhraseId()),
    japanese,
    lao,
    kana,
    roman,
    created_at: createdAt,
    updated_at: String(row.updated_at || row.updatedAt || createdAt),
  };
}
function saveUserPhrases() {
  localStorage.setItem(USER_PHRASES_KEY, JSON.stringify(state.userPhrases));
}
function normalizeFormalPhrase(phrase) {
  return {
    ...phrase,
    ja: normalizeText(phrase.japanese || phrase.ja),
    reading: normalizeText(phrase.kana || phrase.reading),
    roman: normalizeText(phrase.roman),
    custom: false,
  };
}
function prepareDictionaryEntry(entry) {
  return {
    ...entry,
    headword_terms_normalized: [...new Set([entry.headword, ...entry.headword_terms].map(normalize))],
    search_text_normalized: normalize(entry.search_text),
  };
}
function buildPhraseData() {
  return [
    ...basePhraseData,
    ...state.userPhrases.map((phrase) => ({
      id: phrase.id,
      category: CUSTOM_CATEGORY,
      ja: phrase.japanese,
      lao: phrase.lao,
      reading: phrase.kana,
      roman: phrase.roman,
      custom: true,
      createdAt: phrase.created_at,
      updatedAt: phrase.updated_at,
    })),
  ];
}
function currentSourceEntries() {
  if (state.view === "favorites") {
    return [
      ...state.entries.filter((entry) => state.favorites.has(String(entry.id))).map(entryResult),
      ...state.phrases.filter((phrase) => state.favorites.has(String(phrase.id))).map(phraseResult),
    ];
  }
  if (state.view === "phrases") return state.phrases.map(phraseResult);
  return state.entries.map(entryResult);
}
function fitStatus() {
  const heading = document.querySelector(".title-row h1");
  let headingSize = 16;
  let statusSize = 10;
  heading.style.fontSize = headingSize + "px";
  status.style.fontSize = statusSize + "px";
  while (status.scrollWidth > status.clientWidth && statusSize > 6) {
    statusSize -= 0.25;
    if (statusSize < 8.5 && headingSize > 14) headingSize -= 0.25;
    heading.style.fontSize = headingSize + "px";
    status.style.fontSize = statusSize + "px";
  }
}
function syncAppHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--app-height", height + "px");
}
let touchY = 0;
document.addEventListener("touchstart", (event) => {
  touchY = event.touches[0]?.clientY || 0;
}, { passive: true });
document.addEventListener("touchmove", (event) => {
  const nextY = event.touches[0]?.clientY;
  if (nextY == null) return;
  const delta = nextY - touchY;
  touchY = nextY;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".content-scroll")) {
    event.preventDefault();
    return;
  }
  const maxScroll = contentScroll.scrollHeight - contentScroll.clientHeight;
  const movingPastTop = contentScroll.scrollTop <= 0 && delta > 0;
  const movingPastBottom = contentScroll.scrollTop >= maxScroll && delta < 0;
  if (maxScroll <= 0 || movingPastTop || movingPastBottom) event.preventDefault();
}, { passive: false });
function setView(view) {
  state.view = view;
  state.query = normalize(search.value);
  state.visibleLimit = view === "phrases" && !state.query ? Number.MAX_SAFE_INTEGER : PAGE_SIZE;
  state.matches = findMatches(state.query);
  contentScroll.scrollTop = 0;
  updateViewButtons();
  render();
}
function updateViewButtons() {
  for (const button of viewButtons) {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}
function updateHighlightToggle() {
  highlightToggle.classList.toggle("active", state.highlightEnabled);
  highlightToggle.textContent = state.highlightEnabled ? "強調 ON" : "強調 OFF";
  highlightToggle.setAttribute("aria-pressed", String(state.highlightEnabled));
}
function formatDataStatus(record) {
  if (!record) return "未読み込み";
  const imported = record.importedAt ? new Date(record.importedAt).toLocaleString("ja-JP") : "";
  const release = record.version?.release_name ? "・" + record.version.release_name : "";
  return record.data.length.toLocaleString("ja-JP") + "件" + release + (record.fileName ? "・" + record.fileName : "") + (imported ? "・" + imported : "");
}
function updateDataStatus() {
  dictionaryDataStatus.textContent = formatDataStatus(state.dataMetadata.dictionary);
  phraseDataStatus.textContent = formatDataStatus(state.dataMetadata.phrases);
}
function openDataOverlay() {
  dataOverlay.classList.add("visible");
  dataOverlay.setAttribute("aria-hidden", "false");
  dataClose.focus();
}
function closeDataOverlay() {
  dataOverlay.classList.remove("visible");
  dataOverlay.setAttribute("aria-hidden", "true");
  dataOpen.focus();
}
async function importMasterData(kind, input) {
  const file = input.files?.[0];
  if (!file) return;
  dataError.textContent = "";
  const label = kind === "dictionary" ? "辞書データ" : "フレーズ集データ";
  const targetStatus = kind === "dictionary" ? dictionaryDataStatus : phraseDataStatus;
  targetStatus.textContent = "読み込み中...";
  try {
    const record = await window.LAO_DATA_STORE.importFile(kind, file);
    await loadDictionary();
    showToast(label + " " + record.data.length.toLocaleString("ja-JP") + "件を読み込みました。");
  } catch (error) {
    dataError.textContent = label + "を読み込めませんでした。" + (error?.message ? " " + error.message : "");
    updateDataStatus();
  } finally {
    input.value = "";
  }
}
async function loadDictionary() {
  let masterData = { dictionary: null, phrases: null };
  try {
    masterData = await window.LAO_DATA_STORE.load();
  } catch (error) {
    dataError.textContent = "保存済みデータを読み込めませんでした。" + (error?.message ? " " + error.message : "");
  }
  state.dataMetadata = masterData;
  state.entries = (Array.isArray(masterData.dictionary?.data) ? masterData.dictionary.data : []).map(prepareDictionaryEntry);
  basePhraseData = (Array.isArray(masterData.phrases?.data) ? masterData.phrases.data : [])
    .filter((phrase) => phrase.category !== CUSTOM_CATEGORY)
    .map(normalizeFormalPhrase);
  reloadPhraseData();
  state.initialEntries = state.entries.filter((entry) => entry.entry_type === "special-intro");
  state.initialResults = state.initialEntries.map(entryResult);
  state.query = normalize(search.value);
  state.matches = findMatches(state.query);
  updateDataStatus();
  updateViewButtons();
  updateHighlightToggle();
  render();
  if (!masterData.dictionary || !masterData.phrases) openDataOverlay();
}
function reloadPhraseData() {
  state.phrases = buildPhraseData().map((phrase) => ({
    ...phrase,
    search: normalize(phrase.search_text || [phrase.category, phrase.subcategory, phrase.ja, phrase.lao, phrase.reading, phrase.roman, phrase.literal, phrase.usage_note, ...(phrase.tags || [])].join(" ")),
  }));
}
function applySearch() {
  state.query = normalize(search.value);
  state.visibleLimit = state.view === "phrases" && !state.query ? Number.MAX_SAFE_INTEGER : PAGE_SIZE;
  state.matches = findMatches(state.query);
  contentScroll.scrollTop = 0;
  updateViewButtons();
  render();
}
function findMatches(query) {
  if (!query) {
    if (state.view === "favorites") return currentSourceEntries();
    if (state.view === "phrases") return currentSourceEntries();
    return state.initialResults;
  }
  if (state.view === "phrases") {
    return rankedPhrases(query).map(phraseResult);
  }
  if (state.view === "favorites") {
    return [
      ...state.entries
        .filter((entry) => state.favorites.has(String(entry.id)))
        .filter((entry) => entry.headword_terms_normalized.some((term) => term.startsWith(query)))
        .map(entryResult),
      ...state.phrases
        .filter((phrase) => state.favorites.has(String(phrase.id)))
        .map((phrase, index) => ({ phrase, index, rank: phraseRank(phrase, query) }))
        .filter((item) => Number.isFinite(item.rank))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map((item) => item.phrase)
        .map(phraseResult),
    ];
  }
  const sourceEntries = state.entries;
  const entryMatches = state.view === "fulltext"
    ? sourceEntries.filter((entry) => entry.search_text_normalized.includes(query))
    : sourceEntries.filter((entry) => entry.headword_terms_normalized.some((term) => term.startsWith(query)));
  const matches = entryMatches
    .map((entry, index) => ({ entry, index, rank: matchRank(entry, query) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => entryResult(item.entry));
  if (state.view === "fulltext") {
    matches.push(...rankedPhrases(query).map(phraseResult));
  }
  return matches;
}
function matchRank(entry, query) {
  const terms = entry.headword_terms_normalized;
  if (terms.some((term) => term === query)) return 0;
  if (terms.some((term) => term.startsWith(query))) return 1;
  if (terms.some((term) => term.includes(query))) return 2;
  return 3;
}
function phraseRank(phrase, query) {
  const fields = [phrase.ja, phrase.lao, phrase.reading, phrase.roman, phrase.category, phrase.subcategory, phrase.literal, phrase.usage_note, ...(phrase.tags || [])].map(normalize).filter(Boolean);
  if (fields.some((field) => field === query)) return 0;
  if (fields.some((field) => field.startsWith(query))) return 1;
  const indexes = fields.map((field) => field.indexOf(query)).filter((index) => index >= 0);
  return indexes.length ? 10 + Math.min(...indexes) : Number.POSITIVE_INFINITY;
}
function rankedPhrases(query) {
  return state.phrases
    .map((phrase, index) => ({ phrase, index, rank: phraseRank(phrase, query) }))
    .filter((item) => Number.isFinite(item.rank))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.phrase);
}
function targetTotalCount() {
  if (state.view === "favorites") return currentSourceEntries().length;
  if (state.view === "phrases") return state.phrases.length;
  if (state.view === "fulltext") return state.entries.length + state.phrases.length;
  return state.entries.length;
}
function render() {
  const visible = state.matches.slice(0, state.visibleLimit);
  results.innerHTML = state.view === "phrases" ? renderPhraseGroups(visible) : visible.map(renderResult).join("");
  renderVisiblePhonetics();
  clear.classList.toggle("visible", Boolean(state.query));
  empty.textContent = state.entries.length || basePhraseData.length ? "見つかりませんでした" : "「データ」から辞書データとフレーズ集データを読み込んでください";
  empty.classList.toggle("visible", state.matches.length === 0);
  more.classList.toggle("visible", state.visibleLimit < state.matches.length);
  status.textContent = visible.length.toLocaleString("ja-JP") + "件表示中 / " + targetTotalCount().toLocaleString("ja-JP") + "件";
  fitStatus();
}
function renderResult(result) {
  return result.kind === "phrase" ? renderPhrase(result.phrase) : renderEntry(result.entry);
}
function renderPhraseGroups(results) {
  const groups = new Map();
  for (const result of results) {
    const phrase = result.phrase;
    if (!groups.has(phrase.category)) groups.set(phrase.category, []);
    groups.get(phrase.category).push(phrase);
  }
  return Array.from(groups, ([category, phrases]) =>
    '<details class="phrase-category-section" data-phrase-category="' + escapeHtml(category) + '"' + (state.openPhraseCategories.has(category) ? " open" : "") + '>' +
      '<summary class="phrase-category-summary">' +
        '<span class="phrase-category-title">' + highlightText(category) + '</span>' +
        '<span class="phrase-category-count">' + phrases.length.toLocaleString("ja-JP") + '件</span>' +
      '</summary>' +
      '<div class="phrase-list">' + phrases.map(renderPhrase).join("") + '</div>' +
    '</details>'
  ).join("");
}
function renderPhrase(phrase) {
  const id = String(phrase.id);
  const favorite = state.favorites.has(id);
  const controls = phrase.custom
    ? '<div class="phrase-actions">' +
        '<button class="phrase-action-button" type="button" data-user-edit-id="' + escapeHtml(id) + '">編集</button>' +
        '<button class="phrase-action-button phrase-delete-button" type="button" data-user-delete-id="' + escapeHtml(id) + '">削除</button>' +
      '</div>'
    : "";
  return '<article class="phrase-card' + (phrase.custom ? " user-phrase-card" : "") + '" data-phrase-id="' + escapeHtml(id) + '">' +
    '<div class="phrase-head"><div>' +
      '<div class="phrase-category">' + highlightText(phrase.category) + '</div>' +
      (phrase.custom ? '<span class="user-badge">自分で追加</span>' : "") +
      '<div class="phrase-ja">' + highlightText(phrase.ja) + '</div>' +
    '</div>' +
    '<button class="favorite-button' + (favorite ? " active" : "") + '" type="button" data-id="' + escapeHtml(id) + '" aria-label="お気に入り">' + (favorite ? "★" : "☆") + '</button></div>' +
    '<div class="phrase-lao-row"><div class="phrase-lao">' + highlightText(phrase.lao) + '</div>' + copyButton(phrase.lao, "ラオス語のフレーズ") + '</div>' +
    (phrase.reading ? '<div class="phrase-reading">' + highlightText(phrase.reading) + '</div>' : "") +
    (phrase.roman ? '<div class="phrase-roman">' + highlightText(phrase.roman) + '</div>' : "") +
    controls +
  '</article>';
}
function renderEntry(entry) {
  const id = String(entry.id);
  const favorite = state.favorites.has(id);
  const headLabels = entry.parts_of_speech || [];
  return '<article data-id="' + escapeHtml(id) + '">' +
    '<div class="entry-head">' +
      '<div class="head">' + highlightText(entry.headword) + (entry.reading_roman ? '<span class="reading">' + highlightText(entry.reading_roman) + '</span>' : "") + '</div>' +
      '<button class="favorite-button' + (favorite ? " active" : "") + '" type="button" data-id="' + escapeHtml(id) + '" aria-label="お気に入り">' + (favorite ? "★" : "☆") + '</button>' +
      '<div class="entry-symbols">' + chips(headLabels) + '</div>' +
    '</div>' +
    '<div class="senses">' + (entry.senses || []).map(renderSense).join("") + '</div>' +
    renderExamples(entry.examples || []) +
  '</article>';
}
function renderSense(sense) {
  return '<section class="sense">' +
    '<div class="sense-symbols">' + chips([sense.part_of_speech]) + '</div>' +
    '<div class="lao-row"><div class="lao">' + highlightText(sense.lao) + '</div>' + copyButton(sense.lao, "ラオス語") + '</div>' +
    (sense.pronunciation_glyphs ? '<div class="pron"><span class="phonetic phonetic-pending" data-pron="' + escapeHtml(sense.pronunciation_glyphs) + '"></span></div>' : "") +
  '</section>';
}
function renderExamples(examples) {
  const seen = new Set();
  const items = examples.filter((example) => {
    const key = [example.type, example.japanese, example.lao].join("\n");
    if (seen.has(key)) return false;
    seen.add(key);
    return example.japanese || example.lao;
  });
  if (!items.length) return "";
  return '<details open><summary>例文・関連表現</summary>' + items.map((example) =>
    '<div class="example"><div class="example-type">' + highlightText(example.type || "例文") + '</div>' +
    (example.japanese ? '<div class="example-ja">' + highlightText(example.japanese) + '</div>' : "") +
    renderExampleLao(example.lao) +
    '</div>'
  ).join("") + '</details>';
}
function renderExampleLao(value) {
  return String(value || "").split(/\s*\/\s*/).map((alternative) => alternative.trim()).filter(Boolean).map((alternative) =>
    '<div class="example-lao-row"><div class="example-lao">' + highlightText(alternative) + '</div>' + copyButton(alternative, "ラオス語の例文") + '</div>'
  ).join("");
}
function renderVisiblePhonetics() {
  for (const el of results.querySelectorAll(".phonetic-pending")) renderPhonetic(el);
}
function renderPhonetic(el) {
  const value = el.dataset.pron || "";
  const font = window.PHONETIC_GLYPHS;
  if (!font) { el.classList.remove("phonetic-pending"); return; }
  const highlightedIndexes = matchingSourceIndexes(value);
  const glyphs = Array.from(value).map((char, index) => {
    const key = char.codePointAt(0).toString(16).toUpperCase();
    return font.glyphs[key] ? { ...font.glyphs[key], highlighted: highlightedIndexes.has(index) } : null;
  }).filter(Boolean);
  if (!glyphs.length) { el.classList.remove("phonetic-pending"); return; }
  const height = font.ascent + Math.abs(font.descent);
  const width = glyphs.reduce((sum, glyph) => sum + glyph.w, 0);
  let x = 0;
  const paths = glyphs.map((glyph) => {
    const path = '<path class="phonetic-glyph' + (glyph.highlighted ? ' highlighted' : '') + '" transform="translate(' + x + ' 0)" d="' + glyph.d + '"></path>';
    x += glyph.w;
    return path;
  }).join("");
  el.classList.remove("phonetic-pending");
  el.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" focusable="false"><g transform="translate(0 ' + font.ascent + ') scale(1 -1)">' + paths + '</g></svg>';
}
function openPhraseForm(id = "") {
  const phrase = id ? state.userPhrases.find((item) => item.id === id) : null;
  state.editingPhraseId = phrase ? phrase.id : null;
  phraseFormTitle.textContent = phrase ? "フレーズを編集" : "フレーズを追加";
  phraseFormSave.textContent = phrase ? "保存" : "追加";
  phraseEditId.value = phrase?.id || "";
  phraseJaInput.value = phrase?.japanese || "";
  phraseLaoInput.value = phrase?.lao || "";
  phraseReadingInput.value = phrase?.kana || "";
  phraseRomanInput.value = phrase?.roman || "";
  setPhraseFormError("");
  phraseFormOverlay.classList.add("visible");
  phraseFormOverlay.setAttribute("aria-hidden", "false");
  setTimeout(() => phraseJaInput.focus(), 50);
}
function closePhraseForm() {
  phraseFormOverlay.classList.remove("visible");
  phraseFormOverlay.setAttribute("aria-hidden", "true");
  state.editingPhraseId = null;
  phraseForm.reset();
  setPhraseFormError("");
}
function setPhraseFormError(message) {
  phraseFormError.textContent = message;
  phraseFormError.classList.toggle("visible", Boolean(message));
}
function savePhraseForm(event) {
  event.preventDefault();
  const ja = normalizeText(phraseJaInput.value);
  const lao = normalizeText(phraseLaoInput.value);
  const reading = normalizeText(phraseReadingInput.value);
  const roman = normalizeText(phraseRomanInput.value);
  if (!ja || !lao) {
    setPhraseFormError("日本語とラオス語を入力してください。");
    return;
  }

  const existingId = phraseEditId.value || state.editingPhraseId;
  const existing = existingId ? state.userPhrases.find((item) => item.id === existingId) : null;
  const now = new Date().toISOString();
  const nextPhrase = {
    id: existing?.id || createUserPhraseId(),
    japanese: ja,
    lao,
    kana: reading,
    roman,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  if (existing) {
    state.userPhrases = state.userPhrases.map((item) => item.id === existing.id ? nextPhrase : item);
  } else {
    state.userPhrases = [...state.userPhrases, nextPhrase];
  }

  saveUserPhrases();
  reloadPhraseData();
  closePhraseForm();
  search.value = "";
  state.query = "";
  setView("phrases");
  setTransientStatus(existing ? "フレーズを保存しました。" : "フレーズを追加しました。");
  showToast(existing ? "フレーズを保存しました。" : "フレーズを追加しました。");
}
function deleteUserPhrase(id) {
  const phrase = state.userPhrases.find((item) => item.id === id);
  if (!phrase) return;
  if (!confirm("この追加フレーズを削除しますか？")) return;
  state.userPhrases = state.userPhrases.filter((item) => item.id !== id);
  state.favorites.delete(id);
  saveFavorites();
  saveUserPhrases();
  reloadPhraseData();
  search.value = "";
  state.query = "";
  setView("phrases");
  setTransientStatus("追加フレーズを削除しました。");
  showToast("追加フレーズを削除しました。");
}
function csvCell(value) {
  return '"' + String(value || "").replaceAll('"', '""') + '"';
}
function downloadUserPhrasesCsv() {
  if (!state.userPhrases.length) {
    showToast("追加フレーズがありません。先に「+」からフレーズを追加してください。");
    return;
  }
  const rows = [
    ["id", "japanese", "lao", "kana", "roman", "created_at", "updated_at"],
    ...state.userPhrases.map((row) => [row.id, row.japanese, row.lao, row.kana, row.roman, row.created_at, row.updated_at]),
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const link = document.createElement("a");
  link.href = url;
  link.download = "lao-custom-phrases-" + stamp + ".csv";
  document.body.appendChild(link);
  showToast(state.userPhrases.length + "件の追加フレーズをCSVダウンロードします。");
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function showToast(message) {
  let toast = document.querySelector("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.remove();
    state.toastTimer = null;
  }, 2200);
}
function setTransientStatus(message) {
  if (state.statusTimer) clearTimeout(state.statusTimer);
  status.textContent = message;
  fitStatus();
  state.statusTimer = setTimeout(() => {
    state.statusTimer = null;
    render();
  }, 1800);
}
init();

async function init() {
  let timer = 0;
  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(applySearch, 120); });
  clear.addEventListener("click", () => { search.value = ""; search.focus(); applySearch(); });
  more.addEventListener("click", () => { state.visibleLimit += PAGE_SIZE; render(); });
  manualOpen.addEventListener("click", () => {
    manual.classList.add("visible");
    manual.setAttribute("aria-hidden", "false");
    manualClose.focus();
  });
  highlightToggle.addEventListener("click", () => {
    state.highlightEnabled = !state.highlightEnabled;
    updateHighlightToggle();
    render();
  });
  phraseAddOpen.addEventListener("click", () => openPhraseForm());
  phraseCsvButton.addEventListener("click", downloadUserPhrasesCsv);
  phraseForm.addEventListener("submit", savePhraseForm);
  phraseFormClose.addEventListener("click", closePhraseForm);
  phraseFormCancel.addEventListener("click", closePhraseForm);
  phraseFormOverlay.addEventListener("click", (event) => {
    if (event.target === phraseFormOverlay) closePhraseForm();
  });
  dataOpen.addEventListener("click", openDataOverlay);
  dataClose.addEventListener("click", closeDataOverlay);
  dataOverlay.addEventListener("click", (event) => {
    if (event.target === dataOverlay) closeDataOverlay();
  });
  dictionaryDataSelect.addEventListener("click", () => dictionaryDataFile.click());
  phraseDataSelect.addEventListener("click", () => phraseDataFile.click());
  dictionaryDataFile.addEventListener("change", () => importMasterData("dictionary", dictionaryDataFile));
  phraseDataFile.addEventListener("change", () => importMasterData("phrases", phraseDataFile));
  results.addEventListener("toggle", handlePhraseCategoryToggle, true);
  manualClose.addEventListener("click", closeManual);
  manual.addEventListener("click", (event) => {
    if (event.target === manual) closeManual();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && manual.classList.contains("visible")) closeManual();
    if (event.key === "Escape" && dataOverlay.classList.contains("visible")) closeDataOverlay();
  });
  results.addEventListener("click", handleResultClick);
  window.addEventListener("resize", fitStatus);
  window.addEventListener("resize", syncAppHeight);
  window.visualViewport?.addEventListener("resize", syncAppHeight);
  window.visualViewport?.addEventListener("scroll", syncAppHeight);
  for (const button of viewButtons) button.addEventListener("click", () => setView(button.dataset.view || "all"));
  document.querySelector(".search-area").addEventListener("submit", (event) => event.preventDefault());
  syncAppHeight();
  await loadDictionary();
  registerServiceWorker();
}

function closeManual() {
  manual.classList.remove("visible");
  manual.setAttribute("aria-hidden", "true");
  manualOpen.focus();
}
function handlePhraseCategoryToggle(event) {
  const section = event.target;
  if (!(section instanceof HTMLDetailsElement) || !section.classList.contains("phrase-category-section")) return;
  const category = section.dataset.phraseCategory;
  if (!category) return;
  if (section.open) state.openPhraseCategories.add(category);
  else state.openPhraseCategories.delete(category);
}
async function handleResultClick(event) {
  const copy = event.target.closest(".copy-button");
  if (copy) {
    if (await copyText(copy.dataset.copy || "")) {
      copy.classList.add("copied");
      copy.setAttribute("aria-label", "コピーしました");
      clearTimeout(copy.copyTimer);
      copy.copyTimer = setTimeout(() => {
        copy.classList.remove("copied");
        copy.setAttribute("aria-label", copy.title);
      }, 900);
    }
    return;
  }
  const editButton = event.target.closest("[data-user-edit-id]");
  if (editButton) {
    openPhraseForm(editButton.dataset.userEditId || "");
    return;
  }
  const deleteButton = event.target.closest("[data-user-delete-id]");
  if (deleteButton) {
    deleteUserPhrase(deleteButton.dataset.userDeleteId || "");
    return;
  }
  const favoriteButton = event.target.closest(".favorite-button");
  if (favoriteButton) {
    const id = String(favoriteButton.dataset.id);
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    saveFavorites();
    if (state.view === "favorites") {
      state.matches = findMatches(state.query);
      render();
    } else {
      const active = state.favorites.has(id);
      favoriteButton.classList.toggle("active", active);
      favoriteButton.textContent = active ? "★" : "☆";
    }
    return;
  }
}

function showUpdateNotice(registration) {
  let toast = document.querySelector("#update-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "update-toast";
    toast.className = "update-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = "";
  const message = document.createElement("span");
  message.textContent = "新しい版があります。";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "更新";
  button.addEventListener("click", () => {
    state.refreshing = true;
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  });
  toast.append(message, button);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" }).then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateNotice(registration);
      }

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateNotice(registration);
          }
        });
      });

      navigator.serviceWorker.ready.then((readyRegistration) => {
        readyRegistration.update().catch(() => {});
      }).catch(() => {});
    }).catch(() => {});

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!state.refreshing) return;
      window.location.reload();
    });
  });
}

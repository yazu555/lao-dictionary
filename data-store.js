const LAO_DATA_DB_NAME = "lao-dictionary-master-data";
const LAO_DATA_DB_VERSION = 1;
const LAO_DATA_STORE_NAME = "datasets";
const FORMAL_PHRASE_FIELDS = [
  "id", "sequence", "entry_kind", "category", "subcategory", "japanese", "lao", "kana", "roman",
  "literal", "usage_note", "tags", "source", "created_from", "created_at", "updated_at", "search_text",
];
const FINAL_DICTIONARY_FIELDS = [
  "id", "sequence", "entry_type", "headword", "headword_terms", "reading_roman", "parts_of_speech",
  "senses", "examples", "source", "verification", "search_text",
];

function openLaoDataDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LAO_DATA_DB_NAME, LAO_DATA_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LAO_DATA_STORE_NAME)) {
        request.result.createObjectStore(LAO_DATA_STORE_NAME, { keyPath: "kind" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readLaoDataRecord(kind) {
  const db = await openLaoDataDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LAO_DATA_STORE_NAME, "readonly");
    const request = transaction.objectStore(LAO_DATA_STORE_NAME).get(kind);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeLaoDataRecord(record) {
  const db = await openLaoDataDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LAO_DATA_STORE_NAME, "readwrite");
    transaction.objectStore(LAO_DATA_STORE_NAME).put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve(record);
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function normalizeLaoMasterPayload(kind, payload) {
  const data = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(data)) throw new Error("データ配列が見つかりません。");
  if (kind === "dictionary" && data.some((entry) =>
    !entry ||
    typeof entry !== "object" ||
    FINAL_DICTIONARY_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(entry, field)) ||
    !entry.id ||
    !entry.headword ||
    !Array.isArray(entry.headword_terms) ||
    !Array.isArray(entry.parts_of_speech) ||
    !Array.isArray(entry.senses) ||
    !Array.isArray(entry.examples) ||
    !entry.source ||
    !entry.verification
  )) {
    throw new Error("辞書データの形式が正しくありません。");
  }
  if (kind === "dictionary" && (!payload?.version || payload.version.master_record_count !== data.length)) {
    throw new Error("辞書データの件数がversion.jsonと一致しません。");
  }
  if (kind === "phrases" && data.some((phrase) =>
    !phrase ||
    typeof phrase !== "object" ||
    FORMAL_PHRASE_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(phrase, field)) ||
    !phrase.id ||
    !phrase.category ||
    !phrase.japanese ||
    !phrase.lao ||
    !Array.isArray(phrase.tags)
  )) {
    throw new Error("フレーズ集データの形式が正しくありません。");
  }
  if (payload?.type !== kind) throw new Error("選択したデータの種類が違います。");
  return {
    kind,
    data,
    schemaVersion: Number(payload?.schemaVersion || 1),
    masterUpdatedAt: String(payload?.updatedAt || ""),
    version: payload?.version || null,
  };
}

async function importLaoMasterFile(kind, file) {
  const payload = JSON.parse(await file.text());
  const normalized = normalizeLaoMasterPayload(kind, payload);
  return writeLaoDataRecord({
    ...normalized,
    fileName: file.name,
    importedAt: new Date().toISOString(),
  });
}

window.LAO_DATA_STORE = {
  async load() {
    const [storedDictionary, storedPhrases] = await Promise.all([
      readLaoDataRecord("dictionary"),
      readLaoDataRecord("phrases"),
    ]);
    let dictionary = storedDictionary;
    let phrases = storedPhrases;
    try {
      if (dictionary) normalizeLaoMasterPayload("dictionary", { ...dictionary, type: "dictionary" });
    } catch {
      dictionary = null;
    }
    try {
      if (phrases) normalizeLaoMasterPayload("phrases", { ...phrases, type: "phrases" });
    } catch {
      phrases = null;
    }
    return { dictionary, phrases };
  },
  importFile: importLaoMasterFile,
};

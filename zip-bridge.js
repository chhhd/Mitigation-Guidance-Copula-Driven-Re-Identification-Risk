(function (global) {
  const DB_NAME = "anonyviz-bundle";
  const STORE = "files";
  const KEY_DATA = "anonyvizZipData";
  const KEY_NAME = "anonyvizZipName";
  const KEY_TIME = "anonyvizZipTime";
  const hasIDB = "indexedDB" in global;
  const hasSession = "sessionStorage" in global;
  let dbPromise = null;

  function openDB() {
    if (!hasIDB) return Promise.reject(new Error("indexedDB not supported"));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onerror = () => reject(req.error || new Error("indexedDB open failed"));
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
    });
    return dbPromise;
  }

  function putRecord(record) {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore(STORE).put(record, "bundle");
        })
    );
  }

  function getRecord() {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readonly");
          tx.onerror = () => reject(tx.error);
          const req = tx.objectStore(STORE).get("bundle");
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result || null);
        })
    );
  }

  function deleteRecord() {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore(STORE).delete("bundle");
        })
    );
  }

  function readAsArrayBuffer(file) {
    if (file.arrayBuffer) {
      return file.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("read failed"));
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(file);
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("blobToBase64 failed"));
      reader.onload = () => {
        const result = reader.result || "";
        const base64 = String(result).split(",")[1] || "";
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(base64, type = "application/zip") {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  async function storeInSession(blob, name, time) {
    if (!hasSession) return;
    try {
      const base64 = await blobToBase64(blob);
      sessionStorage.setItem(KEY_DATA, base64);
      sessionStorage.setItem(KEY_NAME, name || "bundle.zip");
      sessionStorage.setItem(KEY_TIME, String(time || Date.now()));
    } catch (err) {
      console.warn("ZipBridge session store failed", err);
    }
  }

  function readFromSession() {
    if (!hasSession) return null;
    const base64 = sessionStorage.getItem(KEY_DATA);
    if (!base64) return null;
    try {
      const blob = base64ToBlob(base64, "application/zip");
      const name = sessionStorage.getItem(KEY_NAME) || "bundle.zip";
      const timeRaw = sessionStorage.getItem(KEY_TIME);
      const lastModified = timeRaw ? Number(timeRaw) : Date.now();
      return { blob, name, lastModified };
    } catch (err) {
      console.warn("ZipBridge session load failed", err);
      return null;
    }
  }

  global.ZipBridge = {
    async save(file) {
      if (!file) return null;
      const buffer = await readAsArrayBuffer(file);
      const blob = new Blob([buffer], { type: file.type || "application/zip" });
      const record = {
        blob,
        name: file.name || "bundle.zip",
        lastModified: file.lastModified || Date.now(),
      };

      if (hasIDB) {
        try {
          await putRecord(record);
        } catch (err) {
          console.warn("ZipBridge IDB save failed", err);
        }
      }
      await storeInSession(blob, record.name, record.lastModified);
      return record;
    },

    async load() {
      const sessionData = readFromSession();
      if (sessionData) return sessionData;
      if (hasIDB) {
        try {
          const rec = await getRecord();
          if (rec) return rec;
        } catch (err) {
          console.warn("ZipBridge IDB load failed", err);
        }
      }
      return null;
    },

    async clear() {
      if (hasSession) {
        sessionStorage.removeItem(KEY_DATA);
        sessionStorage.removeItem(KEY_NAME);
        sessionStorage.removeItem(KEY_TIME);
      }
      if (hasIDB) {
        try {
          await deleteRecord();
        } catch (err) {
          console.warn("ZipBridge IDB clear failed", err);
        }
      }
    },
  };
})(window);

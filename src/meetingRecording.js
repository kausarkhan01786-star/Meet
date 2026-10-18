const DATABASE_NAME = "meeting-recordings";
const STORE_NAME = "recordings";

function openRecordingDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local recording storage."));
  });
}

export async function saveMeetingRecording(recording) {
  if (!globalThis.indexedDB) throw new Error("This browser does not support local recording storage.");
  const database = await openRecordingDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(recording);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not save this recording."));
      transaction.onabort = () => reject(transaction.error || new Error("Could not save this recording."));
    });
  } finally {
    database.close();
  }
}

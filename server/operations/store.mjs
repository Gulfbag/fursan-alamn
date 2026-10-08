/**
 * Stores used by the operations domain.  The memory store exists only for unit
 * tests and local development; it deliberately has no persistence guarantee.
 */

export class OperationsStoreError extends Error {
  constructor(code = 'store_error', message = code) {
    super(message);
    this.name = 'OperationsStoreError';
    this.code = code;
  }
}

const COLLECTION_NAME = /^[a-z][a-z_]{0,63}$/;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function assertCollection(collection) {
  if (typeof collection !== 'string' || !COLLECTION_NAME.test(collection)) {
    throw new OperationsStoreError('invalid_collection');
  }
}

function assertId(id) {
  if (typeof id !== 'string' || !id || id.length > 256 || id.includes('/')) {
    throw new OperationsStoreError('invalid_id');
  }
}

function assertListOptions({ limit = 50, cursor = '', q = '', status = '' } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new OperationsStoreError('invalid_limit');
  }
  if (typeof cursor !== 'string' || cursor.length > 256 || cursor.includes('/')) {
    throw new OperationsStoreError('invalid_cursor');
  }
  if (typeof q !== 'string' || q.length > 80) throw new OperationsStoreError('invalid_query');
  if (typeof status !== 'string' || status.length > 64) throw new OperationsStoreError('invalid_status');
  return { limit, cursor, q, status };
}

function page(items, { limit, cursor, q, status }) {
  const ordered = [...items]
    .filter((item) => item && typeof item.id === 'string')
    .filter((item) => !cursor || item.id > cursor)
    .filter((item) => !status || item.status === status)
    .filter((item) => !q || (Array.isArray(item.searchTokens) && item.searchTokens.includes(q)))
    .sort((left, right) => left.id.localeCompare(right.id));
  const selected = ordered.slice(0, limit);
  return {
    items: clone(selected),
    nextCursor: ordered.length > limit ? selected.at(-1).id : '',
  };
}

function cloneState(state) {
  const next = new Map();
  for (const [collection, records] of state) {
    const collectionCopy = new Map();
    for (const [id, record] of records) collectionCopy.set(id, clone(record));
    next.set(collection, collectionCopy);
  }
  return next;
}

/**
 * An in-process transactional store. It is intentionally non-durable and must
 * never be presented as a Cloud Run/production data store.
 */
export function createMemoryOperationsStore() {
  let state = new Map();
  let mutex = Promise.resolve();

  function recordsFor(snapshot, collection, create = false) {
    assertCollection(collection);
    let records = snapshot.get(collection);
    if (!records && create) {
      records = new Map();
      snapshot.set(collection, records);
    }
    return records || new Map();
  }

  async function withMutex(work) {
    let unlock;
    const previous = mutex;
    mutex = new Promise((resolve) => { unlock = resolve; });
    await previous;
    try {
      return await work();
    } finally {
      unlock();
    }
  }

  function transactionFor(snapshot) {
    let writesStarted = false;
    const assertReadAllowed = () => {
      if (writesStarted) throw new OperationsStoreError('read_after_write');
    };
    return Object.freeze({
      async get(collection, id) {
        assertReadAllowed();
        assertCollection(collection);
        assertId(id);
        return clone(recordsFor(snapshot, collection).get(id) || null);
      },
      async list(collection, options = {}) {
        assertReadAllowed();
        assertCollection(collection);
        const normalized = assertListOptions(options);
        return page(recordsFor(snapshot, collection).values(), normalized);
      },
      create(collection, id, value) {
        writesStarted = true;
        assertCollection(collection);
        assertId(id);
        const records = recordsFor(snapshot, collection, true);
        if (records.has(id)) throw new OperationsStoreError('already_exists');
        records.set(id, clone(value));
      },
      set(collection, id, value) {
        writesStarted = true;
        assertCollection(collection);
        assertId(id);
        recordsFor(snapshot, collection, true).set(id, clone(value));
      },
    });
  }

  return Object.freeze({
    kind: 'memory-test-only',
    durable: false,
    async get(collection, id) {
      assertCollection(collection);
      assertId(id);
      return clone(recordsFor(state, collection).get(id) || null);
    },
    async list(collection, options = {}) {
      assertCollection(collection);
      return page(recordsFor(state, collection).values(), assertListOptions(options));
    },
    async runTransaction(work) {
      if (typeof work !== 'function') throw new OperationsStoreError('invalid_transaction');
      return withMutex(async () => {
        const snapshot = cloneState(state);
        const result = await work(transactionFor(snapshot));
        // Commit only after the callback has completed successfully. A throw
        // leaves `state` unchanged, providing rollback in tests.
        state = snapshot;
        return clone(result);
      });
    },
  });
}

/**
 * Creates an organization-scoped Firestore store. The Firestore SDK is loaded
 * only when a method is called, so importing this module neither contacts
 * Google nor requires ADC. `databaseId` must be a named database, never the
 * default database. A Firestore-compatible fake can be injected for tests as
 * `firestore` (the public contract) or as the explicit `fakeClient` alias.
 */
export function createFirestoreOperationsStore({ projectId, databaseId, orgId, firestore, fakeClient } = {}) {
  if (typeof projectId !== 'string' || !projectId.trim()) throw new OperationsStoreError('invalid_project_id');
  if (typeof databaseId !== 'string' || !databaseId.trim() || databaseId === '(default)') {
    throw new OperationsStoreError('named_database_required');
  }
  if (typeof orgId !== 'string' || !orgId.trim() || orgId.includes('/')) throw new OperationsStoreError('invalid_org_id');

  let client = firestore || fakeClient || null;
  let sdk = null;

  async function firestoreClient() {
    if (client) return client;
    try {
      sdk = await import('@google-cloud/firestore');
      client = new sdk.Firestore({ projectId, databaseId });
      return client;
    } catch {
      // Do not leak ADC, project, or package-error details to API callers.
      throw new OperationsStoreError('firestore_unavailable');
    }
  }

  function documentIdField(activeClient) {
    return sdk?.FieldPath?.documentId?.()
      || activeClient?.FieldPath?.documentId?.()
      || '__name__';
  }

  function collectionRef(activeClient, collection) {
    assertCollection(collection);
    return activeClient.collection('organizations').doc(orgId).collection(collection);
  }

  function documentRef(activeClient, collection, id) {
    assertId(id);
    return collectionRef(activeClient, collection).doc(id);
  }

  function dataFromSnapshot(snapshot) {
    if (!snapshot || !snapshot.exists) return null;
    const data = typeof snapshot.data === 'function' ? snapshot.data() : snapshot.data;
    return clone({ ...(data || {}), id: snapshot.id });
  }

  function dataFromQuerySnapshot(snapshot) {
    const docs = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
    return docs.map(dataFromSnapshot).filter(Boolean);
  }

  function buildQuery(activeClient, collection, { limit, cursor, q, status }) {
    let query = collectionRef(activeClient, collection);
    if (status) query = query.where('status', '==', status);
    if (q) query = query.where('searchTokens', 'array-contains', q);
    query = query.orderBy(documentIdField(activeClient)).limit(limit + 1);
    if (cursor) query = query.startAfter(cursor);
    return query;
  }

  async function listWith(activeClient, collection, options) {
    const normalized = assertListOptions(options);
    const items = dataFromQuerySnapshot(await buildQuery(activeClient, collection, normalized).get());
    const hasMore = items.length > normalized.limit;
    return {
      items: clone(items.slice(0, normalized.limit)),
      nextCursor: hasMore ? items[normalized.limit - 1].id : '',
    };
  }

  return Object.freeze({
    kind: 'firestore',
    durable: true,
    projectId,
    databaseId,
    orgId,
    async get(collection, id) {
      const activeClient = await firestoreClient();
      return dataFromSnapshot(await documentRef(activeClient, collection, id).get());
    },
    async list(collection, options = {}) {
      const activeClient = await firestoreClient();
      return listWith(activeClient, collection, options);
    },
    async runTransaction(work) {
      if (typeof work !== 'function') throw new OperationsStoreError('invalid_transaction');
      const activeClient = await firestoreClient();
      if (typeof activeClient.runTransaction !== 'function') throw new OperationsStoreError('invalid_firestore_client');
      return activeClient.runTransaction(async (nativeTransaction) => {
        let writesStarted = false;
        const assertReadAllowed = () => {
          if (writesStarted) throw new OperationsStoreError('read_after_write');
        };
        const tx = Object.freeze({
          async get(collection, id) {
            assertReadAllowed();
            return dataFromSnapshot(await nativeTransaction.get(documentRef(activeClient, collection, id)));
          },
          async list(collection, options = {}) {
            assertReadAllowed();
            const normalized = assertListOptions(options);
            const snapshot = await nativeTransaction.get(buildQuery(activeClient, collection, normalized));
            const items = dataFromQuerySnapshot(snapshot);
            return {
              items: clone(items.slice(0, normalized.limit)),
              nextCursor: items.length > normalized.limit ? items[normalized.limit - 1].id : '',
            };
          },
          create(collection, id, value) {
            writesStarted = true;
            nativeTransaction.create(documentRef(activeClient, collection, id), clone(value));
          },
          set(collection, id, value) {
            writesStarted = true;
            nativeTransaction.set(documentRef(activeClient, collection, id), clone(value));
          },
        });
        return work(tx);
      });
    },
  });
}

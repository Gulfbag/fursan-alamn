import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OperationsStoreError,
  createFirestoreOperationsStore,
  createMemoryOperationsStore,
} from '../server/operations/store.mjs';

class FakeSnapshot {
  constructor(id, value) {
    this.id = id;
    this.exists = value !== undefined;
    this.value = value;
  }

  data() {
    return this.value === undefined ? undefined : structuredClone(this.value);
  }
}

class FakeQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
  }
}

class FakeDocRef {
  constructor(client, path) {
    this.client = client;
    this.path = path;
    this.id = path.at(-1);
  }

  collection(name) {
    return new FakeCollectionRef(this.client, [...this.path, name]);
  }

  async get() {
    return new FakeSnapshot(this.id, this.client.records.get(this.path.join('/')));
  }
}

class FakeCollectionRef {
  constructor(client, path) {
    this.client = client;
    this.path = path;
  }

  doc(id) {
    return new FakeDocRef(this.client, [...this.path, id]);
  }

  where(field, operator, value) {
    return new FakeQuery(this).where(field, operator, value);
  }

  orderBy(field) {
    return new FakeQuery(this).orderBy(field);
  }

  limit(value) {
    return new FakeQuery(this).limit(value);
  }
}

class FakeQuery {
  constructor(collection, conditions = [], limitValue = Infinity, cursor = '') {
    this.collection = collection;
    this.conditions = conditions;
    this.limitValue = limitValue;
    this.cursor = cursor;
  }

  where(field, operator, value) {
    return new FakeQuery(this.collection, [...this.conditions, [field, operator, value]], this.limitValue, this.cursor);
  }

  orderBy() {
    return this;
  }

  limit(value) {
    return new FakeQuery(this.collection, this.conditions, value, this.cursor);
  }

  startAfter(cursor) {
    return new FakeQuery(this.collection, this.conditions, this.limitValue, cursor);
  }

  async get() {
    return this.snapshot(this.collection.client.records);
  }

  snapshot(records) {
    const prefix = `${this.collection.path.join('/')}/`;
    const directChildren = [];
    for (const [path, value] of records) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest.includes('/')) continue;
      const id = rest;
      let matching = true;
      for (const [field, operator, expected] of this.conditions) {
        if (operator === '==' && value[field] !== expected) matching = false;
        if (operator === 'array-contains' && (!Array.isArray(value[field]) || !value[field].includes(expected))) matching = false;
      }
      if (matching && (!this.cursor || id > this.cursor)) directChildren.push(new FakeSnapshot(id, value));
    }
    directChildren.sort((left, right) => left.id.localeCompare(right.id));
    return new FakeQuerySnapshot(directChildren.slice(0, this.limitValue));
  }
}

class FakeTransaction {
  constructor(client) {
    this.client = client;
    this.snapshot = new Map([...client.records].map(([key, value]) => [key, structuredClone(value)]));
    this.writes = [];
  }

  async get(target) {
    if (target instanceof FakeDocRef) return new FakeSnapshot(target.id, this.snapshot.get(target.path.join('/')));
    if (target instanceof FakeQuery) return target.snapshot(this.snapshot);
    throw new TypeError('unknown fake reference');
  }

  create(reference, value) {
    const key = reference.path.join('/');
    if (this.snapshot.has(key) || this.writes.some((entry) => entry.key === key)) throw new Error('already exists');
    this.writes.push({ type: 'create', key, value: structuredClone(value) });
  }

  set(reference, value) {
    this.writes.push({ type: 'set', key: reference.path.join('/'), value: structuredClone(value) });
  }

  commit() {
    for (const write of this.writes) this.client.records.set(write.key, write.value);
  }
}

class FakeFirestore {
  constructor() {
    this.records = new Map();
  }

  collection(name) {
    return new FakeCollectionRef(this, [name]);
  }

  async runTransaction(callback) {
    const transaction = new FakeTransaction(this);
    const result = await callback(transaction);
    transaction.commit();
    return result;
  }
}

test('memory operations store rolls back a failed transaction and returns clones', async () => {
  const store = createMemoryOperationsStore();
  await assert.rejects(store.runTransaction(async (tx) => {
    await tx.get('requests', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    tx.create('requests', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'new' });
    throw new Error('rollback');
  }), /rollback/);
  assert.equal(await store.get('requests', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), null);

  await store.runTransaction(async (tx) => {
    await tx.get('requests', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    tx.create('requests', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'new', searchTokens: ['a'] });
  });
  const record = await store.get('requests', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  record.status = 'tampered';
  assert.equal((await store.get('requests', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).status, 'new');
  assert.equal(store.kind, 'memory-test-only');
  assert.equal(store.durable, false);
});

test('memory transactions prohibit reads after writes and paginate filtered IDs', async () => {
  const store = createMemoryOperationsStore();
  await assert.rejects(store.runTransaction(async (tx) => {
    tx.create('tasks', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'todo' });
    await tx.get('tasks', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  }), (error) => error instanceof OperationsStoreError && error.code === 'read_after_write');

  for (const [id, status, token] of [
    ['00000000-0000-4000-8000-000000000001', 'todo', 'guard'],
    ['00000000-0000-4000-8000-000000000002', 'done', 'guard'],
    ['00000000-0000-4000-8000-000000000003', 'todo', 'other'],
  ]) {
    await store.runTransaction(async (tx) => {
      await tx.get('tasks', id);
      tx.create('tasks', id, { id, status, searchTokens: [token] });
    });
  }
  const first = await store.list('tasks', { limit: 1, q: 'guard' });
  assert.equal(first.items[0].id, '00000000-0000-4000-8000-000000000001');
  assert.equal(first.nextCursor, first.items[0].id);
  const second = await store.list('tasks', { limit: 1, cursor: first.nextCursor, q: 'guard' });
  assert.equal(second.items[0].status, 'done');
  assert.equal(second.nextCursor, '');
  assert.equal((await store.list('tasks', { limit: 10, status: 'todo' })).items.length, 2);
});

test('Firestore adapter uses named organization paths and injectable transaction client without Google/ADC', async () => {
  assert.throws(
    () => createFirestoreOperationsStore({ projectId: 'stage-project', databaseId: '(default)', orgId: 'fursan', firestore: new FakeFirestore() }),
    (error) => error instanceof OperationsStoreError && error.code === 'named_database_required',
  );

  const fake = new FakeFirestore();
  const store = createFirestoreOperationsStore({
    projectId: 'stage-project', databaseId: 'operations-stage', orgId: 'fursan', fakeClient: fake,
  });
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await store.runTransaction(async (tx) => {
    assert.equal(await tx.get('requests', id), null);
    tx.create('requests', id, { id, orgId: 'fursan', status: 'new', searchTokens: ['guard'] });
  });
  assert.deepEqual(await store.get('requests', id), { id, orgId: 'fursan', status: 'new', searchTokens: ['guard'] });
  assert.ok(fake.records.has(`organizations/fursan/requests/${id}`));
  assert.equal(fake.records.has(`organizations/other/requests/${id}`), false);
  const listed = await store.list('requests', { limit: 50, q: 'guard' });
  assert.equal(listed.items.length, 1);
  assert.equal(store.databaseId, 'operations-stage');
  assert.equal(store.durable, true);
});

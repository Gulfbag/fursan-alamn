import { createHash, randomUUID } from 'node:crypto';

const ROLES = new Set(['admin', 'manager', 'operator', 'viewer']);
const MANAGERS = new Set(['admin', 'manager']);
const ENTITY_NAMES = new Set(['requests', 'clients', 'tasks', 'documents']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = new Set(['normal', 'high']);
const DOCUMENT_KINDS = new Set(['procedure', 'service_report', 'proposal', 'correspondence']);
const AI_DRAFT_PURPOSES = new Set(['summary', 'action_plan', 'correspondence']);
const AI_JOB_ID = /^aijob-[a-f0-9]{56}$/;
const AI_DRAFT_FAILURE_CODES = new Set([
  'ai_authentication_unavailable',
  'ai_connection_failed',
  'ai_model_unavailable',
  'ai_invalid_output',
  'ai_source_too_large',
  'ai_source_version_changed',
  'ai_approval_required',
  'ai_reservation_required',
]);

const STATUSES = Object.freeze({
  requests: new Set(['new', 'in_review', 'in_progress', 'awaiting_client', 'completed', 'closed']),
  clients: new Set(['active', 'inactive']),
  tasks: new Set(['todo', 'in_progress', 'done', 'cancelled']),
  documents: new Set(['draft', 'in_review', 'approved', 'archived']),
});

// Terminal states deliberately have no outgoing edge. Document approval can
// only return to draft through the explicit manager/admin `revise: true` path.
const TRANSITIONS = Object.freeze({
  requests: Object.freeze({
    new: new Set(['in_review', 'closed']),
    in_review: new Set(['in_progress', 'awaiting_client', 'closed']),
    in_progress: new Set(['awaiting_client', 'completed', 'closed']),
    awaiting_client: new Set(['in_progress', 'completed', 'closed']),
    completed: new Set(['closed']),
    closed: new Set(),
  }),
  clients: Object.freeze({
    active: new Set(['inactive']),
    inactive: new Set(['active']),
  }),
  tasks: Object.freeze({
    todo: new Set(['in_progress', 'cancelled']),
    in_progress: new Set(['done', 'cancelled']),
    done: new Set(),
    cancelled: new Set(),
  }),
  documents: Object.freeze({
    draft: new Set(['in_review', 'archived']),
    in_review: new Set(['draft', 'approved', 'archived']),
    approved: new Set(['archived']),
    archived: new Set(),
  }),
});

const CREATE_FIELDS = Object.freeze({
  requests: new Set(['title', 'companyName', 'contactName', 'email', 'phone', 'service', 'city', 'description', 'priority', 'assigneeEmail', 'clientId']),
  clients: new Set(['name', 'contactName', 'email', 'phone', 'city', 'notes']),
  tasks: new Set(['title', 'description', 'requestId', 'clientId', 'assigneeEmail', 'dueDate', 'priority']),
  documents: new Set(['title', 'kind', 'content', 'requestId', 'clientId']),
});

const UPDATE_FIELDS = Object.freeze({
  requests: CREATE_FIELDS.requests,
  clients: CREATE_FIELDS.clients,
  tasks: CREATE_FIELDS.tasks,
  documents: new Set(['title', 'kind', 'content', 'requestId', 'clientId', 'revise']),
});

export class OperationsError extends Error {
  constructor(code, statusCode = 400) {
    super(code);
    this.name = 'OperationsError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, statusCode = 400) {
  throw new OperationsError(code, statusCode);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function safeObject() {
  return Object.create(null);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  // Inputs have already been normalized. This branch refuses odd values rather
  // than accidentally hashing a coercion such as a function or a Date object.
  fail('invalid_input');
}

function validUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL.test(value);
}

function validDay(value) {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function normalizeSearch(value) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('und')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Bounded, normalized title/company/name prefixes for safe array-contains search. */
export function searchTokensFor(values) {
  const tokens = new Set();
  for (const source of values) {
    if (typeof source !== 'string') continue;
    const words = normalizeSearch(source).split(' ').filter(Boolean).slice(0, 8);
    for (const word of words) {
      const chars = Array.from(word).slice(0, 32);
      for (let index = 1; index <= chars.length; index += 1) {
        tokens.add(chars.slice(0, index).join(''));
        if (tokens.size >= 64) return [...tokens];
      }
    }
  }
  return [...tokens];
}

function nowIso(now) {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) fail('server_time_invalid', 500);
  return value.toISOString();
}

function dayFromIso(iso) {
  return iso.slice(0, 10);
}

function requireEntity(entity) {
  if (!ENTITY_NAMES.has(entity)) fail('unknown_entity', 404);
}

function assertStore(store) {
  if (!store || typeof store.get !== 'function' || typeof store.list !== 'function' || typeof store.runTransaction !== 'function') {
    fail('operations_store_unavailable', 503);
  }
}

function assertPrincipal(principal, orgId) {
  if (!isPlainObject(principal) || principal.authenticated !== true) fail('unauthenticated', 401);
  if (typeof principal.subject !== 'string' || !principal.subject.trim() || principal.subject.length > 200) {
    fail('unauthenticated', 401);
  }
  if (!validEmail(principal.email) || !ROLES.has(principal.role)) fail('unauthenticated', 401);
  if (principal.orgId !== orgId) fail('organization_forbidden', 403);

  const allowedAssignees = [];
  if (principal.allowedAssignees !== undefined) {
    if (!Array.isArray(principal.allowedAssignees) || principal.allowedAssignees.length > 500) {
      fail('assignee_configuration_invalid', 403);
    }
    for (const candidate of principal.allowedAssignees) {
      if (!validEmail(candidate)) fail('assignee_configuration_invalid', 403);
      allowedAssignees.push(candidate.trim().toLowerCase());
    }
  }

  return Object.freeze({
    subject: principal.subject.trim(),
    email: principal.email.trim().toLowerCase(),
    role: principal.role,
    orgId,
    allowedAssignees: new Set(allowedAssignees),
  });
}

function requireManager(principal) {
  if (!MANAGERS.has(principal.role)) fail('forbidden', 403);
}

function requireNotViewer(principal) {
  if (principal.role === 'viewer') fail('forbidden', 403);
}

function validateKeys(input, allowed) {
  if (!isPlainObject(input)) fail('invalid_input');
  for (const key of Object.keys(input)) {
    // Explicitly reject __proto__/constructor/prototype even if an upstream JSON
    // parser happens to materialize them as own properties.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype' || !allowed.has(key)) {
      fail('unexpected_field');
    }
  }
}

function stringValue(input, key, { required = false, max, preserveNewlines = false } = {}) {
  if (!own(input, key)) {
    if (required) fail('invalid_input');
    return undefined;
  }
  if (typeof input[key] !== 'string') fail('invalid_input');
  const normalized = preserveNewlines
    ? input[key].replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    : input[key].trim();
  if ((required && !normalized) || normalized.length > max || normalized.includes('\u0000')) fail('invalid_input');
  return normalized;
}

function optionalString(input, key, max, create) {
  if (!own(input, key)) return create ? '' : undefined;
  return stringValue(input, key, { max });
}

function optionalEmail(input, key, create) {
  const value = optionalString(input, key, 254, create);
  if (value === undefined || value === '') return value;
  if (!validEmail(value)) fail('invalid_input');
  return value.toLowerCase();
}

function optionalId(input, key, create) {
  if (!own(input, key)) return create ? '' : undefined;
  const value = stringValue(input, key, { max: 36 });
  if (!value) return '';
  if (!validUuid(value)) fail('invalid_input');
  return value.toLowerCase();
}

function optionalDay(input, key, create) {
  if (!own(input, key)) return create ? '' : undefined;
  const value = stringValue(input, key, { max: 10 });
  if (!value) return '';
  if (!validDay(value)) fail('invalid_input');
  return value;
}

function optionalAssignee(input, principal, create) {
  const value = optionalEmail(input, 'assigneeEmail', create);
  if (value === undefined || value === '') return value;
  // The list is server-provided on a verified principal. An absent list means
  // no assignment is permitted; accepting an arbitrary email would fail open.
  if (!principal.allowedAssignees.has(value)) fail('assignee_not_allowed', 403);
  return value;
}

function priorityValue(input, create) {
  if (!own(input, 'priority')) return create ? 'normal' : undefined;
  const value = stringValue(input, 'priority', { max: 10 });
  if (!PRIORITIES.has(value)) fail('invalid_input');
  return value;
}

function kindValue(input, create) {
  if (!own(input, 'kind')) {
    if (create) fail('invalid_input');
    return undefined;
  }
  const value = stringValue(input, 'kind', { required: true, max: 32 });
  if (!DOCUMENT_KINDS.has(value)) fail('invalid_input');
  return value;
}

function assignIfDefined(target, key, value) {
  if (value !== undefined) target[key] = value;
}

function normalizeEntityInput(entity, input, principal, { create = false } = {}) {
  const allowed = create ? CREATE_FIELDS[entity] : UPDATE_FIELDS[entity];
  validateKeys(input, allowed);
  const result = safeObject();

  if (entity === 'requests') {
    assignIfDefined(result, 'title', stringValue(input, 'title', { required: create, max: 160 }));
    assignIfDefined(result, 'companyName', optionalString(input, 'companyName', 160, create));
    assignIfDefined(result, 'contactName', optionalString(input, 'contactName', 160, create));
    assignIfDefined(result, 'email', optionalEmail(input, 'email', create));
    assignIfDefined(result, 'phone', optionalString(input, 'phone', 32, create));
    assignIfDefined(result, 'service', optionalString(input, 'service', 100, create));
    assignIfDefined(result, 'city', optionalString(input, 'city', 100, create));
    assignIfDefined(result, 'description', optionalString(input, 'description', 4000, create));
    assignIfDefined(result, 'priority', priorityValue(input, create));
    assignIfDefined(result, 'assigneeEmail', optionalAssignee(input, principal, create));
    assignIfDefined(result, 'clientId', optionalId(input, 'clientId', create));
  } else if (entity === 'clients') {
    assignIfDefined(result, 'name', stringValue(input, 'name', { required: create, max: 160 }));
    assignIfDefined(result, 'contactName', optionalString(input, 'contactName', 160, create));
    assignIfDefined(result, 'email', optionalEmail(input, 'email', create));
    assignIfDefined(result, 'phone', optionalString(input, 'phone', 32, create));
    assignIfDefined(result, 'city', optionalString(input, 'city', 100, create));
    assignIfDefined(result, 'notes', optionalString(input, 'notes', 4000, create));
  } else if (entity === 'tasks') {
    assignIfDefined(result, 'title', stringValue(input, 'title', { required: create, max: 160 }));
    assignIfDefined(result, 'description', optionalString(input, 'description', 4000, create));
    assignIfDefined(result, 'requestId', optionalId(input, 'requestId', create));
    assignIfDefined(result, 'clientId', optionalId(input, 'clientId', create));
    assignIfDefined(result, 'assigneeEmail', optionalAssignee(input, principal, create));
    assignIfDefined(result, 'dueDate', optionalDay(input, 'dueDate', create));
    assignIfDefined(result, 'priority', priorityValue(input, create));
  } else if (entity === 'documents') {
    assignIfDefined(result, 'title', stringValue(input, 'title', { required: create, max: 160 }));
    assignIfDefined(result, 'kind', kindValue(input, create));
    assignIfDefined(result, 'content', stringValue(input, 'content', { required: create, max: 12000, preserveNewlines: true }));
    assignIfDefined(result, 'requestId', optionalId(input, 'requestId', create));
    assignIfDefined(result, 'clientId', optionalId(input, 'clientId', create));
    if (own(input, 'revise')) {
      if (typeof input.revise !== 'boolean') fail('invalid_input');
      result.revise = input.revise;
    }
  }

  if (!create && Object.keys(result).length === 0) fail('invalid_input');
  if (own(result, 'title') && !result.title || own(result, 'name') && !result.name) fail('invalid_input');
  return result;
}

function initialStatus(entity) {
  return ({ requests: 'new', clients: 'active', tasks: 'todo', documents: 'draft' })[entity];
}

function searchValues(entity, record) {
  if (entity === 'requests') return [record.title, record.companyName];
  if (entity === 'clients') return [record.name];
  return [record.title];
}

function entityRecord(entity, input, principal, timestamp) {
  const record = {
    id: randomUUID(),
    orgId: principal.orgId,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: principal.subject,
    version: 1,
    status: initialStatus(entity),
    ...input,
  };
  record.searchTokens = searchTokensFor(searchValues(entity, record));
  if (entity === 'requests') record.aiUseApproval = null;
  if (entity === 'documents') record.revisionIds = [];
  return record;
}

function assertStoredRecord(record, entity, id, orgId) {
  if (!isPlainObject(record) || record.id !== id || record.orgId !== orgId || !Number.isInteger(record.version) || record.version < 1) {
    fail('not_found', 404);
  }
  if (!STATUSES[entity].has(record.status)) fail('not_found', 404);
  return record;
}

function assertVersion(value) {
  if (!Number.isInteger(value) || value < 1) fail('invalid_version');
}

function assertCanCreate(entity, principal) {
  requireNotViewer(principal);
  if (entity === 'clients') requireManager(principal);
}

function assertCanModify(entity, record, principal) {
  requireNotViewer(principal);
  if (MANAGERS.has(principal.role)) return;
  if (entity === 'clients') fail('forbidden', 403);
  // Operators may read organization-wide records (useful for coordination), but
  // may write only records they created or that are assigned to their verified
  // server-side email address.
  if (record.createdBy !== principal.subject && record.assigneeEmail !== principal.email) fail('forbidden', 403);
}

function assertCanTransition(entity, record, target, principal) {
  assertCanModify(entity, record, principal);
  if (entity === 'documents' && (target === 'approved' || target === 'archived')) requireManager(principal);
  if (entity === 'documents' && principal.role === 'operator' && !(record.status === 'draft' && target === 'in_review')) {
    fail('forbidden', 403);
  }
}

async function assertLinks(tx, entity, record, orgId) {
  const links = [];
  if (entity === 'requests' && record.clientId) links.push(['clients', record.clientId]);
  if (entity === 'tasks') {
    if (record.requestId) links.push(['requests', record.requestId]);
    if (record.clientId) links.push(['clients', record.clientId]);
  }
  if (entity === 'documents') {
    if (record.requestId) links.push(['requests', record.requestId]);
    if (record.clientId) links.push(['clients', record.clientId]);
  }
  for (const [collection, id] of links) {
    const linked = await tx.get(collection, id);
    assertStoredRecord(linked, collection, id, orgId);
  }
}

function payloadHash(value) {
  return sha256(canonical(value));
}

function idempotencyId(principal, operation, key) {
  return `idem-${sha256(`${principal.subject}\u0000${operation}\u0000${key}`).slice(0, 56)}`;
}

function normalizeIdempotencyKey(key) {
  if (key === undefined || key === null || key === '') return randomUUID();
  if (!validUuid(key)) fail('invalid_idempotency_key');
  return key.toLowerCase();
}

function requiredIdempotencyKey(key) {
  if (!validUuid(key)) fail('invalid_idempotency_key');
  return key.toLowerCase();
}

function aiJobId(principal, key) {
  return `aijob-${sha256(`${principal.subject}\u0000ai_draft\u0000${key}`).slice(0, 56)}`;
}

function assertAiJob(job, id, principal, orgId) {
  if (!isPlainObject(job)
    || job.id !== id
    || job.orgId !== orgId
    || job.actorSubject !== principal.subject
    || !Number.isInteger(job.version)
    || job.version < 1
    || !['running', 'completed', 'failed'].includes(job.state)
    || !validUuid(job.requestId)
    || !AI_DRAFT_PURPOSES.has(job.purpose)
    || !Number.isInteger(job.sourceVersion)
    || job.sourceVersion < 1
    || !validUuid(job.reservationId)
    || !validDay(job.reservationDate)) {
    fail('ai_draft_job_invalid', 409);
  }
  return job;
}

async function beginIdempotency(tx, { principal, operation, idempotencyKey, payload, orgId }) {
  const key = normalizeIdempotencyKey(idempotencyKey);
  const hash = payloadHash(payload);
  const id = idempotencyId(principal, operation, key);
  const existing = await tx.get('idempotency', id);
  if (existing) {
    if (existing.orgId !== orgId || existing.actorSubject !== principal.subject || existing.operation !== operation || existing.payloadHash !== hash) {
      fail('idempotency_key_reused', 409);
    }
    const entity = await tx.get(existing.entityCollection, existing.entityId);
    if (!entity) fail('idempotency_receipt_invalid', 409);
    return { replayed: true, record: entity };
  }
  return { replayed: false, id, keyHash: sha256(key), payloadHash: hash };
}

function receiptFor(idempotency, principal, operation, collection, entityId, timestamp) {
  return {
    id: idempotency.id,
    orgId: principal.orgId,
    actorSubject: principal.subject,
    operation,
    payloadHash: idempotency.payloadHash,
    idempotencyKeyHash: idempotency.keyHash,
    entityCollection: collection,
    entityId,
    createdAt: timestamp,
  };
}

function auditFor({ entity, record, action, principal, timestamp }) {
  return {
    id: randomUUID(),
    orgId: principal.orgId,
    entity,
    entityId: record.id,
    action,
    actorSubject: principal.subject,
    actorRole: principal.role,
    version: record.version,
    occurredAt: timestamp,
  };
}

function revisionFor(document, action, principal, timestamp) {
  return {
    id: randomUUID(),
    orgId: principal.orgId,
    documentId: document.id,
    documentVersion: document.version,
    content: document.content,
    contentSha256: sha256(document.content),
    action,
    createdAt: timestamp,
    createdBy: principal.subject,
    approval: document.status === 'approved'
      ? {
        type: 'internal_human_approval',
        legalSignature: false,
        approvedAt: document.approvedAt,
        approvedBy: document.approvedBy,
      }
      : { type: 'not_approved', legalSignature: false },
  };
}

/** All mutation records are staged only after every required read has finished. */
function writeAtomic(tx, {
  entity,
  record,
  create = false,
  action,
  principal,
  timestamp,
  idempotency,
}) {
  let output = record;
  let revision = null;
  if (entity === 'documents') {
    revision = revisionFor(output, action, principal, timestamp);
    const priorIds = Array.isArray(output.revisionIds) ? output.revisionIds.filter((id) => typeof id === 'string') : [];
    output = { ...output, revisionIds: [...priorIds, revision.id] };
  }

  if (create) tx.create(entity, output.id, output);
  else tx.set(entity, output.id, output);
  const audit = auditFor({ entity, record: output, action, principal, timestamp });
  tx.create('audit', audit.id, audit);
  if (idempotency) {
    const receipt = receiptFor(idempotency, principal, action, entity, output.id, timestamp);
    tx.create('idempotency', receipt.id, receipt);
  }
  if (revision) tx.create('document_revisions', revision.id, revision);
  return output;
}

function updatedRecord(entity, current, patch, timestamp) {
  const result = { ...current, ...patch, updatedAt: timestamp, version: current.version + 1 };
  delete result.revise;
  result.searchTokens = searchTokensFor(searchValues(entity, result));
  return result;
}

function stripDocumentApproval(document) {
  const output = { ...document };
  delete output.approvedAt;
  delete output.approvedBy;
  delete output.approvedVersion;
  return output;
}

function parseListOptions(entity, options = {}) {
  if (!isPlainObject(options)) fail('invalid_query');
  const { limit = 50, cursor = '', q = '', status = '' } = options;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('invalid_limit');
  if (typeof cursor !== 'string' || (cursor && !validUuid(cursor))) fail('invalid_cursor');
  if (typeof q !== 'string' || q.length > 80) fail('invalid_query');
  if (typeof status !== 'string' || (status && !STATUSES[entity].has(status))) fail('invalid_status');
  const normalizedQuery = q ? normalizeSearch(q) : '';
  if (q && (!normalizedQuery || normalizedQuery.includes(' '))) fail('invalid_query');
  if (normalizedQuery && status) fail('query_combination_not_supported');
  return { limit, cursor: cursor.toLowerCase(), q: normalizedQuery, status };
}

function publicReportRow(entity, record) {
  const common = {
    entity,
    id: record.id,
    status: record.status,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (entity === 'clients') return { ...common, name: record.name, city: record.city };
  if (entity === 'documents') return { ...common, title: record.title, kind: record.kind, requestId: record.requestId || '', clientId: record.clientId || '' };
  return { ...common, title: record.title, priority: record.priority, requestId: record.requestId || '', clientId: record.clientId || '' };
}

/**
 * The service owns business validation and authorization. HTTP/auth code must
 * pass an already verified principal; this module still enforces authentication,
 * organization match, and role constraints on every public operation.
 */
export function createOperationsService({ store, orgId = 'fursan', now = () => new Date() } = {}) {
  assertStore(store);
  if (typeof orgId !== 'string' || !orgId || orgId.includes('/')) fail('invalid_org_id', 500);
  if (typeof now !== 'function') fail('invalid_clock', 500);

  async function getRecord(entity, id, principal) {
    requireEntity(entity);
    const actor = assertPrincipal(principal, orgId);
    if (!validUuid(id)) fail('invalid_id');
    const record = await store.get(entity, id.toLowerCase());
    return assertStoredRecord(record, entity, id.toLowerCase(), actor.orgId);
  }

  return Object.freeze({
    async list(entity, options = {}, principal) {
      requireEntity(entity);
      assertPrincipal(principal, orgId);
      const query = parseListOptions(entity, options);
      const result = await store.list(entity, query);
      // The store is org-scoped in Firestore and tests use a dedicated memory
      // store. Still fail closed rather than returning malformed/cross-org rows.
      const items = [];
      for (const item of result.items || []) {
        if (!isPlainObject(item) || item.orgId !== orgId || !validUuid(item.id)) continue;
        items.push(item);
      }
      return { items, nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : '' };
    },

    async get(entity, id, principal) {
      return getRecord(entity, id, principal);
    },

    async create(entity, input, principal, { idempotencyKey } = {}) {
      requireEntity(entity);
      const actor = assertPrincipal(principal, orgId);
      assertCanCreate(entity, actor);
      const normalized = normalizeEntityInput(entity, input, actor, { create: true });
      const timestamp = nowIso(now);
      const operation = `create:${entity}`;
      return store.runTransaction(async (tx) => {
        const idem = await beginIdempotency(tx, {
          principal: actor,
          operation,
          idempotencyKey,
          payload: { entity, input: normalized },
          orgId,
        });
        if (idem.replayed) return assertStoredRecord(idem.record, entity, idem.record.id, orgId);

        const record = entityRecord(entity, normalized, actor, timestamp);
        await assertLinks(tx, entity, record, orgId);
        return writeAtomic(tx, {
          entity,
          record,
          create: true,
          action: operation,
          principal: actor,
          timestamp,
          idempotency: idem,
        });
      });
    },

    async update(entity, id, input, principal, { version, idempotencyKey } = {}) {
      requireEntity(entity);
      const actor = assertPrincipal(principal, orgId);
      if (!validUuid(id)) fail('invalid_id');
      assertVersion(version);
      const normalized = normalizeEntityInput(entity, input, actor);
      const timestamp = nowIso(now);
      const normalizedId = id.toLowerCase();
      const operation = `update:${entity}`;
      return store.runTransaction(async (tx) => {
        const idem = await beginIdempotency(tx, {
          principal: actor,
          operation,
          idempotencyKey,
          payload: { entity, id: normalizedId, version, input: normalized },
          orgId,
        });
        if (idem.replayed) return assertStoredRecord(idem.record, entity, normalizedId, orgId);

        const current = assertStoredRecord(await tx.get(entity, normalizedId), entity, normalizedId, orgId);
        assertCanModify(entity, current, actor);
        if (current.version !== version) fail('version_conflict', 409);
        if (entity === 'documents' && current.status === 'archived') fail('terminal_status', 409);

        let next;
        if (entity === 'documents' && current.status === 'approved') {
          if (normalized.revise !== true) fail('document_revise_required', 409);
          requireManager(actor);
          next = stripDocumentApproval(updatedRecord(entity, current, normalized, timestamp));
          next.status = 'draft';
        } else {
          if (normalized.revise === true) fail('document_not_approved', 409);
          next = updatedRecord(entity, current, normalized, timestamp);
        }
        // Request AI permission binds to a specific request version. Any
        // general edit invalidates it rather than silently reusing approval.
        if (entity === 'requests') next.aiUseApproval = null;
        await assertLinks(tx, entity, next, orgId);
        return writeAtomic(tx, {
          entity,
          record: next,
          action: operation,
          principal: actor,
          timestamp,
          idempotency: idem,
        });
      });
    },

    async transition(entity, id, { status, version } = {}, principal, { idempotencyKey } = {}) {
      requireEntity(entity);
      const actor = assertPrincipal(principal, orgId);
      if (!validUuid(id)) fail('invalid_id');
      if (typeof status !== 'string' || !STATUSES[entity].has(status)) fail('invalid_status');
      assertVersion(version);
      const normalizedId = id.toLowerCase();
      const timestamp = nowIso(now);
      const operation = `transition:${entity}`;
      return store.runTransaction(async (tx) => {
        const idem = await beginIdempotency(tx, {
          principal: actor,
          operation,
          idempotencyKey,
          payload: { entity, id: normalizedId, status, version },
          orgId,
        });
        if (idem.replayed) return assertStoredRecord(idem.record, entity, normalizedId, orgId);

        const current = assertStoredRecord(await tx.get(entity, normalizedId), entity, normalizedId, orgId);
        assertCanTransition(entity, current, status, actor);
        if (current.version !== version) fail('version_conflict', 409);
        if (!TRANSITIONS[entity][current.status].has(status)) fail('invalid_transition', 409);

        let next = updatedRecord(entity, current, { status }, timestamp);
        if (entity === 'documents' && status === 'approved') {
          next.approvedAt = timestamp;
          next.approvedBy = actor.subject;
          next.approvedVersion = next.version;
        }
        if (entity === 'requests') next.aiUseApproval = null;
        return writeAtomic(tx, {
          entity,
          record: next,
          action: operation,
          principal: actor,
          timestamp,
          idempotency: idem,
        });
      });
    },

    async approveAiUse(id, { version, classification } = {}, principal, { idempotencyKey } = {}) {
      const actor = assertPrincipal(principal, orgId);
      requireManager(actor);
      if (!validUuid(id)) fail('invalid_id');
      assertVersion(version);
      if (classification !== 'non_sensitive') fail('invalid_ai_classification');
      const normalizedId = id.toLowerCase();
      const timestamp = nowIso(now);
      const operation = 'approve_ai_use:requests';
      return store.runTransaction(async (tx) => {
        const idem = await beginIdempotency(tx, {
          principal: actor,
          operation,
          idempotencyKey,
          payload: { id: normalizedId, version, classification },
          orgId,
        });
        if (idem.replayed) return assertStoredRecord(idem.record, 'requests', normalizedId, orgId);

        const current = assertStoredRecord(await tx.get('requests', normalizedId), 'requests', normalizedId, orgId);
        if (current.version !== version) fail('version_conflict', 409);
        if (current.status === 'closed') fail('invalid_transition', 409);
        const next = updatedRecord('requests', current, {}, timestamp);
        next.aiUseApproval = {
          status: 'approved',
          classification: 'non_sensitive',
          approvedAt: timestamp,
          approvedBy: actor.subject,
          validForVersion: next.version,
          internalHumanApproval: true,
        };
        return writeAtomic(tx, {
          entity: 'requests',
          record: next,
          action: operation,
          principal: actor,
          timestamp,
          idempotency: idem,
        });
      });
    },

    async documentHistory(id, principal) {
      const document = await getRecord('documents', id, principal);
      const revisionIds = Array.isArray(document.revisionIds) ? document.revisionIds : [];
      const history = [];
      for (const revisionId of revisionIds.slice(-200)) {
        const revision = await store.get('document_revisions', revisionId);
        if (isPlainObject(revision) && revision.orgId === orgId && revision.documentId === document.id) history.push(revision);
      }
      return history.sort((left, right) => left.documentVersion - right.documentVersion);
    },

    async exportReport(principal) {
      requireManager(assertPrincipal(principal, orgId));
      const aggregate = safeObject();
      const rows = [];
      const perEntityRows = 25;
      const scanCap = 1000;
      let truncated = false;
      for (const entity of ENTITY_NAMES) {
        const counts = safeObject();
        let cursor = '';
        let scanned = 0;
        let kept = 0;
        do {
          const page = await store.list(entity, { limit: 100, cursor, q: '', status: '' });
          for (const record of page.items || []) {
            if (!isPlainObject(record) || record.orgId !== orgId || !validUuid(record.id)) continue;
            counts[record.status] = (counts[record.status] || 0) + 1;
            scanned += 1;
            if (kept < perEntityRows) {
              rows.push(publicReportRow(entity, record));
              kept += 1;
            }
            if (scanned >= scanCap) break;
          }
          cursor = page.nextCursor || '';
          if (scanned >= scanCap && cursor) truncated = true;
        } while (cursor && scanned < scanCap);
        aggregate[entity] = { total: scanned, byStatus: counts, truncated: scanned >= scanCap && Boolean(cursor) };
      }
      return { aggregate, rows, rowsBounded: perEntityRows * ENTITY_NAMES.size, truncated };
    },

    /**
     * Reserves one daily AI invocation before a model is called. The returned
     * `{ reservationId, reservationDate }` must be supplied to saveAiDraft;
     * reservations consume quota even if a later model call fails.
     */
    async reserveAiQuota(principal, { dailyLimit = 10 } = {}) {
      const actor = assertPrincipal(principal, orgId);
      requireNotViewer(actor);
      if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) fail('invalid_ai_limit');
      const timestamp = nowIso(now);
      const reservationDate = dayFromIso(timestamp);
      const usageId = `aiquota-${sha256(`${actor.subject}\u0000${reservationDate}`).slice(0, 48)}`;
      const reservationId = randomUUID();
      return store.runTransaction(async (tx) => {
        // There is no client-provided key for this fixed interface; a generated
        // receipt still makes the successful quota write auditable.
        const idem = await beginIdempotency(tx, {
          principal: actor,
          operation: 'reserve_ai_quota',
          payload: { dailyLimit, reservationDate, reservationId },
          orgId,
        });
        const existing = await tx.get('ai_usage', usageId);
        const current = existing && isPlainObject(existing) && existing.orgId === orgId ? existing : null;
        const effectiveLimit = current ? Math.min(current.dailyLimit, dailyLimit) : dailyLimit;
        const used = current ? current.used : 0;
        if (!Number.isInteger(used) || used < 0 || used >= effectiveLimit) fail('ai_quota_exceeded', 429);
        const reservations = Array.isArray(current?.reservations) ? current.reservations.slice() : [];
        if (reservations.length >= 100) fail('ai_quota_exceeded', 429);
        reservations.push({ id: reservationId, state: 'reserved', reservedAt: timestamp });
        const usage = {
          ...(current || {
            id: usageId,
            orgId,
            subject: actor.subject,
            createdAt: timestamp,
            createdBy: actor.subject,
            version: 0,
          }),
          date: reservationDate,
          dailyLimit: effectiveLimit,
          used: used + 1,
          reservations,
          updatedAt: timestamp,
          version: (current?.version || 0) + 1,
        };
        // All reads (receipt and daily quota) occurred before these writes.
        if (current) tx.set('ai_usage', usageId, usage);
        else tx.create('ai_usage', usageId, usage);
        const audit = auditFor({ entity: 'ai_usage', record: usage, action: 'reserve_ai_quota', principal: actor, timestamp });
        tx.create('audit', audit.id, audit);
        const receipt = receiptFor(idem, actor, 'reserve_ai_quota', 'ai_usage', usageId, timestamp);
        tx.create('idempotency', receipt.id, receipt);
        return { reservationId, reservationDate, used: usage.used, dailyLimit: effectiveLimit, remaining: effectiveLimit - usage.used };
      });
    },

    /**
     * Atomically claims one model invocation for an actor/key/request tuple.
     * A job is the durable receipt: running and failed jobs never initiate a
     * replacement model call, while a completed job replays its saved document.
     */
    async beginAiDraft(input, principal, { idempotencyKey, dailyLimit = 10 } = {}) {
      const actor = assertPrincipal(principal, orgId);
      requireNotViewer(actor);
      validateKeys(input, new Set(['requestId', 'purpose', 'sourceVersion']));
      const requestId = optionalId(input, 'requestId', false);
      if (!requestId || typeof input.purpose !== 'string' || !AI_DRAFT_PURPOSES.has(input.purpose)) fail('invalid_input');
      const suppliedSourceVersion = own(input, 'sourceVersion') ? input.sourceVersion : undefined;
      if (own(input, 'sourceVersion')) assertVersion(suppliedSourceVersion);
      if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) fail('invalid_ai_limit');

      const key = requiredIdempotencyKey(idempotencyKey);
      const keyHash = sha256(key);
      const jobId = aiJobId(actor, key);
      const timestamp = nowIso(now);
      const reservationDate = dayFromIso(timestamp);
      const usageId = `aiquota-${sha256(`${actor.subject}\u0000${reservationDate}`).slice(0, 48)}`;

      return store.runTransaction(async (tx) => {
        const existingJob = await tx.get('ai_jobs', jobId);
        if (existingJob) {
          const job = assertAiJob(existingJob, jobId, actor, orgId);
          if (job.idempotencyKeyHash !== keyHash
            || job.requestId !== requestId
            || job.purpose !== input.purpose
            || (suppliedSourceVersion !== undefined && job.sourceVersion !== suppliedSourceVersion)) {
            fail('idempotency_key_reused', 409);
          }
          if (job.state === 'running') fail('ai_draft_in_progress', 409);
          if (job.state === 'failed') fail('ai_draft_failed', 409);
          if (!validUuid(job.documentId)) fail('ai_draft_job_invalid', 409);
          const document = assertStoredRecord(await tx.get('documents', job.documentId), 'documents', job.documentId, orgId);
          return { state: 'completed', jobId, requestId: job.requestId, sourceVersion: job.sourceVersion, document };
        }

        const request = assertStoredRecord(await tx.get('requests', requestId), 'requests', requestId, orgId);
        if (request.status === 'closed') fail('closed_request', 409);
        const sourceVersion = suppliedSourceVersion === undefined ? request.version : suppliedSourceVersion;
        if (request.version !== sourceVersion) fail('ai_source_version_changed', 409);
        const approval = request.aiUseApproval;
        if (!isPlainObject(approval)
          || approval.status !== 'approved'
          || approval.classification !== 'non_sensitive'
          || approval.validForVersion !== request.version) {
          fail('ai_approval_required', 409);
        }

        const existingUsage = await tx.get('ai_usage', usageId);
        if (existingUsage && (!isPlainObject(existingUsage) || existingUsage.orgId !== orgId || existingUsage.subject !== actor.subject)) {
          fail('ai_quota_invalid', 409);
        }
        const currentUsage = existingUsage || null;
        const effectiveLimit = currentUsage ? Math.min(currentUsage.dailyLimit, dailyLimit) : dailyLimit;
        const used = currentUsage ? currentUsage.used : 0;
        if (!Number.isInteger(effectiveLimit) || effectiveLimit < 1 || !Number.isInteger(used) || used < 0 || used >= effectiveLimit) {
          fail('ai_quota_exceeded', 429);
        }
        const reservations = Array.isArray(currentUsage?.reservations) ? currentUsage.reservations.slice() : [];
        if (reservations.length >= 100) fail('ai_quota_exceeded', 429);
        const reservationId = randomUUID();
        reservations.push({ id: reservationId, state: 'reserved', reservedAt: timestamp, jobId });
        const usage = {
          ...(currentUsage || {
            id: usageId,
            orgId,
            subject: actor.subject,
            createdAt: timestamp,
            createdBy: actor.subject,
            version: 0,
          }),
          date: reservationDate,
          dailyLimit: effectiveLimit,
          used: used + 1,
          reservations,
          updatedAt: timestamp,
          version: (currentUsage?.version || 0) + 1,
        };
        const job = {
          id: jobId,
          orgId,
          actorSubject: actor.subject,
          idempotencyKeyHash: keyHash,
          requestId,
          purpose: input.purpose,
          sourceVersion,
          reservationId,
          reservationDate,
          state: 'running',
          createdAt: timestamp,
          updatedAt: timestamp,
          version: 1,
        };
        // Every transaction read is complete before these writes.
        if (currentUsage) tx.set('ai_usage', usageId, usage);
        else tx.create('ai_usage', usageId, usage);
        const audit = auditFor({ entity: 'ai_usage', record: usage, action: 'reserve_ai_quota', principal: actor, timestamp });
        tx.create('audit', audit.id, audit);
        tx.create('ai_jobs', jobId, job);
        return {
          state: 'claimed',
          jobId,
          request,
          sourceVersion,
          reservationId,
          reservationDate,
          used: usage.used,
          dailyLimit: effectiveLimit,
          remaining: effectiveLimit - usage.used,
        };
      });
    },

    /** Saves only a draft document after the claimed job verifies current version and approval. */
    async completeAiDraft(input, principal) {
      const actor = assertPrincipal(principal, orgId);
      requireNotViewer(actor);
      validateKeys(input, new Set(['jobId', 'title', 'kind', 'content']));
      if (typeof input.jobId !== 'string' || !AI_JOB_ID.test(input.jobId)) fail('invalid_input');
      const title = stringValue(input, 'title', { required: true, max: 160 });
      const kind = kindValue(input, true);
      const content = stringValue(input, 'content', { required: true, max: 12000, preserveNewlines: true });
      const timestamp = nowIso(now);

      return store.runTransaction(async (tx) => {
        const job = assertAiJob(await tx.get('ai_jobs', input.jobId), input.jobId, actor, orgId);
        if (job.state === 'failed') fail('ai_draft_failed', 409);
        if (job.state === 'completed') {
          if (!validUuid(job.documentId)) fail('ai_draft_job_invalid', 409);
          return assertStoredRecord(await tx.get('documents', job.documentId), 'documents', job.documentId, orgId);
        }

        const request = assertStoredRecord(await tx.get('requests', job.requestId), 'requests', job.requestId, orgId);
        const usageId = `aiquota-${sha256(`${actor.subject}\u0000${job.reservationDate}`).slice(0, 48)}`;
        const usage = await tx.get('ai_usage', usageId);
        if (request.version !== job.sourceVersion) fail('ai_source_version_changed', 409);
        const approval = request.aiUseApproval;
        if (!isPlainObject(approval)
          || approval.status !== 'approved'
          || approval.classification !== 'non_sensitive'
          || approval.validForVersion !== request.version) {
          fail('ai_approval_required', 409);
        }
        if (!isPlainObject(usage) || usage.orgId !== orgId || usage.subject !== actor.subject || !Number.isInteger(usage.version)) {
          fail('ai_reservation_required', 409);
        }
        const reservationIndex = Array.isArray(usage.reservations)
          ? usage.reservations.findIndex((reservation) => (
            reservation?.id === job.reservationId && reservation.state === 'reserved' && reservation.jobId === job.id
          ))
          : -1;
        if (reservationIndex < 0) fail('ai_reservation_required', 409);

        const documentInput = normalizeEntityInput('documents', {
          title,
          kind,
          content,
          requestId: job.requestId,
        }, actor, { create: true });
        const record = entityRecord('documents', documentInput, actor, timestamp);
        record.aiAssisted = true;
        record.aiSourceRequestId = request.id;
        record.aiApprovalVersion = approval.validForVersion;
        await assertLinks(tx, 'documents', record, orgId);

        const reservations = usage.reservations.map((reservation, index) => (
          index === reservationIndex ? { ...reservation, state: 'saved', savedAt: timestamp, documentId: record.id } : reservation
        ));
        const nextUsage = { ...usage, reservations, updatedAt: timestamp, version: usage.version + 1 };
        const nextJob = {
          ...job,
          state: 'completed',
          documentId: record.id,
          completedAt: timestamp,
          updatedAt: timestamp,
          version: job.version + 1,
        };
        writeAtomic(tx, {
          entity: 'documents',
          record,
          create: true,
          action: 'save_ai_draft:documents',
          principal: actor,
          timestamp,
        });
        tx.set('ai_usage', usageId, nextUsage);
        tx.set('ai_jobs', job.id, nextJob);
        return record;
      });
    },

    /** Marks a claimed slot terminal after an inference or post-inference failure. */
    async failAiDraft({ jobId, code } = {}, principal) {
      const actor = assertPrincipal(principal, orgId);
      requireNotViewer(actor);
      if (typeof jobId !== 'string' || !AI_JOB_ID.test(jobId)) fail('invalid_input');
      const failureCode = AI_DRAFT_FAILURE_CODES.has(code) ? code : 'ai_draft_failed';
      const timestamp = nowIso(now);
      return store.runTransaction(async (tx) => {
        const job = assertAiJob(await tx.get('ai_jobs', jobId), jobId, actor, orgId);
        if (job.state !== 'running') return job;
        const next = {
          ...job,
          state: 'failed',
          failureCode,
          failedAt: timestamp,
          updatedAt: timestamp,
          version: job.version + 1,
        };
        tx.set('ai_jobs', jobId, next);
        return next;
      });
    },

    /**
     * Saves a human-reviewable document draft after a quota reservation.
     * Contract: input is `{requestId, sourceVersion, reservationId,
     * reservationDate, title, kind, content, clientId?}`; only a currently approved, non-sensitive
     * request version may be used. This never sends, approves, or decides.
     */
    async saveAiDraft(input, principal, { idempotencyKey } = {}) {
      const actor = assertPrincipal(principal, orgId);
      requireNotViewer(actor);
      const allowed = new Set(['requestId', 'sourceVersion', 'reservationId', 'reservationDate', 'title', 'kind', 'content', 'clientId']);
      validateKeys(input, allowed);
      const requestId = optionalId(input, 'requestId', false);
      const reservationId = optionalId(input, 'reservationId', false);
      const reservationDate = optionalDay(input, 'reservationDate', false);
      if (!requestId || !reservationId || !reservationDate) fail('invalid_input');
      if (!own(input, 'sourceVersion')) fail('invalid_input');
      assertVersion(input.sourceVersion);
      const documentInput = normalizeEntityInput('documents', {
        title: input.title,
        kind: input.kind,
        content: input.content,
        requestId,
        ...(own(input, 'clientId') ? { clientId: input.clientId } : {}),
      }, actor, { create: true });
      const timestamp = nowIso(now);
      const usageId = `aiquota-${sha256(`${actor.subject}\u0000${reservationDate}`).slice(0, 48)}`;
      const operation = 'save_ai_draft:documents';
      return store.runTransaction(async (tx) => {
        const idem = await beginIdempotency(tx, {
          principal: actor,
          operation,
          idempotencyKey,
          payload: { requestId, sourceVersion: input.sourceVersion, reservationId, reservationDate, document: documentInput },
          orgId,
        });
        if (idem.replayed) return assertStoredRecord(idem.record, 'documents', idem.record.id, orgId);

        const request = assertStoredRecord(await tx.get('requests', requestId), 'requests', requestId, orgId);
        if (request.version !== input.sourceVersion) fail('ai_source_version_changed', 409);
        const usage = await tx.get('ai_usage', usageId);
        if (!isPlainObject(usage) || usage.orgId !== orgId || usage.subject !== actor.subject) fail('ai_reservation_required', 409);
        const reservationIndex = Array.isArray(usage.reservations)
          ? usage.reservations.findIndex((reservation) => reservation?.id === reservationId && reservation.state === 'reserved')
          : -1;
        if (reservationIndex < 0) fail('ai_reservation_required', 409);
        const approval = request.aiUseApproval;
        if (!isPlainObject(approval) || approval.status !== 'approved' || approval.classification !== 'non_sensitive' || approval.validForVersion !== request.version) {
          fail('ai_approval_required', 409);
        }
        const record = entityRecord('documents', documentInput, actor, timestamp);
        record.aiAssisted = true;
        record.aiSourceRequestId = request.id;
        record.aiApprovalVersion = approval.validForVersion;
        await assertLinks(tx, 'documents', record, orgId);

        const reservations = usage.reservations.map((reservation, index) => (
          index === reservationIndex ? { ...reservation, state: 'saved', savedAt: timestamp, documentId: record.id } : reservation
        ));
        const nextUsage = { ...usage, reservations, updatedAt: timestamp, version: usage.version + 1 };
        const output = writeAtomic(tx, {
          entity: 'documents',
          record,
          create: true,
          action: operation,
          principal: actor,
          timestamp,
          idempotency: idem,
        });
        tx.set('ai_usage', usageId, nextUsage);
        return output;
      });
    },
  });
}

export const OPERATIONS_STATUSES = STATUSES;
export const OPERATIONS_TRANSITIONS = TRANSITIONS;

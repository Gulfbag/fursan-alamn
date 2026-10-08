export const DEMO_SERVICE_DATE = '2026-10-08';

export const Roles = Object.freeze({
  operations: 'operations',
  supervisor: 'supervisor',
  guard: 'guard',
  client: 'client',
});

export const IncidentStatuses = Object.freeze({
  new: 'new',
  triaged: 'triaged',
  assigned: 'assigned',
  resolved: 'resolved',
  closed: 'closed',
});

export const incidentTransitions = Object.freeze({
  [IncidentStatuses.new]: [IncidentStatuses.triaged],
  [IncidentStatuses.triaged]: [IncidentStatuses.assigned],
  [IncidentStatuses.assigned]: [IncidentStatuses.resolved],
  [IncidentStatuses.resolved]: [IncidentStatuses.closed],
  [IncidentStatuses.closed]: [],
});

const reviewDecisions = new Set(['exclude', 'follow', 'create-incident-after-review']);
const clone = (value) => structuredClone(value);
const entityKey = Object.freeze({
  sites: 'sites',
  contracts: 'contracts',
  incidents: 'incidents',
  reports: 'reports',
  tasks: 'tasks',
  videoEvents: 'videoEvents',
});

export function viewerFor(state, role) {
  const viewer = state.roleContexts?.[role];
  if (!viewer) throw new TypeError(`Unknown demo role: ${role}`);
  return viewer;
}

export function isAssignedToSite(viewer, siteId) {
  return viewer.role === Roles.operations || viewer.siteId === siteId;
}

export function isAssignedToContract(viewer, contractId) {
  return viewer.role === Roles.operations || viewer.contractId === contractId;
}

/**
 * Authorisation is deliberately client-side display logic for this demo only.
 * It must be reimplemented and enforced by a production server.
 */
export function canReadEntity(state, viewer, entity, record) {
  if (!record || !Object.hasOwn(entityKey, entity)) return false;
  if (viewer.role === Roles.operations) return true;

  if (viewer.role === Roles.client) {
    if (entity === 'reports') {
      return record.contractId === viewer.contractId
        && record.status === 'approved'
        && record.visibility === 'client-aggregate';
    }
    if (entity === 'sites' || entity === 'contracts') return record.contractId === viewer.contractId || record.id === viewer.contractId;
    return false;
  }

  if (entity === 'videoEvents') return viewer.role === Roles.supervisor && isAssignedToSite(viewer, record.siteId);
  if (entity === 'reports') return viewer.role === Roles.supervisor && isAssignedToSite(viewer, record.siteId);
  return isAssignedToSite(viewer, record.siteId);
}

export function canCreateIncident(viewer, siteId) {
  return (viewer.role === Roles.guard || viewer.role === Roles.supervisor || viewer.role === Roles.operations)
    && isAssignedToSite(viewer, siteId);
}

export function isValidIncidentTransition(from, to) {
  return (incidentTransitions[from] || []).includes(to);
}

export function canTransitionIncident(state, viewer, incident, to) {
  if (!incident || !isValidIncidentTransition(incident.status, to)) return false;
  if (!isAssignedToSite(viewer, incident.siteId)) return false;
  if (viewer.role === Roles.guard || viewer.role === Roles.client) return false;
  if (to === IncidentStatuses.closed) return canCloseIncident(state, viewer, incident);
  return viewer.role === Roles.operations || viewer.role === Roles.supervisor;
}

export function canApproveClosure(viewer, incident) {
  return viewer.role === Roles.operations
    && incident.status === IncidentStatuses.resolved
    && incident.closureProposal === true
    && incident.creatorId !== viewer.actorId
    && incident.reviewStatus !== 'approved';
}

export function canCloseIncident(state, viewer, incident) {
  return viewer.role === Roles.operations
    && isAssignedToSite(viewer, incident.siteId)
    && incident.status === IncidentStatuses.resolved
    && incident.closureProposal === true
    && incident.reviewStatus === 'approved'
    && incident.creatorId !== viewer.actorId;
}

export function canReviewVideoEvent(viewer, videoEvent) {
  return (viewer.role === Roles.operations || viewer.role === Roles.supervisor)
    && isAssignedToSite(viewer, videoEvent.siteId)
    && videoEvent.reviewStatus === 'pending';
}

export function createDemoState(seed) {
  return clone(seed);
}

function nextAuditTimestamp(state) {
  const index = (state.audit?.length || 0) + 1;
  return `${DEMO_SERVICE_DATE}T${String(9 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00Z`;
}

function addAudit(state, { actor, action, from = '—', to = '—', recordId }) {
  const entry = {
    id: `AUD-${String((state.audit?.length || 0) + 1).padStart(3, '0')}`,
    timestamp: nextAuditTimestamp(state),
    actor: actor.label,
    actorRole: actor.role,
    action,
    from,
    to,
    recordId,
  };
  return { ...state, audit: [entry, ...(state.audit || [])] };
}

export function createIncident(state, { viewer, title, service, siteId, detail = '' }) {
  if (!canCreateIncident(viewer, siteId)) throw new Error('incident_creation_not_allowed');
  const normalizedTitle = String(title || '').trim().slice(0, 140);
  if (normalizedTitle.length < 4) throw new Error('incident_title_invalid');
  const site = state.sites.find((item) => item.id === siteId);
  if (!site) throw new Error('site_not_found');
  const incident = {
    id: `I-${String(401 + state.incidents.length).padStart(3, '0')}`,
    siteId,
    contractId: site.contractId,
    title: { ar: normalizedTitle, en: normalizedTitle },
    service: String(service || 'guarding'),
    detail: String(detail || '').trim().slice(0, 280),
    serviceDate: DEMO_SERVICE_DATE,
    status: IncidentStatuses.new,
    creatorId: viewer.actorId,
    creatorRole: viewer.role,
    closureProposal: false,
    reviewStatus: 'not_requested',
  };
  return addAudit({ ...state, incidents: [incident, ...state.incidents] }, {
    actor: viewer,
    action: 'incident_created',
    from: '—',
    to: IncidentStatuses.new,
    recordId: incident.id,
  });
}

export function transitionIncident(state, { viewer, incidentId, to }) {
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!canTransitionIncident(state, viewer, incident, to)) throw new Error('incident_transition_not_allowed');
  const updated = { ...incident, status: to };
  const next = { ...state, incidents: state.incidents.map((item) => item.id === incidentId ? updated : item) };
  return addAudit(next, { actor: viewer, action: 'incident_transition', from: incident.status, to, recordId: incidentId });
}

export function approveClosureReview(state, { viewer, incidentId }) {
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!canApproveClosure(viewer, incident)) throw new Error('closure_review_not_allowed');
  const updated = { ...incident, reviewStatus: 'approved', reviewerId: viewer.actorId };
  const next = { ...state, incidents: state.incidents.map((item) => item.id === incidentId ? updated : item) };
  return addAudit(next, { actor: viewer, action: 'closure_review_approved', from: 'pending', to: 'approved', recordId: incidentId });
}

export function reviewVideoEvent(state, { viewer, eventId, decision }) {
  const videoEvent = state.videoEvents.find((item) => item.id === eventId);
  if (!videoEvent || !reviewDecisions.has(decision) || !canReviewVideoEvent(viewer, videoEvent)) throw new Error('video_review_not_allowed');
  const decisionStatus = decision === 'exclude' ? 'excluded' : decision === 'follow' ? 'follow_up' : 'incident_created';
  let next = {
    ...state,
    videoEvents: state.videoEvents.map((item) => item.id === eventId ? {
      ...item,
      reviewStatus: decisionStatus,
      reviewedByRole: viewer.role,
    } : item),
  };
  next = addAudit(next, { actor: viewer, action: `video_review_${decision}`, from: 'pending', to: decisionStatus, recordId: eventId });
  if (decision !== 'create-incident-after-review') return next;
  return createIncident(next, {
    viewer,
    siteId: videoEvent.siteId,
    service: 'video-review',
    title: videoEvent.incidentTitle.ar,
    detail: videoEvent.humanNote.ar,
  });
}

export function completeChecklistTask(state, { viewer, taskId }) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || task.status === 'completed' || !canReadEntity(state, viewer, 'tasks', task)) throw new Error('task_completion_not_allowed');
  if (viewer.role === Roles.client) throw new Error('task_completion_not_allowed');
  const updated = { ...task, status: 'completed', completedByRole: viewer.role };
  const next = { ...state, tasks: state.tasks.map((item) => item.id === taskId ? updated : item) };
  return addAudit(next, { actor: viewer, action: 'checklist_completed', from: 'open', to: 'completed', recordId: taskId });
}

export function buildLocalRuleBasedDraft(state, { viewer, incidentId }) {
  const incident = state.incidents.find((item) => item.id === incidentId);
  if (!incident || !canReadEntity(state, viewer, 'incidents', incident)) throw new Error('draft_not_allowed');
  const site = state.sites.find((item) => item.id === incident.siteId);
  const summary = {
    ar: `ملخص منظم للبلاغ ${incident.id}: الموقع ${site.name.ar}، الحالة ${incident.status}، تاريخ الخدمة ${incident.serviceDate}، الخدمة ${incident.service}. يتطلب المحتوى مراجعة بشرية قبل أي اعتماد.`,
    en: `Structured summary for incident ${incident.id}: site ${site.name.en}, status ${incident.status}, service date ${incident.serviceDate}, service ${incident.service}. Human review is required before any approval.`,
  };
  const draft = {
    id: `D-${String((state.drafts?.length || 0) + 1).padStart(3, '0')}`,
    incidentId,
    contractId: incident.contractId,
    status: 'draft',
    engine: 'LocalRuleBased',
    summary,
  };
  const next = { ...state, drafts: [draft, ...(state.drafts || [])] };
  return {
    state: addAudit(next, { actor: viewer, action: 'local_rule_based_draft_created', from: '—', to: 'draft', recordId: draft.id }),
    draft,
  };
}

export function deriveMetrics(state, viewer) {
  const readable = (entity, record) => canReadEntity(state, viewer, entity, record);
  const tasks = state.tasks.filter((item) => readable('tasks', item));
  const incidents = state.incidents.filter((item) => readable('incidents', item));
  const reports = state.reports.filter((item) => readable('reports', item));
  return {
    sites: state.sites.filter((item) => readable('sites', item)).length,
    openTasks: tasks.filter((item) => item.status !== 'completed').length,
    completedTasks: tasks.filter((item) => item.status === 'completed').length,
    openIncidents: incidents.filter((item) => item.status !== IncidentStatuses.closed).length,
    approvedReports: reports.filter((item) => item.status === 'approved').length,
  };
}

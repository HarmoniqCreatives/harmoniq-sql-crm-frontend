/**
 * Pure helpers for Transfer Lead form (unit-tested).
 */

/**
 * @param {{ primaryAgent?: { id?: string, name?: string } | null } | null | undefined} lead
 * @param {string} unassignedLabel
 * @returns {string}
 */
export function displayCurrentAgentName(lead, unassignedLabel) {
  const name = lead?.primaryAgent?.name
  if (name && String(name).trim()) {
    return String(name).trim()
  }
  return unassignedLabel
}

/**
 * Eligible Transfer To options: same-company agents already filtered by caller;
 * exclude the current primary so the user cannot re-select them.
 *
 * @param {Array<{ id: string, name?: string }>} agents
 * @param {string} currentAgentId
 * @returns {Array<{ id: string, name?: string }>}
 */
export function eligibleTransferAgents(agents, currentAgentId) {
  const list = Array.isArray(agents) ? agents : []
  if (!currentAgentId) {
    return list.slice()
  }
  return list.filter((agent) => agent && agent.id !== currentAgentId)
}

/**
 * Optional transfer reason: trim; empty becomes '' (DB allowNull:false convention).
 *
 * @param {unknown} reason
 * @returns {string}
 */
export function normalizeTransferReason(reason) {
  if (reason === null || reason === undefined) {
    return ''
  }
  return String(reason).trim()
}

/**
 * PATCH /assignment body for Transfer dialog — primary only; never touches secondary.
 *
 * @param {string} primaryAgentId
 * @param {unknown} reason
 * @returns {{ primaryAgentId: string, reason: string }}
 */
export function buildTransferAssignmentPayload(primaryAgentId, reason) {
  return {
    primaryAgentId: String(primaryAgentId || ''),
    reason: normalizeTransferReason(reason),
  }
}

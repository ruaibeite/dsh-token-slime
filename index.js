/**
 * @ruaibeite/dsh-token-slime — host half.
 *
 * Three jobs, all cheap and derived from the session log:
 *
 * 1. Register a `slime` session projection folding `tool/call` names into
 *    categories, `compaction/start` into growth rings, and `assistant/message`
 *    usage into output tokens. A `wire.view` sends the folded state to the
 *    browser, where the dock widget reads it with `useProjection("slime")`.
 * 2. Serve `GET /dsh-token-slime/colony`: the *total* colony across sessions.
 *    Live sessions are folded through the projection handle; stored sessions
 *    are read from the session projection cache (which already checkpoints
 *    `tokenUsage`), so the aggregate covers history without opening logs.
 * 3. Nothing else: no prompt, no tool, no model call, no session writes.
 *
 * The projection is host-only state until `wire.view` publishes it; a
 * compaction never reaches the model through this plugin.
 */

/** Route served to the browser half. */
export const ROUTE = '/dsh-token-slime/colony'

/** Services this plugin needs; without them it stays inactive. */
export const inject = ['sessionProjections', 'sessions']

/** Tool categories the slime recognizes. */
export const TOOL_CATEGORIES = ['engineer', 'explorer', 'scribe', 'scholar', 'other']

/** Species a tool mix can produce; `other` alone never names a breed. */
export const TOOL_SPECIES = ['engineer', 'explorer', 'scribe', 'scholar']

/** Growth model, mirrored in client.js so the widget and the aggregate agree. */
export const FIRST_SPLIT = 4000
export const GROWTH = 1.7
export const MAX_GEN = 9

/**
 * Safety valve on the number of session rows carried in one payload. The
 * colony is meant to cover EVERY session the host knows about (all stored
 * sessions from `sessionPersistence.list()` plus live ones), so this is set
 * far above any realistic session count and only guards against a pathological
 * store. `total.sessions` always reports the full, uncapped count.
 */
const MAX_SESSIONS = 100000

/** Cache the aggregate briefly: the panel polls, and listing stats every time is wasteful. */
const COLONY_TTL_MS = 8000

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))

/**
 * Fold one tool name into the slime's diet category.
 *
 * The mapping is intentionally broad: this Harness names tools by capability
 * (`run_code`, `bash`, `web_fetch`, `present`) and plugins add more, so an
 * unknown tool falls back to `other` instead of throwing.
 *
 * @param name - the `tool/call` name.
 * @returns one of {@link TOOL_CATEGORIES}.
 */
export function categoryOfTool(name) {
  const tool = typeof name === 'string' ? name.trim() : ''
  if (tool === '') return 'other'
  if (/(docx|pptx|xlsx|pdf|office|document|present)/i.test(tool)) return 'scribe'
  if (/^(web_search|web_fetch|websearch|webfetch|fetch|browse)/i.test(tool)) return 'explorer'
  if (/^(run_code|bash|pwsh|terminal|shell|exec|write|edit|apply_patch|str_replace|fs_write|fs_edit|jobs|job_|workflow|ralph|plugin_manager|worktree)/i.test(tool)) {
    return 'engineer'
  }
  if (/^(read|glob|grep|ls\b|find\b|skill|session_search|session_query|session_event|workspace|todo_read|ask_user)/i.test(tool)) {
    return 'scholar'
  }
  return 'other'
}

/** A zeroed category counter. */
export function emptyTools() {
  const tools = {}
  for (const category of TOOL_CATEGORIES) tools[category] = 0
  return tools
}

/** Initial projection state. */
export function initSlimeState() {
  return {
    outputTokens: 0,
    toolCalls: 0,
    tools: emptyTools(),
    compactions: 0,
    lastOutput: null,
  }
}

/** Whether two usage samples describe the same attempt (retry replacement). */
function sameAttempt(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined
    && left.turn === right.turn && left.step === right.step
}

/**
 * Pure fold of one committed session event into the slime state.
 *
 * Returns the same reference for events it ignores, which is the registry's
 * zero-work gate. Output-token accounting mirrors the shipped `tokenUsage`
 * unit: a retried attempt replaces the same turn/step sample instead of
 * double-counting it.
 *
 * @param state - current state.
 * @param event - one committed session event.
 * @returns the next state, or `state` unchanged.
 */
export function foldSlime(state, event) {
  if (event === null || typeof event !== 'object') return state
  if (event.type === 'tool/call') {
    const data = event.data !== null && typeof event.data === 'object' ? event.data : {}
    const category = categoryOfTool(data.name)
    const tools = { ...state.tools }
    tools[category] = num(tools[category]) + 1
    return { ...state, tools, toolCalls: state.toolCalls + 1 }
  }
  if (event.type === 'compaction/start') {
    return { ...state, compactions: state.compactions + 1 }
  }
  if (event.type === 'llm/retry-started') {
    const data = event.data !== null && typeof event.data === 'object' ? event.data : {}
    const last = state.lastOutput
    if (last === null || last === undefined || last.turn !== data.turn || last.step !== data.step) return state
    return { ...state, lastOutput: null }
  }
  if (event.type === 'assistant/message') {
    const data = event.data !== null && typeof event.data === 'object' ? event.data : {}
    const usage = data.usage !== null && typeof data.usage === 'object' ? data.usage : null
    if (usage === null) return state
    const sample = num(usage.outputTokens)
    const candidate = { turn: num(data.turn), step: num(data.step), value: sample }
    const previous = sameAttempt(state.lastOutput, candidate) ? state.lastOutput : null
    if (previous !== null && previous.value === sample) return state
    const outputTokens = state.outputTokens - (previous === null ? 0 : num(previous.value)) + sample
    return { ...state, outputTokens, lastOutput: candidate }
  }
  return state
}

/** Tolerant integer for stored state. */
function toCount(value) {
  const n = num(value)
  return n >= 0 ? Math.floor(n) : 0
}

/** Rebuild a validated state object from a stored/corrupted value. */
function parseSlimeState(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('token-slime: projection state must be an object')
  }
  const rawTools = value.tools !== null && typeof value.tools === 'object' ? value.tools : {}
  const tools = {}
  for (const category of TOOL_CATEGORIES) tools[category] = toCount(rawTools[category])
  let lastOutput = null
  if (value.lastOutput !== null && typeof value.lastOutput === 'object') {
    const turn = toCount(value.lastOutput.turn)
    const step = toCount(value.lastOutput.step)
    lastOutput = { turn, step, value: toCount(value.lastOutput.value) }
  }
  return {
    outputTokens: toCount(value.outputTokens),
    toolCalls: toCount(value.toolCalls),
    tools,
    compactions: toCount(value.compactions),
    lastOutput,
  }
}

/** Client-visible shape: no retry bookkeeping, only what the widget renders. */
function viewSlimeState(state) {
  return {
    outputTokens: state.outputTokens,
    toolCalls: state.toolCalls,
    tools: { ...state.tools },
    compactions: state.compactions,
  }
}

/** Parse a wire view, keeping only known fields. */
function parseSlimeView(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('token-slime: projection view must be an object')
  }
  const rawTools = value.tools !== null && typeof value.tools === 'object' ? value.tools : {}
  const tools = {}
  for (const category of TOOL_CATEGORIES) tools[category] = toCount(rawTools[category])
  return {
    outputTokens: toCount(value.outputTokens),
    toolCalls: toCount(value.toolCalls),
    tools,
    compactions: toCount(value.compactions),
  }
}

/**
 * The `slime` projection: tool diet, growth rings, and output-token food.
 *
 * `wire.summary` is false so the value stays out of session-list rows; the
 * colony route reads it explicitly with a key subset.
 */
export const SLIME_PROJECTION = {
  key: 'slime',
  stateVersion: 1,
  stateSchema: { parse: parseSlimeState },
  init: initSlimeState,
  apply: foldSlime,
  wire: {
    summary: false,
    viewSchema: { parse: parseSlimeView },
    view: viewSlimeState,
  },
}

/** Food (output tokens) required to leave generation `gen`. */
export function splitCost(gen) {
  return Math.round(FIRST_SPLIT * Math.pow(GROWTH, gen))
}

/**
 * Fold a session's output tokens into colony generations.
 * @param food - cumulative output tokens.
 * @returns generation, food toward the next split, its cost, and the 0..1 progress.
 */
export function colonyOf(food) {
  let gen = 0
  let rest = Math.max(0, num(food))
  let cost = splitCost(0)
  while (gen < MAX_GEN && rest >= cost) {
    rest -= cost
    gen += 1
    cost = splitCost(gen)
  }
  const progress = gen >= MAX_GEN ? 1 : clamp(cost > 0 ? rest / cost : 0, 0, 1)
  return { gen, rest, cost, progress }
}

/**
 * The breed a tool mix names: the most-called category, or `null` when the
 * session used no classified tools (the widget then falls back to the
 * token-diet breed).
 *
 * @param tools - category counter.
 * @returns a species id from {@link TOOL_SPECIES}, or `null`.
 */
export function speciesOfTools(tools) {
  if (tools === null || typeof tools !== 'object') return null
  let best = null
  let bestCount = 0
  for (const category of TOOL_SPECIES) {
    const count = num(tools[category])
    if (count > bestCount) {
      best = category
      bestCount = count
    }
  }
  return bestCount > 0 ? best : null
}

/**
 * Sum many sessions into one colony.
 *
 * @param entries - per-session `{ outputTokens, tools, toolCalls, compactions }`.
 * @returns totals plus the aggregate generation and breed.
 */
export function aggregateColony(entries) {
  const tools = emptyTools()
  let food = 0
  let toolCalls = 0
  let compactions = 0
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue
    food += num(entry.outputTokens)
    toolCalls += num(entry.toolCalls)
    compactions += num(entry.compactions)
    const entryTools = entry.tools !== null && typeof entry.tools === 'object' ? entry.tools : {}
    for (const category of TOOL_CATEGORIES) tools[category] += num(entryTools[category])
  }
  return {
    sessions: entries.length,
    food,
    toolCalls,
    compactions,
    tools,
    gen: colonyOf(food).gen,
    species: speciesOfTools(tools),
  }
}

/** Basename of a stored cwd, used when a session carries no title. */
function cwdLabel(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return null
  const parts = cwd.split(/[\\/]+/).filter((part) => part !== '')
  return parts.length === 0 ? null : parts[parts.length - 1]
}

/** Copy folded projection state onto a colony entry. */
function applySlime(entry, state) {
  if (state === null || typeof state !== 'object') return
  entry.outputTokens = Math.max(entry.outputTokens, num(state.outputTokens))
  entry.toolCalls = num(state.toolCalls)
  entry.compactions = num(state.compactions)
  const tools = state.tools !== null && typeof state.tools === 'object' ? state.tools : {}
  for (const category of TOOL_CATEGORIES) entry.tools[category] = num(tools[category])
}

/** Read one live session's folded state without letting a bad session kill the response. */
function stateOfSession(handle, session) {
  if (handle === null || handle === undefined || typeof handle.stateOf !== 'function') return null
  try {
    const state = handle.stateOf(session)
    return state !== null && typeof state === 'object' ? state : null
  } catch {
    return null
  }
}

/** Read a live session's title projection. */
function titleOfLive(ctx, session) {
  try {
    const projections = ctx.get('sessionProjections')
    if (projections === undefined || typeof projections.snapshot !== 'function') return null
    const snapshot = projections.snapshot(session, ['title'])
    const title = snapshot !== null && snapshot.values !== undefined ? snapshot.values.title : undefined
    return typeof title === 'string' ? title : null
  } catch {
    return null
  }
}

/**
 * Build the total-colony payload: every stored session plus live sessions
 * that are not persisted yet, each with its folded slime state.
 *
 * @param ctx - host plugin context.
 * @param handle - the retained `slime` projection handle, or `null`.
 * @returns the JSON payload served by {@link ROUTE}.
 */
export async function colonyPayload(ctx, handle) {
  const entries = new Map()
  const persistence = ctx.get('sessionPersistence')
  let listed = []
  if (persistence !== undefined && typeof persistence.list === 'function') {
    try {
      listed = (await persistence.list()) ?? []
    } catch {
      listed = []
    }
  }
  const cache = ctx.get('sessionProjectionCache')

  for (const item of listed) {
    const header = item !== null && typeof item === 'object' && item.header !== undefined ? item.header : item
    if (header === null || typeof header !== 'object' || typeof header.id !== 'string') continue
    const entry = {
      id: header.id,
      title: null,
      cwd: typeof header.cwd === 'string' ? header.cwd : null,
      outputTokens: 0,
      toolCalls: 0,
      tools: emptyTools(),
      compactions: 0,
    }
    const live = typeof ctx.sessions.get === 'function' ? ctx.sessions.get(header.id) : undefined
    if (live !== undefined && live !== null) {
      applySlime(entry, stateOfSession(handle, live))
      entry.title = titleOfLive(ctx, live)
    } else if (cache !== undefined && typeof cache.cachedSnapshot === 'function') {
      let block = null
      try {
        block = cache.cachedSnapshot(header, ['title', 'tokenUsage', 'slime'])
      } catch {
        block = null
      }
      const values = block !== null && block !== undefined && block.values !== undefined ? block.values : {}
      if (typeof values.title === 'string') entry.title = values.title
      if (values.slime !== null && typeof values.slime === 'object') {
        applySlime(entry, values.slime)
      } else if (values.tokenUsage !== null && typeof values.tokenUsage === 'object') {
        // The `slime` key only exists from the moment this plugin was enabled;
        // the shipped `tokenUsage` checkpoint carries history's food.
        entry.outputTokens = num(values.tokenUsage.outputTokens)
      }
    }
    if (entry.title === null) entry.title = cwdLabel(entry.cwd)
    entries.set(entry.id, entry)
  }

  const sessions = typeof ctx.sessions.list === 'function' ? ctx.sessions.list() : []
  for (const live of sessions ?? []) {
    if (live === null || live === undefined || typeof live.id !== 'string') continue
    if (entries.has(live.id)) continue
    const entry = {
      id: live.id,
      title: titleOfLive(ctx, live),
      cwd: null,
      outputTokens: 0,
      toolCalls: 0,
      tools: emptyTools(),
      compactions: 0,
    }
    applySlime(entry, stateOfSession(handle, live))
    entries.set(live.id, entry)
  }

  const all = [...entries.values()]
  const total = aggregateColony(all)
  const rows = all
    .slice()
    .sort((left, right) => right.outputTokens - left.outputTokens)
    .slice(0, MAX_SESSIONS)
    .map((entry) => {
      const colony = colonyOf(entry.outputTokens)
      return {
        id: entry.id,
        title: entry.title,
        outputTokens: entry.outputTokens,
        gen: colony.gen,
        progress: colony.progress,
        compactions: entry.compactions,
        species: speciesOfTools(entry.tools),
        tools: entry.tools,
      }
    })

  return {
    ok: true,
    generatedAt: Date.now(),
    total,
    sessions: rows,
  }
}

/**
 * Register the projection and the colony route.
 * @param ctx - host plugin context.
 */
export function apply(ctx) {
  const retention = { handle: null, disposed: false }

  ctx.effect(() => {
    const registration = ctx.sessionProjections.register(SLIME_PROJECTION)
    // The registration value is a callable thenable: awaiting it yields the
    // retained handle (registration itself belongs to this effect).
    Promise.resolve(registration).then(
      (handle) => {
        retention.handle = handle
        if (retention.disposed && typeof handle.dispose === 'function') handle.dispose()
      },
      (error) => {
        try {
          ctx.logger?.warn?.(`token-slime: projection registration failed: ${String(error)}`)
        } catch {
          /* logging must never break activation */
        }
      },
    )
    return () => {
      retention.disposed = true
      if (retention.handle !== null && typeof retention.handle.dispose === 'function') retention.handle.dispose()
    }
  }, 'token-slime: slime projection')

  ctx.inject(['webServer'], (hostCtx) => {
    const cache = { at: 0, payload: null, pending: null }
    hostCtx.effect(
      () =>
        hostCtx.webServer.register({
          kind: 'exact',
          path: ROUTE,
          handler: async (request, response) => {
            if (request.method !== 'GET' && request.method !== 'HEAD') {
              response.writeHead(405, { allow: 'GET, HEAD' })
              response.end()
              return
            }
            try {
              const now = Date.now()
              if (cache.payload === null || now - cache.at > COLONY_TTL_MS) {
                if (cache.pending === null) {
                  cache.pending = colonyPayload(ctx, retention.handle).finally(() => {
                    cache.pending = null
                  })
                }
                const payload = await cache.pending
                cache.payload = payload
                cache.at = Date.now()
              }
              const body = JSON.stringify(cache.payload)
              response.writeHead(200, {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'no-store',
              })
              response.end(request.method === 'HEAD' ? undefined : body)
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              const body = JSON.stringify({ ok: false, error: message })
              response.writeHead(500, {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'no-store',
              })
              response.end(body)
            }
          },
        }),
      'token-slime: colony route',
    )
  })
}
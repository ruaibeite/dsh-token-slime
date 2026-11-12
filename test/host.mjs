/**
 * Host-half tests: tool categorization, projection fold semantics, colony
 * aggregation, and the `/dsh-token-slime/colony` route over a fake plugin
 * context. No Harness process and no browser are needed.
 */
import assert from 'node:assert/strict'
import {
  ROUTE,
  SLIME_PROJECTION,
  MOLT_LOG_CAP,
  aggregateColony,
  apply,
  categoryOfTool,
  colonyOf,
  emptyTools,
  foldSlime,
  initSlimeState,
  speciesOfTools,
} from '../index.js'

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log('ok -', name)
}

async function testAsync(name, fn) {
  await fn()
  passed += 1
  console.log('ok -', name)
}

// ---------------------------------------------------------------- tool diet
test('tool names map to the expected diet categories', () => {
  const cases = [
    ['bash', 'engineer'],
    ['run_code', 'engineer'],
    ['pwsh', 'engineer'],
    ['write', 'engineer'],
    ['edit', 'engineer'],
    ['str_replace_editor', 'engineer'],
    ['plugin_manager', 'engineer'],
    ['web_search', 'explorer'],
    ['web_fetch', 'explorer'],
    ['docx', 'scribe'],
    ['pptx', 'scribe'],
    ['xlsx', 'scribe'],
    ['present', 'scribe'],
    ['read', 'scholar'],
    ['glob', 'scholar'],
    ['grep', 'scholar'],
    ['skill', 'scholar'],
    ['todo_write', 'other'],
    ['subagent', 'other'],
    ['', 'other'],
    [undefined, 'other'],
  ]
  for (const [tool, expected] of cases) {
    assert.equal(categoryOfTool(tool), expected, `tool ${String(tool)} should be ${expected}`)
  }
})

test('dominant tool category names the breed', () => {
  const mix = (counts) => ({ ...emptyTools(), ...counts })
  assert.equal(speciesOfTools(mix({ engineer: 5, explorer: 2, scholar: 1 })), 'engineer')
  assert.equal(speciesOfTools(mix({ explorer: 4, engineer: 1 })), 'explorer')
  assert.equal(speciesOfTools(mix({ scribe: 3, scholar: 2 })), 'scribe')
  assert.equal(speciesOfTools(mix({ scholar: 7 })), 'scholar')
  assert.equal(speciesOfTools(mix({ other: 9 })), null)
  assert.equal(speciesOfTools(emptyTools()), null)
  assert.equal(speciesOfTools(null), null)
})

test('tie keeps the first species in a stable order', () => {
  const mix = { ...emptyTools(), engineer: 3, explorer: 3 }
  assert.equal(speciesOfTools(mix), 'engineer')
})

// ------------------------------------------------------------------ growth
test('growth thresholds match the widget model', () => {
  assert.equal(colonyOf(0).gen, 0)
  assert.equal(colonyOf(3999).gen, 0)
  assert.equal(colonyOf(4000).gen, 1)
  assert.equal(colonyOf(10799).gen, 1)
  assert.equal(colonyOf(10800).gen, 2)
  assert.equal(colonyOf(22400).gen, 3)
  assert.equal(colonyOf(1000000).gen, 9)
  // The last generation is terminal: progress never exceeds 1.
  assert.equal(colonyOf(1000000).progress, 1)
  assert.ok(colonyOf(22400).progress <= 1)
  assert.ok(colonyOf(15000).progress > 0 && colonyOf(15000).progress < 1)
})

test('route rows never report progress above one at the generation cap', () => {
  const capped = colonyOf(1e6)
  assert.equal(capped.gen, 9)
  assert.equal(capped.progress, 1)
})

// ---------------------------------------------------------------- the fold
test('fold counts tool categories and compactions', () => {
  let state = initSlimeState()
  const event = (type, data) => ({ type, data })
  state = foldSlime(state, event('tool/call', { name: 'bash' }))
  state = foldSlime(state, event('tool/call', { name: 'bash' }))
  state = foldSlime(state, event('tool/call', { name: 'web_search' }))
  state = foldSlime(state, event('tool/call', { name: 'docx' }))
  state = foldSlime(state, event('tool/call', { name: 'read' }))
  state = foldSlime(state, event('compaction/start', {}))
  assert.equal(state.toolCalls, 5)
  assert.deepEqual(state.tools, { ...emptyTools(), engineer: 2, explorer: 1, scribe: 1, scholar: 1 })
  assert.equal(state.compactions, 1)
  assert.equal(speciesOfTools(state.tools), 'engineer')
})

test('fold accumulates output tokens across attempts', () => {
  let state = initSlimeState()
  state = foldSlime(state, { type: 'assistant/message', data: { turn: 1, step: 1, usage: { outputTokens: 100 } } })
  state = foldSlime(state, { type: 'assistant/message', data: { turn: 1, step: 2, usage: { outputTokens: 50 } } })
  assert.equal(state.outputTokens, 150)
  assert.equal(state.lastOutput.step, 2)
})

test('a retried attempt replaces its own sample instead of double counting', () => {
  let state = initSlimeState()
  state = foldSlime(state, { type: 'assistant/message', data: { turn: 1, step: 1, usage: { outputTokens: 100 } } })
  state = foldSlime(state, { type: 'assistant/message', data: { turn: 1, step: 1, usage: { outputTokens: 120 } } })
  assert.equal(state.outputTokens, 120)
  state = foldSlime(state, { type: 'llm/retry-started', data: { turn: 1, step: 1 } })
  assert.equal(state.lastOutput, null)
  state = foldSlime(state, { type: 'assistant/message', data: { turn: 1, step: 1, usage: { outputTokens: 90 } } })
  assert.equal(state.outputTokens, 210)
})

test('fold returns the same reference for ignored events', () => {
  const state = initSlimeState()
  assert.equal(foldSlime(state, { type: 'turn/start', data: {} }), state)
  assert.equal(foldSlime(state, { type: 'step/end', data: {} }), state)
  assert.equal(foldSlime(state, null), state)
})

test('fold tracks errors, retries, activity time, and the molt diary', () => {
  let state = initSlimeState()
  state = foldSlime(state, { type: 'tool/result', time: 1000, data: { message: { isError: true } } })
  state = foldSlime(state, { type: 'tool/result', time: 2000, data: { message: { isError: false } } })
  state = foldSlime(state, { type: 'tool/result', time: 3000, data: { message: { isError: true } } })
  assert.equal(state.errors, 2)
  assert.equal(state.lastErrorAt, 3000)
  assert.equal(state.lastActivityAt, 3000)
  state = foldSlime(state, { type: 'llm/retry-started', time: 4000, data: { turn: 9, step: 9 } })
  assert.equal(state.retries, 1)
  assert.equal(state.lastActivityAt, 4000)
  state = foldSlime(state, { type: 'compaction/start', time: 5000, data: {} })
  state = foldSlime(state, { type: 'compaction/start', time: 6000, data: {} })
  assert.equal(state.compactions, 2)
  assert.deepEqual(state.moltTimes, [5000, 6000])
  // user/message counts as activity for idle detection.
  state = foldSlime(state, { type: 'user/message', time: 7000, data: {} })
  assert.equal(state.lastActivityAt, 7000)
})

test('molt diary is capped and survives a tolerant round-trip', () => {
  let state = initSlimeState()
  for (let i = 0; i < MOLT_LOG_CAP + 5; i += 1) {
    state = foldSlime(state, { type: 'compaction/start', time: i, data: {} })
  }
  assert.equal(state.moltTimes.length, MOLT_LOG_CAP)
  const parsed = SLIME_PROJECTION.stateSchema.parse(JSON.parse(JSON.stringify(state)))
  assert.deepEqual(parsed.moltTimes, state.moltTimes)
  assert.equal(parsed.errors, state.errors)
})

test('the projection publishes a validated client view', () => {
  assert.equal(SLIME_PROJECTION.key, 'slime')
  assert.equal(SLIME_PROJECTION.wire.summary, false)
  let state = SLIME_PROJECTION.init()
  state = SLIME_PROJECTION.apply(state, { type: 'tool/call', data: { name: 'bash' } })
  state = SLIME_PROJECTION.apply(state, { type: 'assistant/message', data: { turn: 1, step: 1, usage: { outputTokens: 4200 } } })
  state = SLIME_PROJECTION.apply(state, { type: 'compaction/start', data: {} })
  const view = SLIME_PROJECTION.wire.view(state)
  assert.equal(view.outputTokens, 4200)
  assert.equal(view.compactions, 1)
  assert.equal(view.tools.engineer, 1)
  assert.equal('lastOutput' in view, false, 'view must not leak retry bookkeeping')
  const parsed = SLIME_PROJECTION.wire.viewSchema.parse(view)
  assert.deepEqual(parsed, view)
  const roundTripped = SLIME_PROJECTION.stateSchema.parse(JSON.parse(JSON.stringify(state)))
  assert.deepEqual(roundTripped, state)
})

test('a corrupted stored state is repaired to counters', () => {
  const repaired = SLIME_PROJECTION.stateSchema.parse({
    outputTokens: -5,
    toolCalls: 'x',
    tools: { engineer: 2, bogus: 9 },
    compactions: 1.9,
    lastOutput: { turn: 3, step: 0, value: 12 },
  })
  assert.equal(repaired.outputTokens, 0)
  assert.equal(repaired.toolCalls, 0)
  assert.equal(repaired.tools.engineer, 2)
  assert.equal(repaired.tools.explorer, 0)
  assert.equal(repaired.compactions, 1)
  assert.deepEqual(repaired.lastOutput, { turn: 3, step: 0, value: 12 })
  assert.throws(() => SLIME_PROJECTION.stateSchema.parse(null), /must be an object/)
})

// --------------------------------------------------------------- aggregation
test('aggregateColony sums sessions and derives the total breed', () => {
  const tools = (counts) => ({ ...emptyTools(), ...counts })
  const total = aggregateColony([
    { outputTokens: 10000, toolCalls: 4, tools: tools({ engineer: 4 }), compactions: 1 },
    { outputTokens: 5000, toolCalls: 2, tools: tools({ explorer: 2 }), compactions: 2 },
    { outputTokens: 3000, toolCalls: 3, tools: tools({ engineer: 1, explorer: 2 }), compactions: 0 },
  ])
  assert.equal(total.sessions, 3)
  assert.equal(total.food, 18000)
  assert.equal(total.toolCalls, 9)
  assert.equal(total.compactions, 3)
  assert.equal(total.tools.engineer, 5)
  assert.equal(total.tools.explorer, 4)
  assert.equal(total.species, 'engineer')
  assert.equal(total.gen, colonyOf(18000).gen)
})

// ------------------------------------------------------------ route wiring
function fakeResponse() {
  return {
    status: 0,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      this.body = body === undefined ? '' : String(body)
    },
  }
}

/** Build a plugin context whose services the host half consumes. */
function fakeContext(options = {}) {
  const effects = []
  const projectionRegistrations = []
  const routes = []
  const sessions = options.sessions ?? new Map()
  const listed = options.listed ?? []
  const cached = options.cached ?? new Map()
  const titles = options.titles ?? new Map()
  const services = {
    sessionPersistence: {
      list: async () => listed,
    },
    sessionProjectionCache: {
      cachedSnapshot(header, keys) {
        const entry = cached.get(header.id)
        if (entry === undefined) return undefined
        return { asOfSeq: 1, values: entry }
      },
      keysSeen: [],
    },
    sessionProjections: {
      snapshot(session, keys) {
        const title = titles.get(session.id)
        return { asOfSeq: 1, values: title === undefined ? {} : { title } }
      },
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
  }
  const ctx = {
    logger: { warn() {}, error() {} },
    effect(fn) {
      const dispose = fn()
      effects.push(dispose)
      return dispose
    },
    inject(names, callback) {
      callback(ctx)
    },
    get(name) {
      return services[name]
    },
    sessions: {
      get(id) {
        return sessions.get(id)
      },
      list() {
        return [...sessions.values()]
      },
    },
    sessionProjections: {
      register(definition) {
        projectionRegistrations.push(definition)
        const handle = {
          stateOf(session) {
            return (options.states ?? new Map()).get(session.id)
          },
          dispose() {},
        }
        return handle
      },
    },
    __effects: effects,
    __projectionRegistrations: projectionRegistrations,
    __routes: routes,
  }
  // Cordis exposes injected services as context properties. The host half uses
  // `hostCtx.webServer.register(...)` and `ctx.sessionProjections...`.
  ctx.webServer = services.webServer
  return ctx
}

function header(id, cwd) {
  return { id, cwd, formatVersion: 4, createdAt: 1, isSeeded: false }
}

await testAsync('apply registers the projection and the colony route', async () => {
  const ctx = fakeContext({ listed: [] })
  apply(ctx)
  await Promise.resolve()
  assert.equal(ctx.__projectionRegistrations.length, 1)
  assert.equal(ctx.__projectionRegistrations[0].key, 'slime')
  assert.equal(ctx.__routes.length, 1)
  assert.equal(ctx.__routes[0].kind, 'exact')
  assert.equal(ctx.__routes[0].path, ROUTE)
})

await testAsync('the colony route aggregates live, cached, and unlisted sessions', async () => {
  const tools = (counts) => ({ ...emptyTools(), ...counts })
  const live = { id: 'live-1' }
  const ctx = fakeContext({
    sessions: new Map([['live-1', live]]),
    listed: [header('live-1', '/work/a'), header('hist-1', '/work/old'), header('hist-2', '/work/older')],
    cached: new Map([
      ['hist-1', { title: '旧会话', tokenUsage: { outputTokens: 9000 } }],
      ['hist-2', { title: '更旧的', tokenUsage: { outputTokens: 4500 }, slime: { outputTokens: 4500, toolCalls: 2, tools: tools({ scribe: 2 }), compactions: 5 } }],
    ]),
    titles: new Map([['live-1', '当前会话']]),
    states: new Map([
      ['live-1', { outputTokens: 12000, toolCalls: 9, tools: tools({ engineer: 7, explorer: 1, scholar: 1 }), compactions: 2 }],
    ]),
  })
  // A live session that has no stored header yet must still be counted.
  ctx.sessions.list = () => [live, { id: 'live-2' }]
  ctx.sessions.get = (id) => (id === 'live-1' ? live : undefined)

  apply(ctx)
  await Promise.resolve()
  const route = ctx.__routes[0]
  const response = fakeResponse()
  await route.handler({ method: 'GET' }, response)
  assert.equal(response.status, 200)
  const payload = JSON.parse(response.body)
  assert.equal(payload.ok, true)
  assert.equal(payload.total.sessions, 4, 'live-1, hist-1, hist-2, live-2')

  const byId = new Map(payload.sessions.map((row) => [row.id, row]))
  assert.equal(byId.get('live-1').title, '当前会话')
  assert.equal(byId.get('live-1').outputTokens, 12000)
  assert.equal(byId.get('live-1').species, 'engineer')
  assert.equal(byId.get('live-1').compactions, 2)
  assert.equal(byId.get('live-1').gen, 2)

  // History without the slime key falls back to the shipped tokenUsage checkpoint.
  assert.equal(byId.get('hist-1').outputTokens, 9000)
  assert.equal(byId.get('hist-1').title, '旧会话')
  assert.equal(byId.get('hist-1').gen, 1, '9000 tokens is generation 1 (4000 then 6800)')

  assert.equal(byId.get('hist-2').species, 'scribe')
  assert.equal(byId.get('hist-2').compactions, 5)

  assert.equal(payload.total.food, 12000 + 9000 + 4500)
  assert.equal(payload.total.toolCalls, 11)
  assert.equal(payload.total.compactions, 7)
  assert.equal(payload.total.species, 'engineer')
  assert.equal(payload.total.gen, colonyOf(12000 + 9000 + 4500).gen)

  // Rows are sorted by food, largest first.
  assert.equal(payload.sessions[0].id, 'live-1')
})

await testAsync('cache reads request the history fallback keys', async () => {
  const seen = []
  const ctx = fakeContext({ listed: [header('hist-1', '/work/x')] })
  ctx.get('sessionProjectionCache').cachedSnapshot = (h, keys) => {
    seen.push([h.id, keys])
    return undefined
  }
  apply(ctx)
  await Promise.resolve()
  const response = fakeResponse()
  await ctx.__routes[0].handler({ method: 'GET' }, response)
  assert.equal(seen.length, 1)
  assert.deepEqual(seen[0][1], ['title', 'tokenUsage', 'slime'])
})

await testAsync('HEAD answers without a body and other methods are refused', async () => {
  const ctx = fakeContext({ listed: [] })
  apply(ctx)
  await Promise.resolve()
  const route = ctx.__routes[0]

  const head = fakeResponse()
  await route.handler({ method: 'HEAD' }, head)
  assert.equal(head.status, 200)
  assert.equal(head.body, '')

  const post = fakeResponse()
  await route.handler({ method: 'POST' }, post)
  assert.equal(post.status, 405)
})

await testAsync('the route survives a throwing persistence list', async () => {
  const ctx = fakeContext({ listed: [] })
  ctx.get('sessionPersistence').list = async () => {
    throw new Error('backend down')
  }
  apply(ctx)
  await Promise.resolve()
  const response = fakeResponse()
  await ctx.__routes[0].handler({ method: 'GET' }, response)
  assert.equal(response.status, 200)
  const payload = JSON.parse(response.body)
  assert.equal(payload.total.sessions, 0)
})

await testAsync('repeated polls reuse the short-lived aggregate cache', async () => {
  let listCalls = 0
  const ctx = fakeContext({ listed: [header('hist-1', '/work/x')] })
  ctx.get('sessionPersistence').list = async () => {
    listCalls += 1
    return [header('hist-1', '/work/x')]
  }
  apply(ctx)
  await Promise.resolve()
  const route = ctx.__routes[0]
  await route.handler({ method: 'GET' }, fakeResponse())
  await route.handler({ method: 'GET' }, fakeResponse())
  assert.equal(listCalls, 1, 'second poll inside the TTL must not list again')
})

await testAsync('colony covers EVERY stored + live session with no cap and no double count', async () => {
  // 60 stored sessions (mix of v3-style and v4-style ids), plus 3 live sessions
  // of which one is also stored (must be deduped, not double counted).
  const storedIds = []
  const listed = []
  for (let i = 0; i < 60; i += 1) {
    const id = (i % 2 === 0 ? 'session-' : '') + '00000000-0000-4000-8000-' + String(i).padStart(12, '0')
    storedIds.push(id)
    listed.push(header(id, '/work/w' + i))
  }
  const overlapId = storedIds[0]
  const liveOnlyA = 'live-only-a'
  const liveOnlyB = 'live-only-b'
  const liveSessions = [{ id: overlapId }, { id: liveOnlyA }, { id: liveOnlyB }]
  const sessionsMap = new Map(liveSessions.map((s) => [s.id, s]))
  const ctx = fakeContext({ sessions: sessionsMap, listed })
  ctx.sessions.list = () => liveSessions
  ctx.sessions.get = (id) => sessionsMap.get(id)

  apply(ctx)
  await Promise.resolve()
  const response = fakeResponse()
  await ctx.__routes[0].handler({ method: 'GET' }, response)
  assert.equal(response.status, 200)
  const payload = JSON.parse(response.body)

  const expectedCount = 60 + 2 // 60 stored + 2 live-only (overlap deduped)
  assert.equal(payload.total.sessions, expectedCount, 'total.sessions is the full, uncapped, deduped count')
  assert.equal(payload.sessions.length, expectedCount, 'every session is carried as a row (no display cap drops sessions)')

  const ids = new Set(payload.sessions.map((r) => r.id))
  assert.equal(ids.size, expectedCount, 'no duplicate rows')
  for (const id of storedIds) assert.ok(ids.has(id), 'stored session missing: ' + id)
  assert.ok(ids.has(liveOnlyA) && ids.has(liveOnlyB), 'live-only sessions missing')
  assert.equal(payload.sessions.filter((r) => r.id === overlapId).length, 1, 'overlap counted once')
})

console.log(`\n${passed} host tests passed`)
/**
 * Browser-half tests without a browser.
 *
 * A tiny React stand-in runs the real widget: hooks keep state across passes,
 * effects actually run (async ones are awaited), and a prop sequence lets a
 * test simulate a projection change such as a fresh compaction. The same
 * harness renders the right-sidebar colony panel against a stubbed fetch.
 *
 * Also checks that the client's mirrored model agrees with the host's.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as host from '../index.js'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const LOCALE_DIR = new URL('../locale/', import.meta.url)

let passed = 0
async function test(name, fn) {
  await fn()
  passed += 1
  console.log('ok -', name)
}

// ---------------------------------------------------------------- harness
function createRuntime() {
  const hooks = []
  const runtime = { cursor: 0, effects: [], dirty: false, hooks }
  const React = {
    createElement(type, props, ...children) {
      return {
        type,
        props: props || {},
        children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false && child !== true),
      }
    },
    useState(initial) {
      const index = runtime.cursor
      runtime.cursor += 1
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      const setter = (next) => {
        const value = typeof next === 'function' ? next(hooks[index]) : next
        if (value !== hooks[index]) {
          hooks[index] = value
          runtime.dirty = true
        }
      }
      return [hooks[index], setter]
    },
    useEffect(fn) {
      runtime.effects.push(fn)
    },
    useRef(value) {
      const index = runtime.cursor
      runtime.cursor += 1
      if (!(index in hooks)) hooks[index] = { current: value }
      return hooks[index]
    },
    useMemo(fn) {
      return fn()
    },
    useCallback(fn) {
      return fn
    },
    memo: (component) => component,
    Fragment: 'fragment',
  }
  runtime.React = React
  return runtime
}

function expand(node, React, depth = 0) {
  if (node === null || node === undefined || node === false || node === true) return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap((child) => expand(child, React, depth))
  if (depth > 80) throw new Error('render tree too deep')
  const { type, props, children } = node
  if (typeof type === 'function') {
    const merged = { ...props }
    if (children.length === 1) merged.children = children[0]
    else if (children.length > 1) merged.children = children
    return expand(type(merged), React, depth + 1)
  }
  return [{ tag: type, props, children: children.flatMap((child) => expand(child, React, depth + 1)) }]
}

function walk(nodes, out) {
  for (const node of nodes) {
    if (typeof node === 'string') {
      out.text.push(node)
      continue
    }
    out.tags.push(node.tag)
    if (node.props.className) out.classes.push(node.props.className)
    if (node.props['aria-label']) out.labels.push(node.props['aria-label'])
    if (node.props.title) out.labels.push(node.props.title)
    if (node.props['data-species'] !== undefined) out.species.push(String(node.props['data-species']))
    if (node.props['data-hat'] !== undefined) out.hats.push(String(node.props['data-hat']))
    if (node.props['data-molt'] !== undefined) out.molts.push(String(node.props['data-molt']))
    if (node.props['data-rings'] !== undefined) out.ringAttrs.push(String(node.props['data-rings']))
    if (node.props['data-session-count'] !== undefined) out.sessionCounts.push(String(node.props['data-session-count']))
    if (node.props['data-stage'] !== undefined) out.stages.push(String(node.props['data-stage']))
    if (node.props['data-ach'] !== undefined) out.achievements.push({ id: String(node.props['data-ach']), unlocked: node.props['data-unlocked'] === '1' })
    if (node.props.style && typeof node.props.style === 'object') out.styles.push(node.props.style)
    walk(node.children, out)
  }
}

/** A fresh render-output accumulator with every collected channel. */
function newOut() {
  return { text: [], tags: [], classes: [], labels: [], species: [], hats: [], molts: [], ringAttrs: [], sessionCounts: [], stages: [], achievements: [], styles: [] }
}

/** Load client.js in a sandbox and return its module exports plus runtime. */
function loadClient(options = {}) {
  let factory = null
  const fetchCalls = []
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(spec) {
          factory = spec.factory
        },
      },
    },
    document: {
      documentElement: { lang: options.lang || 'zh-CN' },
      baseURI: 'http://127.0.0.1:56705/',
      addEventListener() {},
      removeEventListener() {},
    },
    navigator: { language: options.lang || 'zh-CN' },
    fetch: async (url) => {
      fetchCalls.push(String(url))
      if (typeof options.fetchImpl === 'function') return options.fetchImpl(url)
      return { ok: true, status: 200, json: async () => options.payload ?? { ok: true } }
    },
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'client.js' })
  if (factory === null) throw new Error('client did not register a factory')
  const runtime = createRuntime()
  const moduleExports = factory((request) => {
    if (request === 'react') return runtime.React
    throw new Error('unexpected require: ' + request)
  })
  return { moduleExports, runtime, fetchCalls }
}

/** Fake client plugin context with slot registration and sidebar services. */
function fakeClientContext() {
  const slotRegistrations = []
  const tabTypes = []
  const opened = []
  const ctx = {
    slots: {
      inject(name, callback) {
        return callback()
      },
      register(options, component) {
        const entry = { options, component }
        slotRegistrations.push(entry)
        return entry
      },
    },
    effect(fn) {
      return fn()
    },
    get(name) {
      if (name === 'sidebarRightTabs') {
        return {
          register(definition) {
            tabTypes.push(definition)
            return () => {}
          },
        }
      }
      if (name === 'sidebarRight') {
        return {
          openTab(kind) {
            opened.push(kind)
          },
        }
      }
      return undefined
    },
  }
  return { ctx, slotRegistrations, tabTypes, opened }
}

function findRegistration(slotRegistrations, name) {
  const found = slotRegistrations.find((entry) => entry.options && entry.options.name === name)
  if (found === undefined) throw new Error('no registration for slot ' + name)
  return found
}

/** Run a component through one or more prop steps, settling state between passes. */
async function mount(React, runtime, component, propsSteps, options = {}) {
  const maxPasses = options.maxPasses ?? 10
  let tree = null
  let lastCleanups = []
  for (let pass = 0; pass < maxPasses; pass += 1) {
    runtime.cursor = 0
    runtime.effects = []
    runtime.dirty = false
    const props = propsSteps[Math.min(pass, propsSteps.length - 1)]
    tree = expand(React.createElement(component, props), React, 0)
    const cleanups = []
    for (const effect of runtime.effects) {
      const cleanup = await effect()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    }
    // Let promise chains inside effects settle (fetch → setState).
    await new Promise((resolve) => setTimeout(resolve, 0))
    for (const cleanup of cleanups) cleanup()
    lastCleanups = cleanups
    const moreSteps = pass + 1 < propsSteps.length
    if (!runtime.dirty && !moreSteps) break
  }
  const out = newOut()
  walk(tree, out)
  out.joined = out.text.join(' ')
  out.cleanup = () => {
    for (const cleanup of lastCleanups) cleanup()
  }
  return out
}

/** Build projection props with the given `slime` vitals. */
function projectionsWith(vitals, extra = {}) {
  return {
    tokenUsage: { uncachedInputTokens: 12000, outputTokens: 30500, cacheReadTokens: 420000, cacheWriteTokens: 9000 },
    contextPressure: { pressureTokens: 88000, contextWindow: 128000 },
    slime: { outputTokens: 30500, toolCalls: 0, tools: { engineer: 0, explorer: 0, scholar: 0, scribe: 0, other: 0 }, compactions: 0, ...vitals },
    ...extra,
  }
}

function dockProps(projections, extra = {}) {
  return {
    useProjection: (key) => projections[key],
    t: undefined,
    openColonyTab: () => {},
    ...extra,
  }
}

// ------------------------------------------------- mirrored model checks
await test('client model matches the host model', () => {
  const { moduleExports } = loadClient()
  const model = moduleExports.__model
  const toolNames = ['bash', 'run_code', 'web_fetch', 'docx', 'present', 'read', 'grep', 'todo_write', 'subagent', '', 'unknown_thing']
  for (const tool of toolNames) {
    assert.equal(model.categoryOfTool(tool), host.categoryOfTool(tool), 'tool ' + tool)
  }
  const mixes = [
    { engineer: 5, explorer: 2, scholar: 1 },
    { explorer: 4, engineer: 1 },
    { scribe: 3, scholar: 2 },
    { scholar: 7 },
    { other: 9 },
    { engineer: 0, explorer: 0, scholar: 0, scribe: 0, other: 0 },
  ]
  for (const mix of mixes) {
    const totals = { ...host.emptyTools(), ...mix }
    assert.equal(model.speciesOfTools(totals), host.speciesOfTools(totals), 'mix ' + JSON.stringify(mix))
  }
  for (const food of [0, 3999, 4000, 9000, 10800, 22400, 120000, 1000000]) {
    const client = model.colonyOf(food)
    const hostColony = host.colonyOf(food)
    assert.equal(client.gen, hostColony.gen, 'gen at ' + food)
    assert.equal(client.rest, hostColony.rest, 'rest at ' + food)
    assert.equal(client.cost, hostColony.cost, 'cost at ' + food)
  }
  assert.equal(model.FIRST_SPLIT, host.FIRST_SPLIT)
  assert.equal(model.GROWTH, host.GROWTH)
  assert.equal(model.MAX_GEN, host.MAX_GEN)
})

// ------------------------------------------------------- dock widget cases
await test('egg, panel closed', async () => {
  const { moduleExports, runtime } = loadClient()
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const out = await mount(runtime.React, runtime, dock.component, [dockProps({})])
  assert.ok(out.classes.includes('tsl-trigger'))
  assert.ok(out.classes.includes('tsl-art'))
  assert.equal(out.classes.includes('tsl-panel'), false)
  assert.equal(dock.options.id, 'token-slime')
})

await test('egg, panel open', async () => {
  const { moduleExports, runtime } = loadClient()
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const out = await clickOpen(runtime, dock.component, dockProps({}))
  out.cleanup()
  assert.ok(out.joined.includes('还在蛋里'), 'egg copy is shown before the first token')
})

await test('adult panel shows rings, tools, diet, and the colony entry point', async () => {
  const { moduleExports, runtime } = loadClient()
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const projections = projectionsWith({
    toolCalls: 7,
    tools: { engineer: 5, explorer: 1, scholar: 1, scribe: 0, other: 0 },
    compactions: 3,
  })
  // The panel is closed by default: click the trigger, then render the panel.
  const opened = await clickOpen(runtime, dock.component, dockProps(projections))
  for (const needle of ['下一餐', '族群', '吃进去的东西', '年轮', '3 圈', '工具构成', '代码与执行', '查看总族群', '累计 token']) {
    assert.ok(opened.joined.includes(needle), 'missing panel text: ' + needle)
  }
  assert.equal(opened.classes.filter((c) => c === 'tsl-ring').length, 3, 'three rings on the body')
  assert.equal(opened.hats.includes('engineer'), true, 'engineer hard hat drawn')
  assert.equal(opened.species.includes('engineer'), true, 'species marker present')
  assert.equal(opened.molts.length, 1, 'shed shell element present after a compaction')
  assert.equal(opened.ringAttrs.includes('3'), true)
  opened.cleanup()
})

/** Mount a component, call its first button onClick, and render again. */
async function clickOpen(runtime, component, props) {
  let tree = null
  const out = newOut()
  runtime.cursor = 0
  runtime.effects = []
  runtime.dirty = false
  tree = expand(runtime.React.createElement(component, props), runtime.React, 0)
  const clickable = []
  collectClickable(tree, clickable)
  const cleanups = []
  for (const effect of runtime.effects) {
    const cleanup = await effect()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  for (const cleanup of cleanups) cleanup()
  const trigger = clickable.find((node) => node.props && node.props.className === 'tsl-trigger')
  if (trigger === undefined) throw new Error('no trigger to click')
  trigger.props.onClick()
  // Second pass renders the open panel.
  runtime.cursor = 0
  runtime.effects = []
  runtime.dirty = false
  tree = expand(runtime.React.createElement(component, props), runtime.React, 0)
  for (const effect of runtime.effects) {
    const cleanup = await effect()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  walk(tree, out)
  out.joined = out.text.join(' ')
  out.cleanup = () => {
    for (const cleanup of cleanups) cleanup()
  }
  return out
}

function collectClickable(nodes, out) {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    if (node.tag === 'button') out.push(node)
    collectClickable(node.children, out)
  }
}

// ------------------------------------------------------------ breeds
await test('tool mix decides the breed: bash -> engineer', async () => {
  const out = await renderBreed({ engineer: 6, explorer: 1 })
  assert.equal(out.species.includes('engineer'), true)
  assert.equal(out.joined.includes('工装种'), true)
  assert.equal(out.hats.includes('engineer'), true)
})

await test('tool mix decides the breed: web -> explorer', async () => {
  const out = await renderBreed({ explorer: 6, engineer: 1 })
  assert.equal(out.species.includes('explorer'), true)
  assert.equal(out.joined.includes('探险种'), true)
  assert.equal(out.hats.includes('explorer'), true)
})

await test('tool mix decides the breed: documents -> scribe', async () => {
  const out = await renderBreed({ scribe: 4, scholar: 1 })
  assert.equal(out.species.includes('scribe'), true)
  assert.equal(out.joined.includes('文书种'), true)
  assert.equal(out.hats.includes('scribe'), true)
})

await test('tool mix decides the breed: reading -> scholar glasses', async () => {
  const out = await renderBreed({ scholar: 5 })
  assert.equal(out.species.includes('scholar'), true)
  assert.equal(out.joined.includes('学者种'), true)
  assert.equal(out.hats.includes('scholar'), true)
})

await test('no classified tools falls back to the token-diet breed', async () => {
  const projections = projectionsWith({ toolCalls: 0 })
  const opened = await renderOpen(projections)
  assert.equal(opened.ringAttrs.length >= 1, true)
  assert.equal(opened.joined.includes('苔藓种'), true, 'cache-heavy session is a moss breed')
  assert.equal(opened.joined.includes('工具构成'), false, 'no tool section without tools')
})

async function renderBreed(tools) {
  const total = Object.values(tools).reduce((sum, value) => sum + value, 0)
  const projections = projectionsWith({ toolCalls: total, tools: { engineer: 0, explorer: 0, scholar: 0, scribe: 0, other: 0, ...tools } })
  return renderOpen(projections)
}

async function renderOpen(projections, options = {}) {
  const { moduleExports, runtime } = loadClient(options)
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const extra = options.t === undefined ? {} : { t: options.t }
  return clickOpen(runtime, dock.component, dockProps(projections, extra))
}

// ------------------------------------------------------------- molting
await test('a new compaction molts a shell and adds a ring', async () => {
  const { moduleExports, runtime } = loadClient()
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const before = dockProps(projectionsWith({ compactions: 0 }))
  const after = dockProps(projectionsWith({ compactions: 2 }))
  const out = await mount(runtime.React, runtime, dock.component, [before, after])
  out.cleanup()
  assert.equal(out.ringAttrs.includes('2'), true, 'ring attribute tracks compactions')
  // A compaction raises the molt banner and/or unlocks a molt achievement; the
  // achievement celebration takes priority on the single dock feedback line.
  assert.ok(out.joined.includes('蜕皮！') || out.joined.includes('🏆'), 'a molt/achievement celebration is shown when compactions increase')
})

await test('existing compactions render rings without a stale banner after settling', async () => {
  const { moduleExports, runtime } = loadClient()
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const out = await mount(runtime.React, runtime, dock.component, [dockProps(projectionsWith({ compactions: 4 }))])
  out.cleanup()
  // First mount seeds the ref with 4, so no banner is raised for history.
  assert.ok(!out.joined.includes('蜕皮！'))
})

// --------------------------------------------------- resilience & locale
await test('missing useProjection degrades to an egg without throwing', async () => {
  const { moduleExports, runtime } = loadClient()
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const out = await mount(runtime.React, runtime, dock.component, [{ t: undefined }])
  out.cleanup()
  assert.ok(out.classes.includes('tsl-trigger'))
})

await test('locale service wins over bundled copy', async () => {
  const custom = {
    'panel.title': 'LOCALE-PANEL',
    'panel.food': 'LOCALE-FOOD',
    'panel.diet': 'LOCALE-DIET',
    'panel.rings': 'LOCALE-RINGS',
    'panel.tools': 'LOCALE-TOOLS',
    'panel.openColony': 'LOCALE-OPEN',
    'species.engineer': 'LOCALE-ENGINEER',
    'panel.tool.engineer': 'LOCALE-TOOL-ENGINEER',
    'badge.gen': 'LOCALE-GEN-{n}',
  }
  const t = (key) => (custom[key] !== undefined ? custom[key] : key)
  const opened = await renderOpen(projectionsWith({ toolCalls: 5, tools: { engineer: 5 } }), { t })
  assert.ok(opened.joined.includes('LOCALE-PANEL'))
  assert.ok(opened.joined.includes('LOCALE-ENGINEER'))
  assert.ok(opened.joined.includes('LOCALE-OPEN'))
})

await test('english page uses english copy', async () => {
  const opened = await renderOpen(projectionsWith({ toolCalls: 0 }), { lang: 'en-US' })
  assert.ok(opened.joined.includes('Slime log'))
  assert.ok(opened.joined.includes('Next meal'))
  assert.ok(opened.labels.includes('Open the slime log'))
})

// -------------------------------------------------------- sidebar tab
await test('sidebar tab type, body, and title are registered', async () => {
  const { moduleExports } = loadClient()
  const { ctx, slotRegistrations, tabTypes } = fakeClientContext()
  moduleExports.apply(ctx)
  assert.equal(tabTypes.length, 1)
  assert.equal(tabTypes[0].id, moduleExports.__model.TAB_ID)
  assert.equal(tabTypes[0].kind, moduleExports.__model.TAB_KIND)
  assert.equal(tabTypes[0].priority, 'builtin')
  assert.equal(typeof tabTypes[0].title, 'function')
  const body = findRegistration(slotRegistrations, 'sidebar.right.pane.tab')
  assert.equal(body.options.key, moduleExports.__model.TAB_ID)
  const title = findRegistration(slotRegistrations, 'sidebar.right.pane.tab.title')
  assert.equal(title.options.key, moduleExports.__model.TAB_ID)
})

await test('the dock opens the colony tab', async () => {
  const { moduleExports, runtime } = loadClient()
  const { ctx, slotRegistrations, opened } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const props = dock.options.inject()
  assert.equal(typeof props.openColonyTab, 'function')
  props.openColonyTab()
  assert.deepEqual(opened, [moduleExports.__model.TAB_KIND])
  assert.equal(typeof runtime, 'object')
})

// ----------------------------------------------------- colony panel
const COLONY_PAYLOAD = {
  ok: true,
  generatedAt: 1,
  total: {
    sessions: 3,
    food: 26000,
    toolCalls: 9,
    compactions: 4,
    tools: { engineer: 6, explorer: 2, scholar: 1, scribe: 0, other: 0 },
    gen: 2,
    species: 'engineer',
  },
  sessions: [
    { id: 's1', title: '重构插件', outputTokens: 15000, gen: 2, progress: 0.5, compactions: 2, species: 'engineer', tools: {} },
    { id: 's2', title: null, outputTokens: 8000, gen: 1, progress: 0.2, compactions: 1, species: 'explorer', tools: {} },
  ],
}

await test('colony panel renders totals, breeds, and sessions from the route', async () => {
  const { moduleExports, runtime, fetchCalls } = loadClient({ payload: COLONY_PAYLOAD })
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const body = findRegistration(slotRegistrations, 'sidebar.right.pane.tab')
  const out = await mount(runtime.React, runtime, body.component, [{ t: undefined }])
  out.cleanup()
  assert.ok(fetchCalls.length >= 1)
  assert.ok(fetchCalls[0].endsWith(moduleExports.__model.COLONY_ROUTE), 'fetches the colony route')
  for (const needle of ['总族群', '累计食物', '累计年轮', '会话', '品种比例', '全部会话', '重构插件', '未命名会话', '工装种', '共 3 个会话']) {
    assert.ok(out.joined.includes(needle), 'missing colony text: ' + needle)
  }
  assert.equal(out.hats.includes('engineer'), true, 'hero slime wears the colony breed')
})

await test('colony panel headline session count equals the route total (verification)', async () => {
  // A larger, realistic total: the panel must surface exactly this number so a
  // user can reconcile it against the host's real session count.
  const big = { ...COLONY_PAYLOAD, total: { ...COLONY_PAYLOAD.total, sessions: 178 } }
  const { moduleExports, runtime } = loadClient({ payload: big })
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const body = findRegistration(slotRegistrations, 'sidebar.right.pane.tab')
  const out = await mount(runtime.React, runtime, body.component, [{ t: undefined }])
  out.cleanup()
  assert.ok(out.joined.includes('共 178 个会话'), 'headline shows the full session total')
  assert.ok(out.sessionCounts.includes('178'), 'data-session-count carries the exact total')
})

await test('colony panel shows an error row when the route fails', async () => {
  const { moduleExports, runtime } = loadClient({
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  })
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const body = findRegistration(slotRegistrations, 'sidebar.right.pane.tab')
  const out = await mount(runtime.React, runtime, body.component, [{ t: undefined }])
  out.cleanup()
  assert.ok(out.joined.includes('读取族群失败'))
  assert.ok(out.joined.includes('503'))
})

// ------------------------------------------- life stages & achievements
await test('stageOf resolves the six named stages at their thresholds', () => {
  const { moduleExports } = loadClient()
  const m = moduleExports.__model
  const cases = [[0, 'egg'], [1, 'hatchling'], [2499, 'hatchling'], [2500, 'juvenile'], [25000, 'adult'], [120000, 'elder'], [600000, 'mythic'], [5000000, 'mythic']]
  for (const [food, key] of cases) assert.equal(m.stageOf(food).key, key, 'stage at food=' + food)
  assert.equal(m.stageOf(600000).next, null, 'mythic is terminal')
  assert.equal(m.stageOf(600000).progress, 1)
  assert.ok(m.stageOf(2500).toNext > 0, 'non-terminal stage reports distance to next')
  assert.equal(m.STAGES.length, 6)
})

await test('achieveState unlocks exactly the milestones whose target is met', () => {
  const { moduleExports } = loadClient()
  const m = moduleExports.__model
  const ctx = {
    buckets: { output: 30000, prompt: 100000, total: 130000, cacheRead: 80000 },
    counts: { engineer: 30, explorer: 15, scribe: 10, scholar: 30, other: 0 },
    compactions: 3,
    colony: m.colonyOf(30000),
    stage: m.stageOf(30000),
    diet: { cacheRatio: 0.8 },
  }
  const ach = m.achieveState(ctx)
  assert.equal(ach.length, m.ACHIEVEMENTS.length)
  const byId = new Map(ach.map((a) => [a.id, a]))
  for (const id of ['firstMeal', 'firstSplit', 'engineer30', 'explorer15', 'scribe10', 'scholar30', 'polyglot', 'firstMolt', 'rings3', 'cacheMaster']) {
    assert.equal(byId.get(id).unlocked, true, id + ' should be unlocked')
  }
  for (const id of ['colony5', 'marathon', 'million', 'mythicForm']) {
    assert.equal(byId.get(id).unlocked, false, id + ' should still be locked')
  }
  // cacheMaster needs a real prompt; with prompt 0 it must stay locked.
  const noPrompt = m.achieveState({ ...ctx, buckets: { ...ctx.buckets, prompt: 0 } })
  assert.equal(noPrompt.find((a) => a.id === 'cacheMaster').unlocked, false)
  // nextGoal picks the locked achievement with the highest progress.
  const goal = m.nextGoal(ach)
  assert.ok(goal !== null && !goal.unlocked)
  assert.ok(ach.filter((a) => !a.unlocked).every((a) => a.progress <= goal.progress))
})

await test('dock shows the current life stage and the panel shows a stage ladder', async () => {
  const projections = projectionsWith({}, { tokenUsage: { uncachedInputTokens: 1000, outputTokens: 30000, cacheReadTokens: 1000, cacheWriteTokens: 0 } })
  const opened = await renderOpen(projections)
  assert.ok(opened.stages.includes('adult'), 'slime art carries the adult stage')
  assert.ok(opened.joined.includes('成长阶段'), 'panel shows the stage section')
  assert.ok(opened.joined.includes('成体'), 'current stage name shown')
  assert.ok(opened.joined.includes('长老'), 'next stage name shown')
})

await test('a stage-up raises the evolution banner', async () => {
  const { moduleExports, runtime } = loadClient()
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const low = { uncachedInputTokens: 100, outputTokens: 2000, cacheReadTokens: 100, cacheWriteTokens: 0 }
  const high = { uncachedInputTokens: 100, outputTokens: 3000, cacheReadTokens: 100, cacheWriteTokens: 0 }
  const before = dockProps(projectionsWith({}, { tokenUsage: low }))
  const after = dockProps(projectionsWith({}, { tokenUsage: high }))
  const out = await mount(runtime.React, runtime, dock.component, [before, after])
  out.cleanup()
  assert.ok(out.joined.includes('进化！'), 'evolution banner shown on stage-up')
})

await test('unlocking an achievement raises the trophy banner', async () => {
  const { moduleExports, runtime } = loadClient()
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const before = dockProps(projectionsWith({ toolCalls: 29, tools: { engineer: 29, explorer: 0, scribe: 0, scholar: 0, other: 0 } }))
  const after = dockProps(projectionsWith({ toolCalls: 30, tools: { engineer: 30, explorer: 0, scribe: 0, scholar: 0, other: 0 } }))
  const out = await mount(runtime.React, runtime, dock.component, [before, after])
  out.cleanup()
  assert.ok(out.joined.includes('🏆'), 'trophy banner shown on unlock')
  assert.ok(out.joined.includes('代码工匠'), 'the unlocked achievement is named')
})

await test('achievement shelf lists every milestone and marks unlocked ones', async () => {
  const projections = projectionsWith({ toolCalls: 30, tools: { engineer: 30, explorer: 0, scribe: 0, scholar: 0, other: 0 } })
  const opened = await renderOpen(projections)
  assert.equal(opened.achievements.length, 14, 'all 14 achievements on the shelf')
  const eng = opened.achievements.find((a) => a.id === 'engineer30')
  assert.ok(eng && eng.unlocked, 'engineer30 marked unlocked')
  const million = opened.achievements.find((a) => a.id === 'million')
  assert.ok(million && !million.unlocked, 'million still locked')
  assert.ok(opened.joined.includes('成就'), 'achievements section header present')
})

await test('dock shows a next-goal hint for the closest locked achievement', async () => {
  const { moduleExports, runtime } = loadClient()
  const { ctx, slotRegistrations } = fakeClientContext()
  moduleExports.apply(ctx)
  const dock = findRegistration(slotRegistrations, 'conversation.composer.dock')
  const empty = projectionsWith({}, { tokenUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } })
  const out = await mount(runtime.React, runtime, dock.component, [dockProps(empty)])
  out.cleanup()
  assert.ok(out.joined.includes('🎯'), 'goal hint present on a fresh egg')
  assert.ok(out.joined.includes('破壳而出'), 'closest goal is the first meal')
})

// -------------------------------------------------- locale resources
await test('locale files carry every key the widget can render', () => {
  for (const [file, fallbackTable] of [
    ['en.json', 'en'],
    ['zh.json', 'zh'],
  ]) {
    const json = JSON.parse(fs.readFileSync(new URL(file, LOCALE_DIR), 'utf8'))
    assert.equal(typeof json.meta.title, 'string')
    assert.equal(typeof json.meta.description, 'string')
    for (const key of ['panel.title', 'panel.rings', 'panel.tools', 'panel.openColony', 'flash.molt', 'colony.title', 'colony.tab', 'species.engineer', 'species.explorer', 'species.scribe', 'species.scholar', 'stage.adult', 'stage.mythic', 'panel.stage', 'panel.achievements', 'goal.hint', 'flash.evolve', 'colony.totalSessions', 'colony.allSessions', 'ach.million.name', 'ach.mythicForm.desc']) {
      assert.equal(typeof json[key], 'string', file + ' is missing ' + key)
    }
    // Every achievement and stage the widget can render must have locale copy.
    for (const id of ['firstMeal', 'firstSplit', 'colony5', 'engineer30', 'explorer15', 'scribe10', 'scholar30', 'polyglot', 'firstMolt', 'rings3', 'marathon', 'million', 'cacheMaster', 'mythicForm']) {
      assert.equal(typeof json['ach.' + id + '.name'], 'string', file + ' missing ach.' + id + '.name')
      assert.equal(typeof json['ach.' + id + '.desc'], 'string', file + ' missing ach.' + id + '.desc')
    }
    for (const s of ['egg', 'hatchling', 'juvenile', 'adult', 'elder', 'mythic']) {
      assert.equal(typeof json['stage.' + s], 'string', file + ' missing stage.' + s)
    }
    assert.ok(json.meta.title.length > 0)
    assert.equal(typeof json['panel.tool.engineer'], 'string', file + ' tool label')
  }
})

console.log(`\n${passed} render tests passed`)
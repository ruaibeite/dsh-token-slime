/**
 * @ruaibeite/dsh-token-slime — browser half.
 *
 * A small slime lives under the composer. It eats the output tokens the agent
 * writes in this session, grows between meals, and splits into a colony once it
 * has eaten enough; the split includes the next generation's food cost.
 *
 * Two more systems ride on the host-side `slime` projection:
 *   - the tool mix (`tool/call` names folded into categories) names the breed
 *     and draws its hat: engineers get a hard hat, explorers a safari hat,
 *     scribes a mortarboard, scholars round glasses;
 *   - every `compaction/start` grows a ring on the body and molts a shell once.
 *
 * A "total colony" panel in the right sidebar aggregates every session through
 * `GET /dsh-token-slime/colony` (live sessions fold from the projection handle,
 * history comes from the session projection cache).
 *
 * Everything the widget shows is derived from projections the Harness already
 * computes; nothing is written to the conversation and no model call is made.
 */
window.__ModuleLoader__.load({
  id: '@ruaibeite/dsh-token-slime',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = '@ruaibeite/dsh-token-slime';

    // ---- tuning --------------------------------------------------------
    /** Output tokens needed for the first split; later generations cost more. */
    const FIRST_SPLIT = 4000;
    /** Cost multiplier per generation. */
    const GROWTH = 1.7;
    /** Hard cap on recorded generations (keeps the run-away colony sane). */
    const MAX_GEN = 9;
    /** Colony members drawn in the panel before collapsing into "+N". */
    const MAX_DRAWN = 8;
    /** Rings drawn on the body; more compactions still count in the panel. */
    const MAX_RINGS = 6;
    /** How long the slime looks excited after a meal. */
    const MEAL_MS = 1500;
    /** How long the split banner stays up. */
    const SPLIT_MS = 1900;
    /** How long the molt banner stays up. */
    const MOLT_MS = 2400;
    /** How long the stage-up (evolution) banner stays up. */
    const EVOLVE_MS = 2600;
    /** The total-colony route served by the host half. */
    const COLONY_ROUTE = '/dsh-token-slime/colony';
    /** How often the total-colony panel refreshes. */
    const COLONY_POLL_MS = 10000;

    /** Right-sidebar tab type identity. */
    const TAB_ID = '@ruaibeite/dsh-token-slime/colony';
    const TAB_KIND = 'token-slime-colony';

    // ---- fallback copy -------------------------------------------------
    // The locale service supplies these from ./locale/*.json; the tables keep
    // the widget readable if a profile has no locale resource for us.
    const TEXT = {
      zh: {
        'meta.title': 'Token 史莱姆',
        'a11y.open': '打开史莱姆图鉴',
        'a11y.close': '关闭史莱姆图鉴',
        'badge.gen': '第 {n} 代',
        'flash.split': '分裂！',
        'flash.molt': '蜕皮！',
        'panel.title': '史莱姆图鉴',
        'panel.close': '关闭',
        'panel.food': '下一餐',
        'panel.colony': '族群',
        'panel.diet': '吃进去的东西',
        'panel.diet.cached': '回收的记忆',
        'panel.diet.fresh': '新鲜上下文',
        'panel.diet.wrote': '写进缓存的记忆',
        'panel.diet.spoken': '说过的话',
        'panel.total': '累计 token',
        'panel.cache': '缓存命中',
        'panel.pressure': '上下文压力',
        'panel.rings': '年轮',
        'panel.rings.count': '{n} 圈',
        'panel.tools': '工具构成',
        'panel.tool.engineer': '代码与执行',
        'panel.tool.explorer': '探索网络',
        'panel.tool.scholar': '阅读检索',
        'panel.tool.scribe': '文书产出',
        'panel.tool.other': '其他',
        'panel.egg': '还在蛋里，等第一口 token。',
        'panel.next': '再吃 {n} 个输出 token 就分裂',
        'panel.note': '完全由会话日志推导：重新打开这个会话，它还是同一只。',
        'panel.openColony': '查看总族群',
        'species.moss': '苔藓种',
        'species.meadow': '草叶种',
        'species.clay': '黏土种',
        'species.lava': '熔岩种',
        'species.engineer': '工装种',
        'species.explorer': '探险种',
        'species.scribe': '文书种',
        'species.scholar': '学者种',
        'trait.cache': '食腐',
        'trait.talk': '话痨',
        'trait.crystal': '结晶',
        'colony.tab': '史莱姆族群',
        'colony.title': '总族群',
        'colony.sessions': '会话',
        'colony.food': '累计食物',
        'colony.rings': '累计年轮',
        'colony.generations': '世代',
        'colony.breed': '族群品种',
        'colony.mix': '品种比例',
        'colony.top': '最肥的会话',
        'colony.empty': '还没有会话数据。先聊几句？',
        'colony.loading': '正在清点族群…',
        'colony.error': '读取族群失败',
        'colony.refresh': '刷新',
        'colony.note': '汇总自已持久化的会话投影：历史会话只有 token 食物量，工具统计与年轮从插件启用后开始累计。',
        'colony.untitled': '未命名会话',
        'name.0': '小黏',
        'name.1': '绿团',
        'name.2': '果冻',
        'name.3': '软糖',
        'name.4': '苔苔',
        'name.5': '琥珀',
        'name.6': '云母',
        'name.7': '年轮',
        'name.8': '结晶',
        'name.9': '老黏',
        'stage.egg': '蛋',
        'stage.hatchling': '幼体',
        'stage.juvenile': '少年',
        'stage.adult': '成体',
        'stage.elder': '长老',
        'stage.mythic': '传说',
        'panel.stage': '成长阶段',
        'panel.stageNext': '距「{name}」还差 {n} token',
        'panel.stageMax': '已是最终形态',
        'flash.evolve': '进化！',
        'colony.totalSessions': '共 {n} 个会话',
        'colony.allSessions': '全部会话 · 按食物排序',
      },
      en: {
        'meta.title': 'Token slime',
        'a11y.open': 'Open the slime log',
        'a11y.close': 'Close the slime log',
        'badge.gen': 'Gen {n}',
        'flash.split': 'Split!',
        'flash.molt': 'Molt!',
        'panel.title': 'Slime log',
        'panel.close': 'Close',
        'panel.food': 'Next meal',
        'panel.colony': 'Colony',
        'panel.diet': 'What it ate',
        'panel.diet.cached': 'Recycled memory',
        'panel.diet.fresh': 'Fresh context',
        'panel.diet.wrote': 'Memory written to cache',
        'panel.diet.spoken': 'Words spoken',
        'panel.total': 'Total tokens',
        'panel.cache': 'Cache hit',
        'panel.pressure': 'Context pressure',
        'panel.rings': 'Growth rings',
        'panel.rings.count': '{n} rings',
        'panel.tools': 'Tool mix',
        'panel.tool.engineer': 'Code & shell',
        'panel.tool.explorer': 'Web',
        'panel.tool.scholar': 'Reading',
        'panel.tool.scribe': 'Documents',
        'panel.tool.other': 'Other',
        'panel.egg': 'Still an egg, waiting for its first token.',
        'panel.next': '{n} more output tokens until the next split',
        'panel.note': 'A pure function of the session log: reopen the conversation and it is the same slime.',
        'panel.openColony': 'Open the total colony',
        'species.moss': 'Moss breed',
        'species.meadow': 'Meadow breed',
        'species.clay': 'Clay breed',
        'species.lava': 'Lava breed',
        'species.engineer': 'Engineer breed',
        'species.explorer': 'Explorer breed',
        'species.scribe': 'Scribe breed',
        'species.scholar': 'Scholar breed',
        'trait.cache': 'Scavenger',
        'trait.talk': 'Chatterbox',
        'trait.crystal': 'Crystalline',
        'colony.tab': 'Slime colony',
        'colony.title': 'Total colony',
        'colony.sessions': 'Sessions',
        'colony.food': 'Total food',
        'colony.rings': 'Total rings',
        'colony.generations': 'Generations',
        'colony.breed': 'Colony breed',
        'colony.mix': 'Breed mix',
        'colony.top': 'Fattest sessions',
        'colony.empty': 'No session data yet. Say a few words?',
        'colony.loading': 'Counting the colony…',
        'colony.error': 'Could not read the colony',
        'colony.refresh': 'Refresh',
        'colony.note': 'Aggregated from persisted session projections: history carries food only; tool counts and rings start when the plugin was enabled.',
        'colony.untitled': 'Untitled session',
        'name.0': 'Slimy',
        'name.1': 'Blobby',
        'name.2': 'Jelly',
        'name.3': 'Gummy',
        'name.4': 'Mossy',
        'name.5': 'Amber',
        'name.6': 'Mica',
        'name.7': 'Ringlet',
        'name.8': 'Crystal',
        'name.9': 'Elder',
        'stage.egg': 'Egg',
        'stage.hatchling': 'Hatchling',
        'stage.juvenile': 'Juvenile',
        'stage.adult': 'Adult',
        'stage.elder': 'Elder',
        'stage.mythic': 'Mythic',
        'panel.stage': 'Life stage',
        'panel.stageNext': '{n} tokens to {name}',
        'panel.stageMax': 'Final form reached',
        'flash.evolve': 'Evolved!',
        'colony.totalSessions': '{n} sessions total',
        'colony.allSessions': 'All sessions · by food',
      },
    };

    // ---- helpers -------------------------------------------------------
    const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

    const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

    const unwrap = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

    /** Whether the surrounding page is running in Chinese. */
    function isChinese() {
      try {
        const lang = (document.documentElement && document.documentElement.lang) || '';
        const nav = typeof navigator === 'object' && navigator !== null ? navigator.language || '' : '';
        return /^zh/i.test(lang) || /^zh/i.test(nav);
      } catch {
        return false;
      }
    }

    /** Locale lookup with a bundled fallback table. */
    function textOf(t, zh) {
      const table = zh ? TEXT.zh : TEXT.en;
      return (key) => {
        if (typeof t === 'function') {
          try {
            const value = t(key);
            if (typeof value === 'string' && value !== '' && value !== key) return value;
          } catch {
            /* locale service unavailable: use the bundled copy */
          }
        }
        return table[key] !== undefined ? table[key] : key;
      };
    }

    /** Compact token counts: 1234 -> 1.2k. */
    function fmtCompact(value) {
      const n = num(value);
      if (n < 1000) return String(Math.round(n));
      if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'k';
      return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    }

    /** One decimal percent, trimmed. */
    function fmtPercent(ratio) {
      if (!Number.isFinite(ratio)) return '0%';
      const pct = ratio * 100;
      return (pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10) + '%';
    }

    // ---- growth model (mirrored in index.js for the aggregate) ---------
    /** Food (output tokens) required to leave generation `gen`. */
    function splitCost(gen) {
      return Math.round(FIRST_SPLIT * Math.pow(GROWTH, gen));
    }

    /**
     * Fold the session's output tokens into generations.
     * @param food - cumulative output tokens.
     * @returns generation, food toward the next split, and that split's cost.
     */
    function colonyOf(food) {
      let gen = 0;
      let rest = Math.max(0, num(food));
      let cost = splitCost(0);
      while (gen < MAX_GEN && rest >= cost) {
        rest -= cost;
        gen += 1;
        cost = splitCost(gen);
      }
      return {
        gen,
        rest,
        cost,
        progress: gen >= MAX_GEN ? 1 : clamp(cost > 0 ? rest / cost : 0, 0, 1),
      };
    }

    // ---- life stages (the headline growth ladder) ---------------------
    // Named maturity stages driven by the session's cumulative output tokens.
    // Orthogonal to the split/colony count: stage = how mature the slime looks,
    // colony = how many times it has split. Each stage-up is celebrated.
    const STAGES = [
      { key: 'egg', at: 0 },
      { key: 'hatchling', at: 1 },
      { key: 'juvenile', at: 2500 },
      { key: 'adult', at: 25000 },
      { key: 'elder', at: 120000 },
      { key: 'mythic', at: 600000 },
    ];

    /**
     * Resolve the life stage for a food total.
     * @param food - cumulative output tokens.
     * @returns stage index/key, the next stage, and progress toward it.
     */
    function stageOf(food) {
      const f = Math.max(0, num(food));
      let index = 0;
      for (let i = 0; i < STAGES.length; i += 1) {
        if (f >= STAGES[i].at) index = i;
      }
      const stage = STAGES[index];
      const next = index + 1 < STAGES.length ? STAGES[index + 1] : null;
      const span = next === null ? 0 : next.at - stage.at;
      return {
        index,
        key: stage.key,
        at: stage.at,
        next: next === null ? null : next.key,
        nextAt: next === null ? null : next.at,
        toNext: next === null ? 0 : Math.max(0, next.at - f),
        progress: next === null ? 1 : clamp(span > 0 ? (f - stage.at) / span : 0, 0, 1),
      };
    }

    // ---- tool diet ----------------------------------------------------
    const TOOL_SPECIES = ['engineer', 'explorer', 'scribe', 'scholar'];
    const TOOL_CATEGORIES = ['engineer', 'explorer', 'scribe', 'scholar', 'other'];
    const TOOL_HUES = { engineer: 38, explorer: 202, scribe: 268, scholar: 152 };
    const TOOL_DEFAULT_BREEDS = {
      engineer: 'species.engineer',
      explorer: 'species.explorer',
      scribe: 'species.scribe',
      scholar: 'species.scholar',
    };

    /**
     * Fold one tool name into a diet category. Kept in sync with the host
     * half by the tests.
     * @param name - the tool name.
     * @returns one of TOOL_CATEGORIES.
     */
    function categoryOfTool(name) {
      const tool = typeof name === 'string' ? name.trim() : '';
      if (tool === '') return 'other';
      if (/(docx|pptx|xlsx|pdf|office|document|present)/i.test(tool)) return 'scribe';
      if (/^(web_search|web_fetch|websearch|webfetch|fetch|browse)/i.test(tool)) return 'explorer';
      if (/^(run_code|bash|pwsh|terminal|shell|exec|write|edit|apply_patch|str_replace|fs_write|fs_edit|jobs|job_|workflow|ralph|plugin_manager|worktree)/i.test(tool)) return 'engineer';
      if (/^(read|glob|grep|ls\b|find\b|skill|session_search|session_query|session_event|workspace|todo_read|ask_user)/i.test(tool)) return 'scholar';
      return 'other';
    }

    /** The dom<inant tool category, or null when no classified tool ran. */
    function speciesOfTools(tools) {
      const counts = unwrap(tools);
      let best = null;
      let bestCount = 0;
      for (const category of TOOL_SPECIES) {
        const count = num(counts[category]);
        if (count > bestCount) {
          best = category;
          bestCount = count;
        }
      }
      return bestCount > 0 ? best : null;
    }

    /** Normalize a category counter from the projection. */
    function toolCounts(tools) {
      const counts = unwrap(tools);
      const out = {};
      for (const category of TOOL_CATEGORIES) out[category] = num(counts[category]);
      return out;
    }

    // ---- token diet ---------------------------------------------------
    /** Normalize a `tokenUsage` projection into the four billing buckets. */
    function bucketsOf(usage) {
      const u = unwrap(usage);
      const uncached = num(u.uncachedInputTokens);
      const cacheRead = num(u.cacheReadTokens);
      const cacheWrite = num(u.cacheWriteTokens);
      const output = num(u.outputTokens);
      const prompt = uncached + cacheRead + cacheWrite;
      return { uncached, cacheRead, cacheWrite, output, prompt, total: prompt + output };
    }

    /**
     * The token-diet fallback breed, used when a session ran no classified
     * tools: cache-heavy sessions grow a cool mossy slime, cache-poor ones a
     * warm clay-like slime.
     */
    function dietOf(b) {
      const cacheRatio = b.prompt > 0 ? b.cacheRead / b.prompt : 0;
      const outputShare = b.total > 0 ? b.output / b.total : 0;
      const writeShare = b.prompt > 0 ? b.cacheWrite / b.prompt : 0;
      let breed;
      let hue;
      if (cacheRatio >= 0.72) {
        breed = 'moss';
        hue = 152;
      } else if (cacheRatio >= 0.45) {
        breed = 'meadow';
        hue = 112;
      } else if (cacheRatio >= 0.2) {
        breed = 'clay';
        hue = 58;
      } else {
        breed = 'lava';
        hue = 16;
      }
      const traits = [];
      if (cacheRatio >= 0.6) traits.push('trait.cache');
      if (outputShare >= 0.1) traits.push('trait.talk');
      if (writeShare >= 0.25) traits.push('trait.crystal');
      return { cacheRatio, outputShare, writeShare, breed, hue, traits };
    }

    /**
     * The breed the slime shows: the tool mix wins when it names one,
     * otherwise the token diet does.
     * @returns `{ key, hue, hat, tool }` where `key` is a locale species key.
     */
    function breedOf(diet, tools) {
      const toolSpecies = speciesOfTools(tools);
      if (toolSpecies !== null) {
        return {
          key: TOOL_DEFAULT_BREEDS[toolSpecies],
          hue: TOOL_HUES[toolSpecies] === undefined ? diet.hue : TOOL_HUES[toolSpecies],
          hat: toolSpecies,
          tool: true,
        };
      }
      return { key: 'species.' + diet.breed, hue: diet.hue, hat: null, tool: false };
    }

    /** How many rings to draw on the body (the panel shows the true count). */
    function ringsOf(compactions) {
      return clamp(Math.floor(num(compactions)), 0, MAX_RINGS);
    }

    /** Context occupancy ratio, or null when the route reports no capacity. */
    function pressureRatioOf(pressure) {
      const p = unwrap(pressure);
      const window = num(p.contextWindow);
      const used = num(p.pressureTokens);
      if (window <= 0 || used <= 0) return null;
      return clamp(used / window, 0, 1);
    }

    // ---- styles --------------------------------------------------------
    const CSS = [
      '.tsl-root{position:relative;display:inline-flex;align-items:center}',
      '.tsl-trigger{display:inline-flex;align-items:center;gap:6px;padding:2px 8px 2px 3px;margin:0;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary,#1a1a1a);font:inherit;line-height:1;cursor:pointer;transition:background .15s ease,border-color .15s ease}',
      '.tsl-trigger:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1));border-color:var(--dsw-alias-border-l1,rgba(127,127,127,.18))}',
      '.tsl-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c6ef5);outline-offset:1px}',
      '.tsl-art{position:relative;display:block;flex:none}',
      '.tsl-breathe{animation:tsl-breathe 2.8s ease-in-out infinite;transform-origin:32px 54px}',
      '.tsl-bounce{animation:tsl-bounce .62s ease-in-out infinite;transform-origin:32px 54px}',
      '.tsl-egg{animation:tsl-egg 2.6s ease-in-out infinite;transform-origin:32px 54px}',
      '.tsl-blink{animation:tsl-blink 5.6s ease-in-out infinite;transform-origin:32px 36px}',
      '.tsl-molt{animation:tsl-molt 1.3s ease-out forwards;transform-origin:32px 54px}',
      '.tsl-ring{opacity:.55}',
      '.tsl-float{position:absolute;left:50%;top:-6px;transform:translateX(-50%);font-size:10.5px;font-weight:700;pointer-events:none;white-space:nowrap;animation:tsl-float 1.5s ease-out forwards}',
      '.tsl-panel{position:absolute;bottom:calc(100% + 8px);left:0;z-index:40;width:288px;max-height:min(430px,70vh);overflow-y:auto;padding:12px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#d9d9d9);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);box-shadow:0 10px 30px rgba(0,0,0,.18);font-size:12px;animation:tsl-pop .16s ease-out}',
      '.tsl-panel *{box-sizing:border-box}',
      '.tsl-close{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8a8a);font:inherit;font-size:12px;line-height:1;padding:2px 4px;border-radius:4px;cursor:pointer}',
      '.tsl-close:hover{color:var(--dsw-alias-label-primary,#1a1a1a);background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}',
      '.tsl-link{border:1px solid var(--dsw-alias-border-l2,#d9d9d9);background:transparent;color:var(--dsw-alias-label-primary,#1a1a1a);font:inherit;font-size:11px;line-height:1;padding:5px 10px;border-radius:999px;cursor:pointer;width:100%}',
      '.tsl-link:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}',
      '.tsl-colony{padding:14px 16px;display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary,#1a1a1a);font-size:12px;min-height:100%}',
      '.tsl-colony-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.tsl-colony-title{font-size:14px;font-weight:700;margin:0}',
      '.tsl-colony-hero{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,#e6e6e6);border-radius:12px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.06))}',
      '.tsl-colony-chips{display:flex;gap:6px}',
      '.tsl-colony-chip{flex:1 1 0;min-width:0;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.08))}',
      '.tsl-colony-chip-label{font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8a8a8a);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tsl-colony-chip-value{font-size:13px;font-weight:700}',
      '.tsl-colony-section{display:flex;flex-direction:column;gap:4px}',
      '.tsl-colony-section-title{font-size:10.5px;color:var(--dsw-alias-label-secondary,#6b6b6b)}',
      '.tsl-colony-row{display:flex;align-items:center;gap:8px;padding:4px 2px;border-bottom:1px dashed var(--dsw-alias-border-l1,rgba(127,127,127,.16))}',
      '.tsl-colony-row:last-child{border-bottom:0}',
      '.tsl-colony-row-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tsl-colony-row-meta{flex:0 0 auto;font-size:10.5px;color:var(--dsw-alias-label-secondary,#6b6b6b);font-variant-numeric:tabular-nums}',
      '.tsl-colony-note{font-size:9.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8a8a8a);margin:0}',
      '.tsl-colony-empty{padding:16px 4px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b6b6b)}',
      '.tsl-colony-count{font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b6b6b);font-variant-numeric:tabular-nums}',
      '.tsl-colony-list{max-height:340px;overflow-y:auto}',
      '.tsl-aura{animation:tsl-aura 2.4s ease-in-out infinite}',
      '.tsl-sparkles{animation:tsl-twinkle 1.8s ease-in-out infinite}',
      '@keyframes tsl-aura{0%,100%{opacity:.14}50%{opacity:.3}}',
      '@keyframes tsl-twinkle{0%,100%{opacity:.4}50%{opacity:1}}',
      '@keyframes tsl-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.06,.94)}}',
      '@keyframes tsl-bounce{0%,100%{transform:translateY(0) scale(1,1)}30%{transform:translateY(-5px) scale(.95,1.05)}62%{transform:translateY(0) scale(1.04,.96)}}',
      '@keyframes tsl-egg{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}',
      '@keyframes tsl-blink{0%,93%,100%{transform:scale(1,1)}96%{transform:scale(1,.08)}}',
      '@keyframes tsl-molt{0%{opacity:.55;transform:translate(0,0) scale(1)}70%{opacity:.28}100%{opacity:0;transform:translate(4px,-10px) scale(1.12)}}',
      '@keyframes tsl-float{0%{opacity:0;transform:translate(-50%,4px) scale(.9)}18%{opacity:1}100%{opacity:0;transform:translate(-50%,-26px) scale(1.05)}}',
      '@keyframes tsl-pop{0%{opacity:0;transform:scale(.94) translateY(4px)}100%{opacity:1;transform:scale(1) translateY(0)}}',
      '@media (prefers-reduced-motion: reduce){.tsl-breathe,.tsl-bounce,.tsl-egg,.tsl-blink,.tsl-molt,.tsl-aura,.tsl-sparkles{animation:none!important}.tsl-float{animation-duration:.01s!important}}',
    ].join('\n');

    // ---- art -----------------------------------------------------------
    const BODY_PATH = 'M32 7c15.5 0 26 12.8 26 27.5C58 49 47.5 59 32 59S6 49 6 34.5C6 19.8 16.5 7 32 7z';

    /** The breed's headwear (or glasses), drawn over the body. */
    function BreedMark(props) {
      const hat = props.hat;
      const dark = '#263238';
      if (hat === 'engineer') {
        return h(
          'g',
          { className: 'tsl-hat', 'data-hat': 'engineer' },
          h('path', { d: 'M18 17c0-8 6.2-13 14-13s14 5 14 13z', fill: '#f5c542', stroke: '#d9a520', strokeWidth: 1.2 }),
          h('rect', { x: 11, y: 15.5, width: 42, height: 4.2, rx: 2.1, fill: '#e0a800', stroke: '#c08f00', strokeWidth: 0.8 }),
          h('rect', { x: 21, y: 12.5, width: 22, height: 2.2, rx: 1.1, fill: '#b98600', opacity: 0.75 }),
        );
      }
      if (hat === 'explorer') {
        return h(
          'g',
          { className: 'tsl-hat', 'data-hat': 'explorer' },
          h('ellipse', { cx: 32, cy: 16.5, rx: 21.5, ry: 4.4, fill: '#caa66a', stroke: '#9c7b43', strokeWidth: 1 }),
          h('path', { d: 'M20.5 16.5c1.1-7 6-10.5 11.5-10.5s10.4 3.5 11.5 10.5z', fill: '#d9b87c', stroke: '#9c7b43', strokeWidth: 1 }),
          h('path', { d: 'M20.5 16.5h23', stroke: '#7d5f2f', strokeWidth: 2.4, strokeLinecap: 'round' }),
        );
      }
      if (hat === 'scribe') {
        return h(
          'g',
          { className: 'tsl-hat', 'data-hat': 'scribe' },
          h('path', { d: 'M13 14.5 32 7l19 7.5-19 7.5z', fill: '#2f3542', stroke: '#1b1f27', strokeWidth: 0.8 }),
          h('path', { d: 'M22.5 18.5v6.5c0 3 19 3 19 0v-6.5', fill: '#3d4552', stroke: '#1b1f27', strokeWidth: 0.8 }),
          h('path', { d: 'M50 15v9.5', stroke: '#f5c542', strokeWidth: 1.8, strokeLinecap: 'round' }),
          h('circle', { cx: 50, cy: 26, r: 2, fill: '#f5c542' }),
        );
      }
      if (hat === 'scholar') {
        return h(
          'g',
          { className: 'tsl-hat', 'data-hat': 'scholar' },
          h('circle', { cx: 24, cy: 35.5, r: 6.4, fill: 'none', stroke: dark, strokeWidth: 1.7 }),
          h('circle', { cx: 41, cy: 35.5, r: 6.4, fill: 'none', stroke: dark, strokeWidth: 1.7 }),
          h('path', { d: 'M30.4 35.5h4.2', stroke: dark, strokeWidth: 1.7 }),
        );
      }
      return null;
    }

    /** The slime itself (also used, smaller, for colony members). */
    function SlimeArt(props) {
      const size = props.size || 30;
      const gen = num(props.gen);
      const hue = num(props.hue) || 150;
      const progress = props.progress === undefined ? 1 : clamp(num(props.progress), 0, 1);
      const excited = props.excited === true;
      const egg = props.egg === true;
      const hat = typeof props.hat === 'string' ? props.hat : null;
      const rings = ringsOf(props.rings);
      const species = typeof props.species === 'string' ? props.species : '';
      const stageIdx = clamp(Math.floor(num(props.stage)), 0, STAGES.length - 1);

      if (egg) {
        return h(
          'svg',
          { width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': true, className: 'tsl-art', 'data-species': species },
          h(
            'g',
            { className: 'tsl-egg' },
            h('ellipse', { cx: 32, cy: 36, rx: 17, ry: 21, fill: '#f6f1e6', stroke: '#dbcfb8', strokeWidth: 1.6 }),
            h('circle', { cx: 25, cy: 29, r: 2.6, fill: '#e5d9c1' }),
            h('circle', { cx: 39, cy: 38, r: 2, fill: '#e5d9c1' }),
            h('circle', { cx: 30, cy: 47, r: 1.6, fill: '#e5d9c1' }),
            h('ellipse', { cx: 25, cy: 25, rx: 4.5, ry: 3, transform: 'rotate(-24 25 25)', fill: '#ffffff', opacity: 0.55 }),
          ),
        );
      }

      const sat = clamp(60 + gen * 2, 60, 78);
      const light = clamp(57 - gen * 1.4, 42, 57);
      const deepLight = clamp(light - 14, 26, 50);
      const bodyHue = (hue + gen * 6) % 360;
      const scale = clamp(0.58 + 0.07 * stageIdx + 0.3 * progress, 0.5, 1.04);
      const blinkDelay = ((gen * 0.83) % 5.2).toFixed(2) + 's';
      // Higher life stages glow; the mythic stage also sparkles.
      const aura = stageIdx >= 4
        ? h('ellipse', { className: 'tsl-aura', cx: 32, cy: 36, rx: 30, ry: 28, fill: 'hsl(' + bodyHue + ' 85% 72%)', opacity: stageIdx >= 5 ? 0.3 : 0.16 })
        : null;
      const sparkles = stageIdx >= 5
        ? h(
            'g',
            { className: 'tsl-sparkles' },
            h('circle', { cx: 9, cy: 14, r: 1.7, fill: '#ffffff', opacity: 0.95 }),
            h('circle', { cx: 55, cy: 18, r: 1.3, fill: '#ffffff', opacity: 0.85 }),
            h('circle', { cx: 51, cy: 51, r: 1.5, fill: '#ffffff', opacity: 0.9 }),
          )
        : null;

      const spots = [];
      for (let i = 0; i < Math.min(gen, 4); i += 1) {
        spots.push(
          h('circle', {
            key: 'spot-' + i,
            cx: 20 + i * 8,
            cy: 52,
            r: 2.2,
            fill: 'hsl(' + bodyHue + ' ' + sat + '% ' + deepLight + '%)',
            opacity: 0.5,
          }),
        );
      }

      const ringMarks = [];
      for (let i = 0; i < rings; i += 1) {
        const width = 12 - i * 1.3;
        const y = 54 - i * 3.1;
        ringMarks.push(
          h('path', {
            key: 'ring-' + i,
            className: 'tsl-ring',
            d: 'M' + (32 - width) + ' ' + y + 'q' + width + ' 5 ' + width * 2 + ' 0',
            fill: 'none',
            stroke: 'hsl(' + bodyHue + ' ' + sat + '% ' + deepLight + '%)',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
          }),
        );
      }

      const mouth = excited
        ? h('path', { d: 'M26 42.5q6 7 12 0z', fill: '#123a29', opacity: 0.85 })
        : h('path', {
            d: 'M28 43.5q4 4 8 0',
            fill: 'none',
            stroke: '#123a29',
            strokeWidth: 2.2,
            strokeLinecap: 'round',
          });

      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 64 64', 'aria-hidden': true, className: 'tsl-art', 'data-species': species, 'data-stage': STAGES[stageIdx].key },
        h(
          'g',
          { className: excited ? 'tsl-bounce' : 'tsl-breathe' },
          h(
            'g',
            { transform: 'translate(32 34) scale(' + scale + ') translate(-32 -34)' },
            aura,
            h('path', { d: BODY_PATH, fill: 'hsl(' + bodyHue + ' ' + sat + '% ' + light + '%)' }),
            h('ellipse', {
              cx: 22.5,
              cy: 21.5,
              rx: 7,
              ry: 4.8,
              transform: 'rotate(-24 22.5 21.5)',
              fill: '#ffffff',
              opacity: 0.36,
            }),
            ringMarks.length > 0 ? h('g', { className: 'tsl-rings' }, ringMarks) : null,
            spots.length > 0 ? h('g', null, spots) : null,
            h(
              'g',
              { className: 'tsl-blink', style: { animationDelay: blinkDelay } },
              h('circle', { cx: 24, cy: 35.5, r: 4.5, fill: '#123a29' }),
              h('circle', { cx: 41, cy: 35.5, r: 4.5, fill: '#123a29' }),
              h('circle', { cx: 25.6, cy: 33.8, r: 1.55, fill: '#ffffff' }),
              h('circle', { cx: 42.6, cy: 33.8, r: 1.55, fill: '#ffffff' }),
            ),
            mouth,
            h(BreedMark, { hat }),
            sparkles,
          ),
        ),
      );
    }

    /** The shed shell that flies off after a compaction. */
    function MoltShell(props) {
      const hue = num(props.hue) || 150;
      return h(
        'svg',
        { width: props.size || 30, height: props.size || 30, viewBox: '0 0 64 64', 'aria-hidden': true, className: 'tsl-art', 'data-molt': String(num(props.compactions)) },
        h(
          'g',
          { key: 'molt-' + num(props.compactions), className: 'tsl-molt' },
          h('path', { d: BODY_PATH, fill: 'hsl(' + hue + ' 22% 94%)', stroke: 'hsl(' + hue + ' 30% 82%)', strokeWidth: 1.2 }),
        ),
      );
    }

    /** Thin progress bar using host tokens. */
    function Bar(props) {
      const pct = clamp(num(props.value), 0, 1) * 100;
      return h(
        'span',
        {
          style: {
            display: 'block',
            width: '100%',
            height: props.height || 4,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'var(--dsw-alias-border-l1, rgba(127,127,127,.18))',
          },
        },
        h('span', {
          style: {
            display: 'block',
            height: '100%',
            width: pct + '%',
            borderRadius: 999,
            background: props.color || 'var(--dsw-alias-brand-primary, #4c6ef5)',
            transition: 'width .35s ease',
          },
        }),
      );
    }

    /** One labelled chip of session numbers. */
    function StatChip(props) {
      return h(
        'div',
        {
          style: {
            flex: '1 1 0',
            minWidth: 0,
            padding: '6px 8px',
            borderRadius: 8,
            background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08))',
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 9.5,
              lineHeight: 1.2,
              marginBottom: 2,
              color: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          },
          props.label,
        ),
        h('div', { style: { fontSize: 13, fontWeight: 700, lineHeight: 1.2 } }, props.value),
      );
    }

    /** One share row: label, percentage, and a bar. */
    function ShareRow(props) {
      const value = clamp(num(props.value), 0, 1);
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' } },
        h(
          'span',
          {
            style: {
              flex: '0 0 92px',
              fontSize: 10.5,
              color: 'var(--dsw-alias-label-secondary, #6b6b6b)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          },
          props.label,
        ),
        h('span', { style: { flex: '1 1 auto' } }, h(Bar, { value, color: props.color, height: 4 })),
        h(
          'span',
          {
            style: {
              flex: '0 0 34px',
              textAlign: 'right',
              fontSize: 10.5,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--dsw-alias-label-secondary, #6b6b6b)',
            },
          },
          fmtPercent(value),
        ),
      );
    }

    // ---- the dock widget -----------------------------------------------
    function SlimeWidget(props) {
      // `useProjection` is a hook supplied by the session-scoped slot. Fall back
      // to a constant hook when a profile registers us outside that scope, so
      // the hook count never changes between renders.
      const useProjection = typeof props.useProjection === 'function' ? props.useProjection : () => undefined;
      const usage = useProjection('tokenUsage');
      const pressure = useProjection('contextPressure');
      const vitals = useProjection('slime');

      const zh = isChinese();
      const tr = textOf(props.t, zh);

      const buckets = bucketsOf(usage);
      const diet = dietOf(buckets);
      const colony = colonyOf(buckets.output);
      const ctxRatio = pressureRatioOf(pressure);
      const egg = buckets.total === 0 && buckets.output === 0;
      const counts = toolCounts(unwrap(vitals).tools);
      const toolCalls = num(unwrap(vitals).toolCalls);
      const compactions = num(unwrap(vitals).compactions);
      const breed = breedOf(diet, counts);
      const accent = 'hsl(' + ((breed.hue + colony.gen * 6) % 360) + ' 62% 46%)';
      const rings = ringsOf(compactions);
      const stage = stageOf(buckets.output);

      const [open, setOpen] = React.useState(false);
      const [excited, setExcited] = React.useState(false);
      const [floats, setFloats] = React.useState([]);
      const [splitFlash, setSplitFlash] = React.useState(false);
      const [moltFlash, setMoltFlash] = React.useState(false);
      const [evolveFlash, setEvolveFlash] = React.useState(null);
      const rootRef = React.useRef(null);
      const meal = React.useRef({ food: buckets.output });
      const gen = React.useRef({ value: colony.gen });
      const ringsRef = React.useRef({ value: compactions });
      const stageRef = React.useRef({ value: stage.index });
      const timers = React.useRef(null);
      if (timers.current === null) timers.current = new Set();
      const floatSeed = React.useRef(0);

      // Clear every pending timer on unmount.
      React.useEffect(
        () => () => {
          if (timers.current !== null) {
            for (const id of timers.current) clearTimeout(id);
            timers.current.clear();
          }
        },
        [],
      );

      // A meal: the agent wrote new output tokens.
      React.useEffect(() => {
        const before = meal.current.food;
        const delta = buckets.output - before;
        meal.current.food = buckets.output;
        if (delta <= 0) return;
        setExcited(true);
        floatSeed.current += 1;
        const id = 'f' + floatSeed.current;
        setFloats((list) => [...list, { id, text: '+' + fmtCompact(delta) }].slice(-3));
        const done = setTimeout(() => {
          setExcited(false);
          setFloats((list) => list.filter((item) => item.id !== id));
          if (timers.current !== null) timers.current.delete(done);
        }, MEAL_MS);
        if (timers.current !== null) timers.current.add(done);
      }, [buckets.output]);

      // A split: the colony gained a generation.
      React.useEffect(() => {
        const before = gen.current.value;
        gen.current.value = colony.gen;
        if (colony.gen <= before) return;
        setSplitFlash(true);
        const done = setTimeout(() => {
          setSplitFlash(false);
          if (timers.current !== null) timers.current.delete(done);
        }, SPLIT_MS);
        if (timers.current !== null) timers.current.add(done);
      }, [colony.gen]);

      // A molt: a compaction closed, so the slime sheds a shell.
      React.useEffect(() => {
        const before = ringsRef.current.value;
        ringsRef.current.value = compactions;
        if (compactions <= before) return;
        setMoltFlash(true);
        const done = setTimeout(() => {
          setMoltFlash(false);
          if (timers.current !== null) timers.current.delete(done);
        }, MOLT_MS);
        if (timers.current !== null) timers.current.add(done);
      }, [compactions]);

      // A stage-up: the slime matured into a new life stage.
      React.useEffect(() => {
        const before = stageRef.current.value;
        stageRef.current.value = stage.index;
        if (stage.index <= before) return;
        setEvolveFlash({ from: STAGES[before].key, to: STAGES[stage.index].key });
        const done = setTimeout(() => {
          setEvolveFlash(null);
          if (timers.current !== null) timers.current.delete(done);
        }, EVOLVE_MS);
        if (timers.current !== null) timers.current.add(done);
      }, [stage.index]);

      // Close the panel on an outside click or Escape.
      React.useEffect(() => {
        if (!open) return undefined;
        const onDown = (event) => {
          const el = rootRef.current;
          if (el !== null && el !== undefined && !el.contains(event.target)) setOpen(false);
        };
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
          document.removeEventListener('mousedown', onDown, true);
          document.removeEventListener('keydown', onKey);
        };
      }, [open]);

      const name = tr('name.' + (colony.gen % 10));
      const genText = tr('badge.gen').replace('{n}', String(colony.gen));
      const drawn = Math.min(colony.gen, MAX_DRAWN);
      const restChildren = colony.gen - drawn;
      const openColony = typeof props.openColonyTab === 'function' ? props.openColonyTab : null;

      // Third dock line: a transient celebration wins over the standing stage hint.
      const triggerFlash = evolveFlash !== null
        ? tr('flash.evolve') + ' ' + tr('stage.' + evolveFlash.to)
        : splitFlash
          ? tr('flash.split')
          : moltFlash
            ? tr('flash.molt')
            : null;
      const triggerLine = triggerFlash !== null
        ? triggerFlash
        : stage.next === null
          ? tr('panel.stageMax')
          : tr('panel.stageNext').replace('{name}', tr('stage.' + stage.next)).replace('{n}', fmtCompact(stage.toNext));

      const trigger = h(
        'button',
        {
          type: 'button',
          className: 'tsl-trigger',
          onClick: () => setOpen((value) => !value),
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': tr('a11y.open'),
          title: tr('panel.title') + ' · ' + name,
          'data-species': breed.tool ? breed.hat : 'diet',
        },
        h(
          'span',
          { className: 'tsl-art' },
          h(SlimeArt, {
            size: 30,
            hue: breed.hue,
            gen: colony.gen,
            progress: colony.progress,
            excited,
            egg,
            hat: breed.hat,
            rings: compactions,
            stage: stage.index,
            species: breed.tool ? breed.hat : breed.key,
          }),
          floats.map((item) =>
            h('span', { key: item.id, className: 'tsl-float', style: { color: accent } }, item.text),
          ),
        ),
        h(
          'span',
          { style: { display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' } },
          h(
            'span',
            { style: { display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1.1 } },
            h('span', { style: { fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' } }, egg ? '?' : name),
            h(
              'span',
              {
                style: {
                  fontSize: 9,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  padding: '1px 5px',
                  borderRadius: 999,
                  color: accent,
                  border: '1px solid ' + accent,
                  opacity: 0.95,
                },
              },
              tr('stage.' + stage.key),
            ),
            h(
              'span',
              {
                style: {
                  fontSize: 9.5,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  color: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
                },
              },
              egg ? 'egg' : genText,
            ),
          ),
          h('span', { style: { width: 60 } }, h(Bar, { value: egg ? 0 : stage.progress, color: accent, height: 3 })),
          h(
            'span',
            {
              style: {
                fontSize: 9,
                lineHeight: 1.2,
                maxWidth: 150,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontWeight: triggerFlash !== null ? 700 : 500,
                color: triggerFlash !== null ? accent : 'var(--dsw-alias-label-tertiary, #8a8a8a)',
                animation: triggerFlash !== null ? 'tsl-pop .3s ease-out' : 'none',
              },
            },
            triggerLine,
          ),
        ),
      );

      let panel = null;
      if (open) {
        const statChips = h(
          'div',
          { style: { display: 'flex', gap: 6, marginBottom: 10 } },
          h(StatChip, { label: tr('panel.total'), value: fmtCompact(buckets.total) }),
          h(StatChip, {
            label: tr('panel.cache'),
            value: diet.cacheRatio > 0 ? fmtPercent(diet.cacheRatio) : '—',
          }),
          h(StatChip, {
            label: tr('panel.pressure'),
            value: ctxRatio === null ? '—' : fmtPercent(ctxRatio),
          }),
        );

        const nextMeal = egg
          ? h(
              'p',
              {
                style: {
                  margin: '0 0 10px',
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: 'var(--dsw-alias-label-secondary, #6b6b6b)',
                },
              },
              tr('panel.egg'),
            )
          : h(
              'div',
              { style: { marginBottom: 10 } },
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 4,
                    fontSize: 10.5,
                    color: 'var(--dsw-alias-label-secondary, #6b6b6b)',
                  },
                },
                h('span', null, tr('panel.food')),
                h(
                  'span',
                  { style: { fontVariantNumeric: 'tabular-nums' } },
                  fmtCompact(colony.rest) + ' / ' + fmtCompact(colony.cost),
                ),
              ),
              h(Bar, { value: colony.progress, color: accent, height: 5 }),
              h(
                'div',
                {
                  style: {
                    marginTop: 4,
                    fontSize: 10,
                    color: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
                  },
                },
                tr('panel.next').replace('{n}', fmtCompact(Math.max(0, colony.cost - colony.rest))),
              ),
            );

        const breedRow = h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8,
              fontSize: 10.5,
              color: 'var(--dsw-alias-label-secondary, #6b6b6b)',
            },
          },
          h('span', { style: { color: accent, fontWeight: 700 } }, tr(breed.key)),
          compactions > 0
            ? h('span', null, '· ' + tr('panel.rings') + ' ' + tr('panel.rings.count').replace('{n}', String(compactions)))
            : null,
          rings > 0
            ? h(
                'span',
                { style: { display: 'inline-flex', alignItems: 'center', gap: 1 } },
                h(SlimeArt, {
                  size: 20,
                  hue: breed.hue,
                  gen: colony.gen,
                  progress: colony.progress,
                  hat: breed.hat,
                  species: breed.tool ? breed.hat : breed.key,
                }),
              )
            : null,
          compactions > 0
            ? h(MoltShell, { size: 20, hue: breed.hue, compactions })
            : null,
        );

        const colonyRow =
          colony.gen > 0
            ? h(
                'div',
                { style: { marginBottom: 10 } },
                h(
                  'div',
                  {
                    style: {
                      fontSize: 10.5,
                      marginBottom: 4,
                      color: 'var(--dsw-alias-label-secondary, #6b6b6b)',
                    },
                  },
                  tr('panel.colony') + ' · ' + String(colony.gen),
                ),
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' } },
                  Array.from({ length: drawn }, (_, index) =>
                    h(
                      'span',
                      { key: 'child-' + index, style: { display: 'inline-flex' } },
                      h(SlimeArt, {
                        size: 22,
                        hue: breed.hue + (index + 1) * 9,
                        gen: index + 1,
                        progress: 1,
                        hat: breed.hat,
                        species: breed.tool ? breed.hat : breed.key,
                      }),
                    ),
                  ),
                  restChildren > 0
                    ? h(
                        'span',
                        {
                          style: {
                            fontSize: 10.5,
                            color: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
                            marginLeft: 2,
                          },
                        },
                        '+' + String(restChildren),
                      )
                    : null,
                ),
              )
            : null;

        const toolRows =
          toolCalls > 0
            ? h(
                'div',
                { style: { marginBottom: 8 } },
                h(
                  'div',
                  {
                    style: {
                      fontSize: 10.5,
                      marginBottom: 2,
                      color: 'var(--dsw-alias-label-secondary, #6b6b6b)',
                    },
                  },
                  tr('panel.tools'),
                ),
                ['engineer', 'explorer', 'scholar', 'scribe', 'other'].map((category) =>
                  h(ShareRow, {
                    key: category,
                    label: tr('panel.tool.' + category),
                    value: toolCalls > 0 ? counts[category] / toolCalls : 0,
                    color: category === 'other' ? '#9aa0a6' : 'hsl(' + TOOL_HUES[category] + ' 62% 52%)',
                  }),
                ),
              )
            : null;

        const dietBlock = h(
          'div',
          { style: { marginBottom: 8 } },
          h(
            'div',
            {
              style: {
                fontSize: 10.5,
                marginBottom: 2,
                color: 'var(--dsw-alias-label-secondary, #6b6b6b)',
              },
            },
            tr('panel.diet'),
          ),
          h(ShareRow, {
            label: tr('panel.diet.cached'),
            value: buckets.total > 0 ? buckets.cacheRead / buckets.total : 0,
            color: '#4c9f70',
          }),
          h(ShareRow, {
            label: tr('panel.diet.fresh'),
            value: buckets.total > 0 ? buckets.uncached / buckets.total : 0,
            color: '#4c6ef5',
          }),
          h(ShareRow, {
            label: tr('panel.diet.wrote'),
            value: buckets.total > 0 ? buckets.cacheWrite / buckets.total : 0,
            color: '#9775fa',
          }),
          h(ShareRow, {
            label: tr('panel.diet.spoken'),
            value: buckets.total > 0 ? buckets.output / buckets.total : 0,
            color: '#f5a623',
          }),
        );

        const traitRow =
          diet.traits.length > 0
            ? h(
                'div',
                { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 } },
                diet.traits.map((key) =>
                  h(
                    'span',
                    {
                      key,
                      style: {
                        fontSize: 10,
                        lineHeight: 1,
                        padding: '3px 7px',
                        borderRadius: 999,
                        color: accent,
                        border: '1px solid ' + accent,
                        opacity: 0.9,
                      },
                    },
                    tr(key),
                  ),
                ),
              )
            : null;

        const stageLadder = h(
          'div',
          { style: { marginBottom: 10 } },
          h(
            'div',
            { style: { fontSize: 10.5, marginBottom: 4, color: 'var(--dsw-alias-label-secondary, #6b6b6b)' } },
            tr('panel.stage') + ' · ' + tr('stage.' + stage.key),
          ),
          h(Bar, { value: stage.progress, color: accent, height: 5 }),
          h(
            'div',
            { style: { marginTop: 4, fontSize: 10, color: 'var(--dsw-alias-label-tertiary, #8a8a8a)' } },
            stage.next === null
              ? tr('panel.stageMax')
              : tr('panel.stageNext').replace('{name}', tr('stage.' + stage.next)).replace('{n}', fmtCompact(stage.toNext)),
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 3, marginTop: 5 } },
            STAGES.map((s, i) =>
              h('span', {
                key: s.key,
                title: tr('stage.' + s.key),
                style: {
                  flex: '1 1 0',
                  height: 4,
                  borderRadius: 999,
                  background: i <= stage.index ? accent : 'var(--dsw-alias-border-l1, rgba(127,127,127,.18))',
                  opacity: i <= stage.index ? 1 : 0.6,
                },
              }),
            ),
          ),
        );

        panel = h(
          'div',
          { className: 'tsl-panel', role: 'dialog', 'aria-label': tr('panel.title') },
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 8,
              },
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 } },
              h('span', { style: { fontSize: 13, fontWeight: 700 } }, tr('panel.title')),
              h(
                'span',
                { style: { fontSize: 10.5, color: 'var(--dsw-alias-label-tertiary, #8a8a8a)' } },
                egg ? 'egg' : name + ' · ' + genText,
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'tsl-close',
                onClick: () => setOpen(false),
                'aria-label': tr('a11y.close'),
                title: tr('panel.close'),
              },
              '✕',
            ),
          ),
          statChips,
          nextMeal,
          stageLadder,
          breedRow,
          colonyRow,
          toolRows,
          dietBlock,
          traitRow,
          openColony !== null
            ? h(
                'button',
                { type: 'button', className: 'tsl-link', onClick: openColony },
                tr('panel.openColony'),
              )
            : null,
          h(
            'div',
            {
              style: {
                marginTop: 6,
                fontSize: 9.5,
                lineHeight: 1.5,
                color: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
              },
            },
            tr('panel.note'),
          ),
        );
      }

      return h(
        'div',
        { className: 'tsl-root', ref: rootRef, 'data-rings': String(compactions) },
        h('style', null, CSS),
        trigger,
        panel,
      );
    }

    // ---- the total-colony sidebar tab ---------------------------------
    /** Fetch the aggregate payload once. */
    function loadColony() {
      const url = new URL(COLONY_ROUTE, document.baseURI);
      return fetch(url, { headers: { accept: 'application/json' } }).then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      });
    }

    /** A breed label from a species id the host computed. */
    function speciesLabel(tr, species) {
      if (species === null || species === undefined) return tr('species.moss');
      return tr('species.' + species);
    }

    /** The right-sidebar tab body: the colony across every stored session. */
    function ColonyPanel(props) {
      const zh = isChinese();
      const tr = textOf(props.t, zh);
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [busy, setBusy] = React.useState(false);

      const refresh = () => {
        setBusy(true);
        loadColony()
          .then((payload) => {
            setData(payload);
            setError(null);
          })
          .catch((failure) => setError(failure && failure.message ? failure.message : String(failure)))
          .finally(() => setBusy(false));
      };

      React.useEffect(() => {
        let alive = true;
        const poll = () => {
          loadColony()
            .then((payload) => {
              if (!alive) return;
              setData(payload);
              setError(null);
            })
            .catch((failure) => {
              if (!alive) return;
              setError(failure && failure.message ? failure.message : String(failure));
            });
        };
        poll();
        const id = setInterval(poll, COLONY_POLL_MS);
        return () => {
          alive = false;
          clearInterval(id);
        };
      }, []);

      const total = data !== null && data.total !== undefined ? data.total : null;
      const sessions = data !== null && Array.isArray(data.sessions) ? data.sessions : [];
      const totalColony = colonyOf(total === null ? 0 : total.food);
      const totalStage = stageOf(total === null ? 0 : total.food);
      const sessionCount = total === null ? 0 : num(total.sessions);
      const totalBreed = total === null ? null : total.species;
      const totalHue = totalBreed !== null && TOOL_HUES[totalBreed] !== undefined ? TOOL_HUES[totalBreed] : 150;
      const toolTotal = total === null ? 0 : num(total.toolCalls);

      const hero =
        h(
          'div',
          { className: 'tsl-colony-hero' },
          h(
            'span',
            { style: { display: 'inline-flex', flexShrink: 0 } },
            h(SlimeArt, {
              size: 54,
              hue: totalHue,
              gen: totalColony.gen,
              progress: totalColony.progress,
              hat: totalBreed,
              rings: total === null ? 0 : total.compactions,
              stage: totalStage.index,
              species: totalBreed === null ? 'species.moss' : 'species.' + totalBreed,
            }),
          ),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 } },
            h(
              'div',
              { style: { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
              total === null ? '—' : speciesLabel(tr, totalBreed),
            ),
            h(
              'div',
              { style: { fontSize: 10.5, color: 'var(--dsw-alias-label-secondary, #6b6b6b)' } },
              tr('stage.' + totalStage.key) + ' · ' + tr('colony.generations') + ' ' + String(totalColony.gen),
            ),
            h('span', { style: { width: 120 } }, h(Bar, { value: totalColony.progress, color: 'hsl(' + totalHue + ' 62% 46%)', height: 3 })),
          ),
        );

      const chips =
        h(
          'div',
          { className: 'tsl-colony-chips' },
          h(StatChip, { label: tr('colony.food'), value: fmtCompact(total === null ? 0 : total.food) }),
          h(StatChip, { label: tr('colony.rings'), value: String(total === null ? 0 : num(total.compactions)) }),
          h(StatChip, { label: tr('colony.sessions'), value: String(total === null ? 0 : total.sessions) }),
        );

      const mix =
        total !== null && toolTotal > 0
          ? h(
              'div',
              { className: 'tsl-colony-section' },
              h('div', { className: 'tsl-colony-section-title' }, tr('colony.mix')),
              ['engineer', 'explorer', 'scribe', 'scholar'].map((category) =>
                  h(ShareRow, {
                    key: category,
                    label: tr('panel.tool.' + category),
                    value: num(total.tools[category]) / toolTotal,
                    color: 'hsl(' + TOOL_HUES[category] + ' 62% 52%)',
                  }),
                ),
            )
          : null;

      const rows =
        sessions.length > 0
          ? h(
              'div',
              { className: 'tsl-colony-section' },
              h(
                'div',
                { className: 'tsl-colony-section-title' },
                tr('colony.allSessions') + ' · ' + String(sessions.length),
              ),
              h('div', { className: 'tsl-colony-list' },
              sessions.map((session, index) =>
                h(
                  'div',
                  { className: 'tsl-colony-row', key: session.id === undefined ? 'row-' + index : String(session.id) },
                  h(
                    'span',
                    { style: { display: 'inline-flex', flexShrink: 0 } },
                    h(SlimeArt, {
                      size: 20,
                      hue: session.species !== null && TOOL_HUES[session.species] !== undefined ? TOOL_HUES[session.species] : 150,
                      gen: num(session.gen),
                      progress: clamp(num(session.progress), 0, 1),
                      hat: session.species === null ? null : session.species,
                      rings: num(session.compactions),
                      species: session.species === null ? 'diet' : session.species,
                    }),
                  ),
                  h(
                    'span',
                    { className: 'tsl-colony-row-title', title: session.title === null ? undefined : String(session.title) },
                    session.title === null || session.title === undefined || session.title === '' ? tr('colony.untitled') : String(session.title),
                  ),
                  h(
                    'span',
                    { className: 'tsl-colony-row-meta' },
                    fmtCompact(num(session.outputTokens)) + ' · ' + tr('badge.gen').replace('{n}', String(num(session.gen))),
                  ),
                ),
              ),
              ),
            )
          : h('div', { className: 'tsl-colony-empty' }, tr('colony.empty'));

      let body;
      if (error !== null) {
        body = h('div', { className: 'tsl-colony-empty' }, tr('colony.error') + ': ' + error);
      } else if (data === null) {
        body = h('div', { className: 'tsl-colony-empty' }, tr('colony.loading'));
      } else {
        body = h(React.Fragment, null, hero, chips, mix, rows);
      }

      return h(
        'div',
        { className: 'tsl-colony' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'tsl-colony-head' },
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
            h('h2', { className: 'tsl-colony-title' }, tr('colony.title')),
            h(
              'span',
              { className: 'tsl-colony-count', 'data-session-count': String(sessionCount) },
              tr('colony.totalSessions').replace('{n}', String(sessionCount)),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'tsl-close',
              onClick: refresh,
              disabled: busy,
              title: tr('colony.refresh'),
              'aria-label': tr('colony.refresh'),
            },
            busy ? '…' : '↻',
          ),
        ),
        body,
        h('p', { className: 'tsl-colony-note' }, tr('colony.note')),
      );
    }

    /** The tab strip's label for our page. */
    function ColonyTitle(props) {
      const zh = isChinese();
      const tr = textOf(props.t, zh);
      return h('span', null, tr('colony.tab'));
    }

    // ---- plugin --------------------------------------------------------
    return {
      inject: ['slots'],
      apply(ctx) {
        const zh = isChinese();
        const tr = textOf(undefined, zh);

        const openColonyTab = () => {
          try {
            const right = typeof ctx.get === 'function' ? ctx.get('sidebarRight') : undefined;
            if (right !== undefined && typeof right.openTab === 'function') right.openTab(TAB_KIND);
          } catch {
            /* the sidebar may be unavailable in this profile */
          }
        };

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'token-slime',
              order: 2,
              locale: NS,
              inject: () => ({ openColonyTab }),
            },
            SlimeWidget,
          ),
        );

        const tabs = typeof ctx.get === 'function' ? ctx.get('sidebarRightTabs') : undefined;
        if (tabs !== undefined && typeof tabs.register === 'function') {
          ctx.effect(
            () =>
              tabs.register({
                id: TAB_ID,
                kind: TAB_KIND,
                priority: 'builtin',
                title: () => tr('colony.tab'),
              }),
            'token-slime: colony tab type',
          );
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register(
              { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS },
              ColonyPanel,
            ),
          );
          ctx.slots.inject('sidebar.right.pane.tab.title', () =>
            ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, ColonyTitle),
          );
        }
      },
      // Pure model surface for tests; the module loader only reads `apply` and
      // `inject`, so this is inert at runtime.
      __model: {
        FIRST_SPLIT,
        GROWTH,
        MAX_GEN,
        TAB_ID,
        TAB_KIND,
        COLONY_ROUTE,
        colonyOf,
        splitCost,
        categoryOfTool,
        speciesOfTools,
        bucket: bucketsOf,
        diet: dietOf,
        breed: breedOf,
        ringsOf,
        STAGES,
        stageOf,
      },
    };
  },
});
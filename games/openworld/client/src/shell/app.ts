// The LoreMaster application shell (docs/phase1-design-specification.md §5–§11). Layer A: branding, the opening, the
// story home and library, Discover, app settings, and the character recommendation. Layer B — the pixel game and its
// title screen — is untouched: every play action hands off through the existing save/start contracts
// (packages/runtime/src/shellHandoff.ts → the game page's own Cover), never through a second save store or runtime.

import type { Look, Text } from '@openworld/engine'
import { game, savesKey } from '@openworld/runtime/src/game.ts'
import { listSlots, type Slot, type SlotData } from '@openworld/runtime/src/saves.ts'
import { setShellHandoff } from '@openworld/runtime/src/shellHandoff.ts'
import type { SaveSummary } from '@openworld/runtime/src/protocol.ts'
import { ACT_COVER, OPENWORLD_STORY, OPENWORLD_WORLD, SPECIES_PROFILES, currentAct } from './contracts.ts'
import { ARTWORK_SLOTS, artMarkup } from './artwork.ts'
import { LOCAL_RECOMMENDER, lookFrom, modelRecommender, type Recommender } from './recommend.ts'

type Route = 'opening' | 'home' | 'library' | 'discover' | 'create' | 'settings'

interface Recommendation {
  look: Look
  explanation: Text
  approximate: string[]
  source: string
  problems: string[]
}

interface State {
  route: Route
  slots: (SlotData | undefined)[]
  ready: boolean
  error?: string
  description: string
  consent: boolean
  busy: boolean
  recommendation?: Recommendation
}

const MOTION_KEY = 'loremaster:motion'
const OPENED_KEY = 'loremaster:opened'
/** The game's page: the existing title screen and runtime, which the shell hands off to. */
const GAME_PAGE = './index.html'

const en = (t: Text): string => (typeof t === 'string' ? t : t.en)
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const state: State = { route: 'home', slots: [], ready: false, description: '', consent: false, busy: false }

let root: HTMLElement
/** The recommender the create step asks: a model when the page names one (?ai=<url>), else the offline rules. */
let recommender: Recommender = LOCAL_RECOMMENDER
/** Is a model service connected at all: when not, the offline rules need explicit consent (no silent fallback). */
let hasModel = false

const aiUrl = (): string | undefined => new URLSearchParams(location.search).get('ai') ?? undefined

const reducedMotion = (): boolean => {
  try {
    const set = localStorage.getItem(MOTION_KEY)
    if (set === 'reduced') return true
    if (set === 'full') return false
  } catch {
    /* no storage: the system's answer */
  }
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const stored = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

const remember = (key: string, on: boolean): void => {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    /* no storage: remembered for this visit only */
  }
}

// ------------------------------------------------------------------ the save surface (existing, read-only)

/** One existing slot's line, as the game's title writes it (the same summary contract, no parallel copy). */
function line(s: SaveSummary | undefined): string {
  if (!s) return 'A fresh story'
  if (s.ended) return `Hardcore · ended · ${en(s.map)} · day ${s.day}`
  const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
  return [en(s.map), `day ${s.day} ${time}`, `Lv ${s.level}`, s.objective ? en(s.objective) : s.quest && en(s.quest)].filter(Boolean).join(' · ')
}

const latest = (): Slot | undefined => {
  let best: Slot | undefined
  for (const slot of [1, 2, 3] as const) {
    const d = state.slots[slot - 1]
    if (d && !d.summary?.ended && (!best || d.savedAt > state.slots[best - 1]!.savedAt)) best = slot
  }
  return best
}

const played = (): Slot[] => ([1, 2, 3] as const).filter((s) => !!state.slots[s - 1])

const when = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

async function loadSlots(): Promise<void> {
  try {
    state.slots = await listSlots(savesKey())
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
  }
  state.ready = true
}

// ------------------------------------------------------------------ the game handoff (the existing contracts)

function resume(slot: Slot): void {
  setShellHandoff({ kind: 'resume', slot })
  location.assign(GAME_PAGE)
}

function openTitle(): void {
  location.assign(GAME_PAGE)
}

function startNew(): void {
  const look = state.recommendation?.look
  setShellHandoff({ kind: 'new', ...(look && { look }) })
  location.assign(GAME_PAGE)
}

// ------------------------------------------------------------------ the recommendation

async function recommend(): Promise<void> {
  const text = state.description.trim()
  if (!text || state.busy) return
  if (!hasModel && !state.consent) return
  state.busy = true
  state.error = undefined
  render()
  try {
    const g = game()
    const base = g.looks.player
    const table = g.looks.table
    const answer = await recommender.recommend(text, base, table)
    const { look, problems } = lookFrom(base, answer, table)
    state.recommendation = { look, explanation: answer.explanation, approximate: answer.approximate, source: answer.source, problems }
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err)
  }
  state.busy = false
  render()
}

// ------------------------------------------------------------------ the shell's own screens

function nav(route: Route): string {
  const item = (id: Route, label: string) =>
    `<button type="button" class="lm-navitem${state.route === id ? ' on' : ''}" data-go="${id}" ${state.route === id ? 'aria-current="page"' : ''}>${label}</button>`
  return `<header class="lm-header">
    <div class="lm-brand" data-go="home" role="button" tabindex="0" aria-label="LoreMaster home">
      <span class="lm-mark" aria-hidden="true"><i></i></span>
      <span class="lm-wordmark">LoreMaster</span>
    </div>
    <nav class="lm-nav" aria-label="Application">
      ${item('home', 'Home')}${item('library', 'Library')}${item('discover', 'Discover')}${item('settings', 'Settings')}
    </nav>
  </header>`
}

function opening(): string {
  return `<div class="lm-opening" data-route="opening">
    <div class="lm-open-glow" aria-hidden="true"></div>
    <div class="lm-open-copy">
      <span class="lm-mark big" aria-hidden="true"><i></i></span>
      <h1 class="lm-open-title">LoreMaster</h1>
      <p class="lm-open-line">Every world begins with a story worth telling.</p>
      <div class="lm-open-acts">
        <button type="button" class="lm-btn primary" data-go="home">Enter</button>
        <button type="button" class="lm-btn ghost" data-go="home">Skip</button>
      </div>
    </div>
  </div>`
}

/**
 * One save's card. Its picture is the act's own illustration when that act has one, otherwise the story's cover;
 * a ``thumb'' shows the same picture in the library's small square frame.
 */
function slotCard(slot: Slot, variant: 'plain' | 'thumb'): string {
  const d = state.slots[slot - 1]
  const act = d?.summary ? currentAct(OPENWORLD_STORY, d.summary.day) : undefined
  const art = act?.art
    ? artMarkup(act.art, variant === 'thumb' ? 'library-thumb' : 'story-cover')
    : artMarkup(OPENWORLD_STORY.cover, variant === 'thumb' ? 'library-thumb' : 'story-cover')
  return `<article class="lm-card${variant === 'thumb' ? ' compact' : ''}${d ? '' : ' empty'}" data-slot="${slot}">
    ${art}
    <div class="lm-card-body">
      <p class="lm-kicker">${esc(en(OPENWORLD_STORY.title))}${act ? ` · ${esc(en(act.label))}` : ''}</p>
      <h3 class="lm-card-title">${d ? esc(line(d.summary)) : 'A fresh story'}</h3>
      <p class="lm-card-meta">${d ? `Slot ${slot} · saved ${when(d.savedAt)}` : `Slot ${slot} · not started`}</p>
      <div class="lm-card-acts">
        ${d
          ? `<button type="button" class="lm-btn primary" data-resume="${slot}">Resume story</button>`
          : `<button type="button" class="lm-btn" data-new="1">Begin a story</button>`}
      </div>
    </div>
  </article>`
}

/**
 * The featured banner: a save's own story — its cover, its act, its last line — or, with no save, the invitation to
 * begin that story. The picture carries the page; the copy sits on its lower edge over the scrim.
 */
function banner(): string {
  const best = latest()
  const d = best ? state.slots[best - 1] : undefined
  const act = d?.summary ? currentAct(OPENWORLD_STORY, d.summary.day) : undefined
  const art = artMarkup(act?.art ?? OPENWORLD_STORY.cover, 'story-hero')
  const kicker = d
    ? ['Continue', act ? en(act.label) : undefined].filter(Boolean).map((s) => esc(s!)).join(' · ')
    : [en(OPENWORLD_WORLD.title), en(OPENWORLD_WORLD.genre)].map(esc).join(' · ')
  return `<section class="lm-banner" aria-labelledby="lm-featured">
    ${art}
    <div class="lm-banner-copy">
      <p class="lm-eyebrow">${kicker}</p>
      <h1 class="lm-display" id="lm-featured">${esc(en(OPENWORLD_STORY.title))}</h1>
      <p class="lm-lede">${esc(en(OPENWORLD_STORY.summary))}</p>
      ${d
        ? `<p class="lm-banner-meta">${esc(line(d.summary))} · Slot ${best} · saved ${when(d.savedAt)}</p>
           <div class="lm-card-acts">
             <button type="button" class="lm-btn primary" data-resume="${best}">Resume story</button>
             <button type="button" class="lm-btn ghost" data-go="library">Your stories</button>
           </div>`
        : `<p class="lm-banner-meta">Nothing is written yet · three save slots wait on this device</p>
           <div class="lm-card-acts">
             <button type="button" class="lm-btn primary" data-new="1">Begin a story</button>
             <button type="button" class="lm-btn ghost" data-go="discover">Explore the world</button>
           </div>`}
    </div>
  </section>`
}

/** The saves other than the featured one, or an honest note about the slots that are still empty. */
function stories(): string {
  const best = latest()
  const others = played().filter((s) => s !== best)
  const empty = `<div class="lm-empty">
      <span class="lm-empty-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <div>
        <h3 class="lm-card-title">${best ? 'Two slots are still open' : 'Your stories will gather here'}</h3>
        <p class="lm-muted">${best
          ? 'Each story you begin keeps its own slot. Their progress is read from the game\u2019s own saves, never a second copy.'
          : 'Three save slots live on this device. Begin a story and its progress appears here, read from the game\u2019s own saves.'}</p>
      </div>
    </div>`
  return `<section class="lm-section" aria-labelledby="lm-stories">
    <div class="lm-section-head"><h2 class="lm-h2" id="lm-stories">Your stories</h2><button type="button" class="lm-link" data-go="library">See all</button></div>
    ${others.length ? `<div class="lm-grid">${others.map((s) => slotCard(s, 'plain')).join('')}</div>` : empty}
  </section>`
}

/** The one playable world, as a wide band: its picture, its promise, and the way in. */
function discoverBand(): string {
  const world = OPENWORLD_WORLD
  return `<section class="lm-section" aria-labelledby="lm-discover">
    <div class="lm-section-head"><h2 class="lm-h2" id="lm-discover">Discover</h2><button type="button" class="lm-link" data-go="discover">All worlds</button></div>
    <article class="lm-band">
      ${artMarkup(world.cover, 'world-cover')}
      <div class="lm-band-copy">
        <p class="lm-kicker">${esc(en(world.genre))}</p>
        <h3 class="lm-band-title">${esc(en(world.title))}</h3>
        <p class="lm-lede">${esc(en(world.summary))}</p>
        <p class="lm-muted">${esc(en(world.setting))} · ${esc(en(world.era))}</p>
        <div class="lm-card-acts"><button type="button" class="lm-btn primary" data-go="discover">Explore the world</button></div>
      </div>
    </article>
  </section>`
}

function home(): string {
  return `<main class="lm-main" data-route="home">
    ${banner()}
    ${stories()}
    ${discoverBand()}
  </main>`
}

function library(): string {
  return `<main class="lm-main" data-route="library">
    <h1 class="lm-h1">Library</h1>
    <p class="lm-lede">Your stories, read from the game's own save slots.</p>
    <div class="lm-list">${([1, 2, 3] as const).map((s) => slotCard(s, 'thumb')).join('')}</div>
    <section class="lm-panel" aria-labelledby="lm-slotmgmt">
      <h2 class="lm-h2" id="lm-slotmgmt">Save files</h2>
      <p class="lm-muted">Exporting, importing and deleting a slot stay in the game's title screen, where the save files already live.</p>
      <button type="button" class="lm-btn" data-title="1">Open the game's title screen</button>
    </section>
  </main>`
}

function discover(): string {
  const world = OPENWORLD_WORLD
  return `<main class="lm-main" data-route="discover">
    <header class="lm-pagehead">
      <p class="lm-eyebrow">A curated shelf</p>
      <h1 class="lm-h1">Discover worlds</h1>
      <p class="lm-lede">One world is playable today. More arrive as content packs, not as a marketplace — and only a world with its own pack can be entered.</p>
    </header>
    <section class="lm-banner world" aria-labelledby="lm-world">
      ${artMarkup(world.cover, 'world-hero')}
      <div class="lm-banner-copy">
        <p class="lm-eyebrow">${esc(en(world.genre))}</p>
        <h2 class="lm-display" id="lm-world">${esc(en(world.title))}</h2>
        <p class="lm-lede">${esc(en(world.summary))}</p>
        <p class="lm-banner-meta">${esc(en(world.setting))} · ${esc(en(world.era))} · ${esc(en(world.tone))}</p>
        <div class="lm-card-acts">
          <button type="button" class="lm-btn primary" data-new="1">Begin a story</button>
          <button type="button" class="lm-btn ghost" data-go="library">Your stories</button>
        </div>
      </div>
    </section>
    <section class="lm-panel" aria-labelledby="lm-worldfacts">
      <h2 class="lm-h2" id="lm-worldfacts">About ${esc(en(world.title))}</h2>
      <dl class="lm-facts">
        <div><dt>Setting</dt><dd>${esc(en(world.setting))}</dd></div>
        <div><dt>Genre</dt><dd>${esc(en(world.genre))}</dd></div>
        <div><dt>Tone</dt><dd>${esc(en(world.tone))}</dd></div>
        <div><dt>Era</dt><dd>${esc(en(world.era))}</dd></div>
      </dl>
      <ul class="lm-tags" aria-label="Visual motifs">${world.motifs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
    </section>
    <p class="lm-note">More worlds are announced for later phases. They have no play action until each has its own content pack.</p>
  </main>`
}

function create(): string {
  const rec = state.recommendation
  const gated = !hasModel && !state.consent
  const species = SPECIES_PROFILES[0]!
  return `<main class="lm-main" data-route="create">
    <h1 class="lm-h1">Describe your traveller</h1>
    <p class="lm-lede">A sentence is enough. The recommendation uses only the bodies, parts and colours this world already has, and you edit it in the character creator before you begin.</p>
    <label class="lm-field">
      <span class="lm-label">Who are they?</span>
      <textarea id="lm-desc" class="lm-textarea" rows="3" placeholder="A young woman with cropped silver hair, a scar, a travelling coat and tall boots.">${esc(state.description)}</textarea>
    </label>
    ${hasModel
      ? ''
      : `<div class="lm-consent">
          <p class="lm-note"><b>No AI service is connected.</b> The offline recommendation reads your words with fixed rules; it does not send them anywhere.</p>
          <label class="lm-check"><input type="checkbox" id="lm-consent" ${state.consent ? 'checked' : ''} /><span>Use the offline recommendation</span></label>
        </div>`}
    ${state.error ? `<p class="lm-error" role="alert">${esc(state.error)}</p>` : ''}
    <div class="lm-card-acts">
      <button type="button" class="lm-btn primary" id="lm-recommend" ${gated || state.busy || !state.description.trim() ? 'disabled' : ''}>${state.busy ? 'Reading…' : 'Recommend an appearance'}</button>
    </div>
    ${rec
      ? `<section class="lm-panel" aria-labelledby="lm-rec">
          <h2 class="lm-h2" id="lm-rec">Recommendation</h2>
          <p class="lm-quote">${esc(en(rec.explanation))}</p>
          <ul class="lm-pins">
            <li><span>Body</span><b>${esc(rec.look.body)}</b></li>
            ${Object.entries(rec.look.parts).map(([slot, id]) => `<li><span>${esc(slot)}</span><b>${esc(id)}</b></li>`).join('')}
            ${Object.entries(rec.look.colors).map(([key, value]) => `<li><span>${esc(key)}</span><b>${esc(value)}</b></li>`).join('')}
          </ul>
          <p class="lm-words">${esc(game().looks.describe(rec.look).en)}</p>
          ${rec.approximate.length ? `<ul class="lm-approx">${rec.approximate.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
          ${rec.problems.length ? `<p class="lm-error" role="alert">This recommendation does not fit the world's look table: ${esc(rec.problems.join('; '))}</p>` : ''}
          <p class="lm-note">Species today: ${esc(en(species.label))} only — ${esc(en(species.note))}</p>
          <div class="lm-card-acts">
            <button type="button" class="lm-btn primary" data-new="1" ${rec.problems.length ? 'disabled' : ''}>Continue to the character creator</button>
            <button type="button" class="lm-btn ghost" data-title="1">Skip and open the title screen</button>
          </div>
        </section>`
      : ''}
  </main>`
}

function settings(): string {
  const motion = reducedMotion() ? 'reduced' : 'full'
  return `<main class="lm-main" data-route="settings">
    <h1 class="lm-h1">Settings</h1>
    <p class="lm-lede">These are the application's own settings. The game keeps its settings — language, sound, world filter, keys and AI — on its title screen.</p>
    <section class="lm-panel" aria-labelledby="lm-motion">
      <h2 class="lm-h2" id="lm-motion">Motion</h2>
      <div class="lm-seg" role="group" aria-label="Motion">
        <button type="button" class="lm-segbtn${motion === 'full' ? ' on' : ''}" data-motion="full" aria-pressed="${motion === 'full'}">Full</button>
        <button type="button" class="lm-segbtn${motion === 'reduced' ? ' on' : ''}" data-motion="reduced" aria-pressed="${motion === 'reduced'}">Reduced</button>
      </div>
    </section>
    <section class="lm-panel" aria-labelledby="lm-gamesettings">
      <h2 class="lm-h2" id="lm-gamesettings">Game settings</h2>
      <p class="lm-muted">Language, sound, the world filter, keys and the AI model are set in the game, not here.</p>
      <button type="button" class="lm-btn" data-title="1">Open the game's title screen</button>
    </section>
    <section class="lm-panel" aria-labelledby="lm-art">
      <h2 class="lm-h2" id="lm-art">Artwork slots</h2>
      <ul class="lm-pins">
        ${Object.values(ARTWORK_SLOTS).map((s) => `<li><span>${esc(s.kind)}</span><b>${esc(s.aspect)} · ${esc(s.narrowAspect)}</b></li>`).join('')}
      </ul>
      <p class="lm-muted">Act illustrations use the <code>${esc(ACT_COVER.id)}</code> slot: ${esc(ACT_COVER.aspect)}, ${esc(ACT_COVER.fit)}, safe margin ${Math.round(ACT_COVER.safeMargin * 100)}%. Until an act has its own picture, its card shows the story cover, then the shell's fallback.</p>
    </section>
  </main>`
}

// ------------------------------------------------------------------ render and wire

function body(): string {
  switch (state.route) {
    case 'opening':
      return opening()
    case 'library':
      return library()
    case 'discover':
      return discover()
    case 'create':
      return create()
    case 'settings':
      return settings()
    default:
      return home()
  }
}

function render(): void {
  if (!state.ready && state.route !== 'opening') {
    root.innerHTML = `<div class="lm-shell lm-boot" data-route="boot"><div class="lm-boot-bar" role="status" aria-label="Loading your stories"><i></i></div></div>`
    return
  }
  const chrome = state.route === 'opening' ? '' : nav(state.route)
  root.innerHTML = `<div class="lm-shell lm-${state.route}">${chrome}${body()}</div>`
  wire()
}

function go(route: Route): void {
  state.route = route
  render()
  const heading = root.querySelector<HTMLElement>('h1')
  heading?.focus?.({ preventScroll: true })
}

function wire(): void {
  root.querySelectorAll<HTMLElement>('[data-go]').forEach((el) => {
    const to = el.dataset.go as Route
    el.onclick = () => go(to)
    if (el.getAttribute('role') === 'button') el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(to) } }
  })
  root.querySelectorAll<HTMLElement>('[data-resume]').forEach((el) => (el.onclick = () => resume(Number(el.dataset.resume) as Slot)))
  root.querySelectorAll<HTMLElement>('[data-new]').forEach((el) => (el.onclick = () => (state.recommendation ? startNew() : go('create'))))
  root.querySelectorAll<HTMLElement>('[data-title]').forEach((el) => (el.onclick = () => openTitle()))
  root.querySelectorAll<HTMLElement>('[data-motion]').forEach((el) => (el.onclick = () => {
    try {
      localStorage.setItem(MOTION_KEY, el.dataset.motion === 'reduced' ? 'reduced' : 'full')
    } catch {
      /* no storage */
    }
    render()
  }))
  const desc = root.querySelector<HTMLTextAreaElement>('#lm-desc')
  if (desc) {
    desc.oninput = () => {
      state.description = desc.value
      const button = root.querySelector<HTMLButtonElement>('#lm-recommend')
      if (button) button.disabled = (!hasModel && !state.consent) || !state.description.trim()
    }
  }
  // a picture that fails to load keeps its frame and shows the fallback; a cached failure fires no error event
  root.querySelectorAll<HTMLImageElement>('.lm-art-img').forEach((img) => {
    const art = img.closest('.lm-art')
    const fail = (): void => art?.classList.add('missing')
    const done = (): void => art?.classList.add('loaded')
    img.addEventListener('error', fail, { once: true })
    img.addEventListener('load', done, { once: true })
    if (img.complete) (img.naturalWidth === 0 ? fail : done)()
  })
  const consent = root.querySelector<HTMLInputElement>('#lm-consent')
  if (consent) consent.onchange = () => { state.consent = consent.checked; render() }
  const button = root.querySelector<HTMLButtonElement>('#lm-recommend')
  if (button) button.onclick = () => void recommend()
}

/** The shell's entry: the opening on a first visit, the home screen once a story exists or the opening was seen. */
export async function mount(element: HTMLElement): Promise<void> {
  root = element
  root.classList.add('lm-root')
  const url = aiUrl()
  if (url) {
    hasModel = true
    const ask = async (prompt: string): Promise<string> => {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) })
      if (!res.ok) throw new Error(`The AI service answered ${res.status}.`)
      return (await res.json() as { text?: string }).text ?? (await Promise.resolve(''))
    }
    recommender = modelRecommender(ask)
  }
  document.documentElement.lang = 'en'
  state.route = 'opening'
  render()
  await loadSlots()
  const seen = stored(OPENED_KEY) || played().length > 0
  if (seen) state.route = 'home'
  render()
  if (state.route === 'opening') {
    remember(OPENED_KEY, true)
    // the opening advances on its own unless motion is reduced (then the player takes it)
    if (!reducedMotion()) window.setTimeout(() => { if (state.route === 'opening') go('home') }, 2600)
  }
}

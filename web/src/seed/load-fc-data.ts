import fs from 'fs'
import path from 'path'
import vm from 'vm'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** Repo root — the static site lives one level above the `web/` app. */
export const SITE_ROOT = path.resolve(dirname, '../../..')

/**
 * `fc-data.js` is a browser script that ends in `window.FCBase = B`. Rather
 * than retyping 825 lines of content into a seed fixture — which would drift
 * the moment anyone re-pulls from Claude Design — we evaluate the real file in
 * a sandbox and read the object straight off it.
 *
 * The globals it touches are not enumerated on purpose. The committed version
 * already reaches for `window`, `localStorage`, `navigator`, `document` (it
 * sets `<html lang>`) and `fetch`, there is an i18next integration landing on
 * main that adds more, and the next re-pull will add something else again. So
 * the sandbox is a Proxy that auto-vivifies any unknown property into a
 * callable no-op object. The script runs to completion regardless of what it
 * asks for; we only care about the data literals.
 */
/** A callable, constructible, infinitely-chainable no-op. */
function noop(): any {
  return new Proxy(function () {} as any, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return () => ''
      if (prop === Symbol.iterator || prop === 'then') return undefined
      if (!(prop in target)) target[prop] = noop()
      return target[prop]
    },
    set(target, prop, value) {
      target[prop] = value
      return true
    },
    apply: () => noop(),
    construct: () => noop(),
  })
}

/**
 * fc-data.js is a plain non-strict IIFE, which lets us wrap it in a `with`
 * block. That matters: a Proxy cannot be a vm context directly, and a plain
 * context object cannot trap lookups of identifiers it does not carry — an
 * unknown bare global would throw ReferenceError and abort the load. `with` +
 * a `has: () => true` proxy intercepts every unresolved identifier instead.
 */
function runSandboxed(source: string, filename: string): Record<string, unknown> {
  const windowObj: Record<string, unknown> = {}

  const globals: Record<string | symbol, unknown> = {
    window: windowObj,
    self: windowObj,
    globalThis: windowObj,
    console,
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    Promise,
    URLSearchParams,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
  }

  const scope = new Proxy(globals, {
    // Claim every identifier so nothing escapes to the real global scope.
    has: (_t, prop) => prop !== Symbol.unscopables,
    get(target, prop) {
      if (prop === Symbol.unscopables) return undefined
      if (!(prop in target)) target[prop] = noop()
      return target[prop]
    },
    set(target, prop, value) {
      target[prop] = value
      return true
    },
  })

  const context = vm.createContext({ __fcScope: scope })
  vm.runInContext(`with (__fcScope) {\n${source}\n}`, context, { filename })

  return windowObj
}

export type FCBase = Record<string, any>

export function loadFCBase(): FCBase {
  const file = path.join(SITE_ROOT, 'fc-data.js')
  const source = fs.readFileSync(file, 'utf8')

  const windowObj = runSandboxed(source, file)
  const base = windowObj.FCBase as FCBase | undefined
  if (!base) throw new Error(`fc-data.js evaluated but never set window.FCBase (${file})`)

  // Fail loudly before writing anything if the shape moved under us.
  const expect = (label: string, actual: number, want: number) => {
    if (actual !== want) {
      throw new Error(
        `fc-data.js has ${actual} ${label}, expected ${want}. The source changed — ` +
          `re-check the seed mapping before importing.`,
      )
    }
  }
  expect('BIZ records', base.BIZ?.length, 14)
  expect('EVENTS records', base.EVENTS?.length, 20)
  expect('STORIES records', base.STORIES?.length, 3)
  expect('WEEKLY records', base.WEEKLY?.length, 6)
  expect('CITIES', Object.keys(base.CITIES ?? {}).length, 3)
  expect('CATS (incl. the "all" chip)', base.CATS?.length, 6)
  expect('EKINDS (incl. the "all" chip)', base.EKINDS?.length, 8)

  return base
}

/** `T()` reimplemented: EN string in, ES string out, English on a miss. */
export function makeTranslator(base: FCBase) {
  const ES: Record<string, string> = base.ES ?? {}
  const EV_ES: Record<string, string> = base.EV_ES ?? {}
  return (s: string | undefined | null): string | undefined => {
    if (s == null) return undefined
    return ES[s] ?? EV_ES[s] ?? s
  }
}

/**
 * The source carries HTML entities in data written for a browser —
 * 'RAFA &amp; YOLI', 'TONI, MARISOL, MILA &amp; CHUCHO'. Stored raw they would
 * render as literal `&amp;` through React, which escapes on output.
 */
export function decodeEntities(s: string): string
export function decodeEntities(s: undefined): undefined
export function decodeEntities(s: string | undefined): string | undefined
export function decodeEntities(s: string | undefined): string | undefined {
  if (s == null) return undefined
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/** `weekly-4-son-cubano-live` from a title, for the records with no source id. */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

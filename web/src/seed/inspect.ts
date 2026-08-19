/**
 * Smoke check for the fc-data.js sandbox loader. Reads nothing from Payload and
 * writes nothing — run it with `pnpm seed:inspect` when the source file changes.
 */
import { loadFCBase, makeTranslator, decodeEntities, slugify } from './load-fc-data'

const base = loadFCBase()
const T = makeTranslator(base)

console.log('cities        ', Object.keys(base.CITIES).join(', '))
console.log('categories    ', base.CATS.length, '->', base.CATS.length - 1, 'after dropping "all"')
console.log('event kinds   ', base.EKINDS.length, '->', base.EKINDS.length - 1)
console.log('listings      ', base.BIZ.length)
console.log('detail records', Object.keys(base.DETAIL).join(', '))
console.log('stories       ', base.STORIES.map((s: any) => `${s.id}(${s.blocks.length})`).join(' '))
console.log('events        ', base.EVENTS.length, '| with biz:', base.EVENTS.filter((e: any) => e.biz).length, '| with place:', base.EVENTS.filter((e: any) => e.place).length)
console.log('weekly        ', base.WEEKLY.length)
console.log('spotlights    ', Object.keys(base.SPOTS).join(', '))
console.log('dictionary    ', Object.keys(base.ES).length, 'ES +', Object.keys(base.EV_ES).length, 'EV_ES')
console.log('')
console.log('translate     ', JSON.stringify(T(base.BIZ[0].tag)))
console.log('entities      ', JSON.stringify(decodeEntities(base.CITIES.hialeah.cast[0].name)))
console.log('synthetic slug', slugify(base.WEEKLY[3].title), '| spotlight-havana')
console.log('block types   ', [...new Set(base.STORIES.flatMap((s: any) => s.blocks.map((b: any) => b[0])))].join(', '))

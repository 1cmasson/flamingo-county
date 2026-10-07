import type { Media } from '../payload-types'
import { MediaSlot } from './MediaSlot'
import s from './storycard.module.css'

/**
 * A DID YOU KNOW? story's cover, drawn as the reel's cover card: the same
 * thumbnail people saw on Instagram and TikTok, so the page they land on looks
 * like the post that sent them. The photo sits in a polaroid with its credit
 * written on it, which is why the page skips the cover caption strip under it.
 *
 * Wide on a page, 9:16 on the reel; see storycard.module.css.
 */
export function StoryCard({
  photo,
  credit,
  title,
  tagline,
  kicker,
  sizes,
}: {
  photo?: Media | number | string | null
  /** The cover caption: who took the photo, and its licence. */
  credit?: string | null
  title: string
  tagline: string
  /** The two halves of DID YOU KNOW?, yellow then pink, in the page's language. */
  kicker: [string, string]
  sizes?: string
}) {
  const media = photo && typeof photo === 'object' && photo.url ? photo : null
  const position =
    media && media.focalX != null && media.focalY != null ? `${media.focalX}% ${media.focalY}%` : undefined
  return (
    <div className={media ? s.card : `${s.card} ${s.noPhoto}`}>
      <div className={s.dots} aria-hidden="true" />
      <div className={s.rules} aria-hidden="true" />
      <div className={s.grid}>
        <div className={s.kick}>
          <span className={s.kickA}>{kicker[0]}</span> <span className={s.kickB}>{kicker[1]}</span>
        </div>
        {media ? (
          <figure className={s.photo}>
            <div className={s.frame}>
              <MediaSlot media={media} sizes={sizes} priority style={{ objectPosition: position }} />
            </div>
            {credit ? <figcaption className={s.cap}>{credit}</figcaption> : null}
          </figure>
        ) : null}
        {/* Not a heading: the masthead's h1 above already says the title. */}
        <div className={title.length > 28 ? `${s.title} ${s.long}` : s.title}>{title}</div>
        <div className={s.tag}>{tagline}</div>
        <div className={s.url}>FLAMINGOCOUNTY.COM</div>
      </div>
    </div>
  )
}

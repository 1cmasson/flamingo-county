import type { Lang } from '../i18n'

/**
 * The link page's own words. The buttons, sections and tagline are the
 * `link-page` global's (globals/LinkPage.ts), editable without a deploy.
 */
export type LinksCopy = typeof EN

export function linksCopy(lang: Lang): LinksCopy {
  return lang === 'es' ? ES : EN
}

const EN = {
  title: 'Links',
  description:
    'Everything from Flamingo County in one place: this week’s events, our stories, the spots in Hialeah and Miami Lakes, and how to get listed.',
  tagline: 'The spots your neighbors vouch for',
  empty: 'Nothing here right now. The whole site is one tap away:',
  site: 'Go to the site',
}

const ES: LinksCopy = {
  title: 'Enlaces',
  description:
    'Todo Flamingo County en un solo lugar: los eventos de esta semana, nuestras historias, los lugares de Hialeah y Miami Lakes, y cómo salir en el directorio.',
  tagline: 'Los lugares que tus vecinos respaldan',
  empty: 'Ahora mismo no hay nada aquí. El sitio está a un toque:',
  site: 'Ir al sitio',
}

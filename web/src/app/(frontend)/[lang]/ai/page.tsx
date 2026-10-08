import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { absUrl, openGraph } from '../../../../lib/site'
import { breadcrumbJsonLd, webPageJsonLd } from '../../../../lib/jsonld'
import { RATE_LIMIT } from '../../../../lib/civicApiHttp'
import { PageShell } from '../../../../components/PageShell'
import { JsonLd } from '../../../../components/JsonLd'
import { Breadcrumbs, type Crumb } from '../../../../components/Breadcrumbs'
import v from '../../../../components/vote.module.css'
import s from '../../../../components/civic.module.css'

type Props = { params: Promise<{ lang: string }> }

/**
 * How AI assistants connect to the civic answers: the MCP server at /mcp and
 * the same tools as a JSON API with an OpenAPI document. Indexable, so people
 * (and agents) can find it.
 */

const MCP = absUrl('/mcp')
const OPENAPI = absUrl('/api/civic/v1/openapi.json')

const COPY = {
  es: {
    title: 'Flamingo County para asistentes de IA',
    metaDescription:
      'Conecta Claude, ChatGPT u otro asistente a los datos públicos de Miami-Dade: días de basura, zonas de inundación y evacuación, quién te representa y dónde votar. Servidor MCP y API con OpenAPI, de solo lectura y sin cuenta.',
    kicker: 'PARA ASISTENTES DE IA',
    lead:
      'Los asistentes que usan herramientas pueden preguntarle a Flamingo County directamente sobre cualquier dirección de Miami-Dade. Cada respuesta trae sus fuentes (el condado, las ciudades, FEMA, el Supervisor de Elecciones) y la fecha de los datos, para que el asistente las cite.',
    tools: 'LAS HERRAMIENTAS',
    toolRows: [
      ['find_address', 'Busca una dirección de Miami-Dade y devuelve su «slug».'],
      ['address_report', 'Días de basura, reciclaje y basura grande con las próximas fechas, zona de inundación de FEMA, zona de evacuación, comisionado del condado, distritos estatales, lugar de votación del día de las elecciones, escuelas y lugares cercanos.'],
      ['polling_places', 'Lugares de votación del día de las elecciones por ciudad o precinto, de la lista del Supervisor de Elecciones.'],
      ['evacuation_zone_summary', 'Zonas de evacuación por marejada A–E, para el condado o una ciudad.'],
      ['trash_schedule', 'Quién maneja la recogida de basura en una ciudad y sus zonas, donde los registros las tienen.'],
    ],
    claude: 'CLAUDE',
    claudeSteps: [
      'En Claude, abre Configuración → Conectores → «Agregar conector personalizado».',
      'Nombre: Flamingo County. URL:',
      'No hace falta autenticación. Actívalo en la conversación y pregunta, por ejemplo: «¿qué día recogen la basura grande en 5410 W 6th Ln, Hialeah?».',
    ],
    chatgpt: 'CHATGPT (GPT CON ACCIONES)',
    chatgptSteps: [
      'Crea un GPT → Configurar → Acciones → «Crear nueva acción» → Importar desde URL:',
      'Autenticación: ninguna. Política de privacidad:',
      'Si tu cliente acepta servidores MCP remotos, usa la URL del servidor MCP de arriba.',
    ],
    other: 'OTROS CLIENTES',
    otherText: 'Servidor MCP (Streamable HTTP, sin sesión, sin autenticación) y API JSON de solo lectura:',
    example: 'Ejemplo',
    rules: 'REGLAS',
    ruleItems: [
      'Solo lectura. Las respuestas dicen lo mismo que la página de direcciones, ni más ni menos.',
      'Nosotros no guardamos ni registramos lo que preguntas: ni direcciones ni ubicación. Sin cookies, sin cuentas. Como en todo el sitio, Railway y Cloudflare, que lo alojan y protegen, manejan datos técnicos de cada solicitud; en la API JSON la dirección va en la URL, así que si eso te importa, usa el servidor MCP, que la recibe en el cuerpo de la solicitud.',
      'No acepta coordenadas: no sirve para ubicar a una persona.',
      `Hasta ${RATE_LIMIT} consultas por minuto por herramienta; si te pasas, responde 429 con Retry-After.`,
      'Mientras se actualizan los datos del condado, responde 503 con Retry-After.',
      'Sin precios, sin dueños, sin valores de propiedad.',
    ],
    tryPage: 'Prefieres buscarlo tú: escribe tu dirección',
  },
  en: {
    title: 'Flamingo County for AI assistants',
    metaDescription:
      'Connect Claude, ChatGPT or another assistant to Miami-Dade’s public records: trash days, flood and evacuation zones, who represents you and where to vote. An MCP server and an OpenAPI JSON API, read-only, no account.',
    kicker: 'FOR AI ASSISTANTS',
    lead:
      'Assistants that call tools can ask Flamingo County directly about any Miami-Dade address. Every answer carries its sources (the county, the cities, FEMA, the Supervisor of Elections) and the date of the data, so the assistant can cite them.',
    tools: 'THE TOOLS',
    toolRows: [
      ['find_address', 'Finds a Miami-Dade address and returns its slug.'],
      ['address_report', 'Garbage, recycling and bulk days with the next dates, FEMA flood zone, evacuation zone, county commissioner, state districts, Election Day polling place, schools and nearby places.'],
      ['polling_places', 'Election Day polling places by city or precinct, from the Supervisor of Elections’ list.'],
      ['evacuation_zone_summary', 'Storm-surge evacuation zones A–E, for the county or one city.'],
      ['trash_schedule', 'Who handles trash pickup in a city, and its zones where the records hold them.'],
    ],
    claude: 'CLAUDE',
    claudeSteps: [
      'In Claude, open Settings → Connectors → "Add custom connector".',
      'Name: Flamingo County. URL:',
      'No authentication. Turn it on in a chat and ask, for example: "What day is bulk trash pickup at 5410 W 6th Ln, Hialeah?"',
    ],
    chatgpt: 'CHATGPT (GPT ACTIONS)',
    chatgptSteps: [
      'Create a GPT → Configure → Actions → "Create new action" → Import from URL:',
      'Authentication: none. Privacy policy:',
      'If your client takes remote MCP servers, use the MCP server URL above.',
    ],
    other: 'OTHER CLIENTS',
    otherText: 'MCP server (Streamable HTTP, sessionless, no auth) and read-only JSON API:',
    example: 'Example',
    rules: 'RULES',
    ruleItems: [
      'Read-only. Answers say what the address page says, no more and no less.',
      'We don’t store or log what you ask: no addresses, no location. No cookies, no accounts. As on the whole site, Railway and Cloudflare, which host and protect it, handle technical request data; on the JSON API the address travels in the URL, so if that matters to you, use the MCP server, which takes it in the request body.',
      'No coordinates in: it can’t be used to locate a person.',
      `Up to ${RATE_LIMIT} requests a minute per tool; past that it answers 429 with Retry-After.`,
      'While the county data is being updated it answers 503 with Retry-After.',
      'No prices, no owners, no property values.',
    ],
    tryPage: 'Rather look it up yourself? Type your address',
  },
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = COPY[lang]
  return {
    title: c.title,
    description: c.metaDescription,
    openGraph: openGraph(lang, { title: c.title, description: c.metaDescription, url: routes.ai(lang) }),
    alternates: { canonical: routes.ai(lang), languages: { en: routes.ai('en'), es: routes.ai('es') } },
  }
}

function Url({ href }: { href: string }) {
  return (
    <code style={{ display: 'block', wordBreak: 'break-all', background: 'var(--cream)', border: '3px solid var(--ink)', padding: '8px 10px', fontWeight: 800, fontSize: 14 }}>
      {href}
    </code>
  )
}

export default async function AiPage({ params }: Props) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const c = COPY[lang as Lang]
  const path = routes.ai(lang)
  const crumbs: Crumb[] = [
    { name: 'Flamingo County', path: routes.home(lang) },
    { name: c.title, path },
  ]
  const example = absUrl(`/api/civic/v1/evacuation-zones?city=hialeah&lang=${lang}`)
  return (
    <PageShell>
      <JsonLd data={[webPageJsonLd(lang, path, { name: c.title }), breadcrumbJsonLd(crumbs)]} />
      <main className={v.main}>
        <Breadcrumbs items={crumbs} label={lang === 'es' ? 'Ruta de navegación' : 'Breadcrumb'} />
        <header className={v.hero}>
          <span className={v.kicker}>{c.kicker}</span>
          <h1 className={v.title}>{c.title}</h1>
          <p className={v.sub} style={{ color: 'var(--cream)' }}>
            {c.lead}
          </p>
        </header>

        <section className={v.card} aria-labelledby="tools">
          <h2 id="tools" className={v.cardTag}>
            {c.tools}
          </h2>
          <table className={s.data}>
            <tbody>
              {c.toolRows.map(([name, text]) => (
                <tr key={name}>
                  <th scope="row">
                    <code>{name}</code>
                  </th>
                  <td>{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={v.card} aria-labelledby="claude">
          <h2 id="claude" className={v.cardTag}>
            {c.claude}
          </h2>
          <ol className={s.facts}>
            <li>{c.claudeSteps[0]}</li>
            <li>
              {c.claudeSteps[1]} <Url href={MCP} />
            </li>
            <li>{c.claudeSteps[2]}</li>
          </ol>
        </section>

        <section className={v.card} aria-labelledby="chatgpt">
          <h2 id="chatgpt" className={v.cardTag}>
            {c.chatgpt}
          </h2>
          <ol className={s.facts}>
            <li>
              {c.chatgptSteps[0]} <Url href={OPENAPI} />
            </li>
            <li>
              {c.chatgptSteps[1]} <Url href={absUrl(routes.privacy(lang))} />
            </li>
            <li>{c.chatgptSteps[2]}</li>
          </ol>
        </section>

        <section className={v.card} aria-labelledby="other">
          <h2 id="other" className={v.cardTag}>
            {c.other}
          </h2>
          <p className={v.note}>{c.otherText}</p>
          <Url href={MCP} />
          <Url href={OPENAPI} />
          <p className={v.note}>
            {c.example}:{' '}
            <a href={example} rel="nofollow" style={{ fontWeight: 800, color: 'var(--ink)', wordBreak: 'break-all' }}>
              {example}
            </a>
          </p>
        </section>

        <section className={v.card} aria-labelledby="rules">
          <h2 id="rules" className={v.cardTag} style={{ background: 'var(--pink)', color: 'var(--cream)' }}>
            {c.rules}
          </h2>
          <ul className={s.facts}>
            {c.ruleItems.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <Link href={`${routes.address(lang)}#search`} style={{ fontWeight: 800, color: 'var(--ink)' }}>
            {c.tryPage} →
          </Link>
        </section>
      </main>
    </PageShell>
  )
}

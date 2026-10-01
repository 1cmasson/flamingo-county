import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { PageShell } from '../../../../components/PageShell'

/**
 * The privacy policy. Google's OAuth consent screen links here, and it is
 * required before member sign-in (MEMBERS.md) can leave testing mode.
 *
 * Kept in code rather than the CMS on purpose: every claim here describes how
 * the code behaves — what the forms store, what Better Auth keeps, which
 * cookies exist — so it should change in the same commit as that behaviour.
 * If you add a form, a cookie, an analytics script or a new provider, update
 * this page and bump UPDATED.
 */
const UPDATED = { en: '28 September 2026', es: '28 de septiembre de 2026' }
const CONTACT = 'hola@flamingocounty.com'

type Section = { h: string; p: (string | { list: string[] })[] }

const COPY: Record<Lang, { title: string; intro: string; sections: Section[] }> = {
  en: {
    title: 'PRIVACY',
    intro:
      'Flamingo County is a directory of local spots and events in Hialeah, Miami Lakes and Little Havana. This page explains what we collect, why, and what you can do about it. The short version: we collect very little, we don’t sell it, and there are no ads or tracking scripts.',
    sections: [
      {
        h: 'Browsing without an account',
        p: [
          'You can browse the whole site — every listing, event and story — without signing in or giving us anything.',
          'Your language choice is kept in your own browser, in a cookie set only if you use the EN/ES switch. It stays on your device.',
          'Like any website, our hosting and network providers — Railway, which runs the site, and Cloudflare, which sits in front of it — handle technical information such as your IP address and browser type in order to deliver pages and protect the site from abuse. We do not use analytics, advertising or social-media tracking scripts.',
        ],
      },
      {
        h: 'Signing in with Google',
        p: [
          'Saving events to My Week, saying you’re going, and downloading calendar files need you to sign in — with Google, or with an emailed code (below). That’s what lets your week follow you between devices. When you sign in with Google, Google shares with us only the basics you approve on its screen:',
          { list: ['your name', 'your email address', 'your profile photo link', 'an ID that identifies your Google account to us'] },
          'We then store, for your account:',
          {
            list: [
              'the events in your My Week and the ones you marked as going, and the language you last used',
              'your active sign-in sessions, including the IP address and browser they started from, to keep you signed in and to spot misuse',
              'the sign-in tokens Google issues, kept encrypted. We never use them to read or change anything in your Google account',
            ],
          },
          'While you’re signed in, your browser also keeps a copy of your saved week so the buttons respond instantly. Signing out clears it.',
          'We don’t access your contacts, Gmail, Drive or anything else in your Google account. Our use of information received from Google follows the Google API Services User Data Policy, including its Limited Use requirements.',
        ],
      },
      {
        h: 'Signing in with an emailed code',
        p: [
          'Inside apps like Instagram, Facebook and TikTok, where Google doesn’t allow sign-in, you can sign in with a 6-digit code we email you instead. For that we use your email address — to send the code, and as your account. If it’s the same address you use with Google, it’s the same account.',
          'The code is sent through Resend, an email delivery service, which handles your address and the message only to deliver it. We keep only a scrambled (hashed) copy of the code, and it stops working after 10 minutes or once used.',
          'Everything else — your saved week, sessions, and deleting your account — works exactly as described above.',
        ],
      },
      {
        h: 'Forms you send us',
        p: [
          'Newsletter: your email address and the language you signed up in, so we can send it to you.',
          'List your spot: the business name, your name, phone number and email, the city and category, and anything you tell us about the place — so we can review it and get back to you.',
        ],
      },
      {
        h: 'Cookies',
        p: [
          'We only use cookies the site needs to work:',
          {
            list: [
              'a language cookie, set only when you use the EN/ES switch',
              'sign-in cookies, only if you sign in — they keep you signed in and protect the sign-in step',
            ],
          },
          'No advertising or analytics cookies.',
        ],
      },
      {
        h: 'How we use it — and don’t',
        p: [
          'We use this information only to run the site: to show your saved week, keep you signed in, send the newsletter you asked for, handle listing requests, and keep the site secure.',
          'We don’t sell your information, rent it, use it for advertising, or share it with anyone except the service providers that run the site for us (Railway and Cloudflare, Google for sign-in, and Resend for sign-in codes), or when the law requires it.',
        ],
      },
      {
        h: 'How long we keep it',
        p: [
          'Your account and saved week: until you delete your account. Sign-in sessions expire after 7 days, extended while you keep using the site.',
          'Newsletter sign-ups: until you ask us to remove you. Listing requests: for as long as we need them to review and maintain the listing.',
          'Deleted information may stay in backup copies for a short time before they are replaced.',
        ],
      },
      {
        h: 'Your choices',
        p: [
          'Delete your account at any time from My Week — that removes your account and your saved week. Signing out clears your saved week from that device.',
          `For anything else — a copy of what we hold about you, a correction, removal from the newsletter, or deleting a listing request — email ${CONTACT}. We’ll answer within 30 days.`,
        ],
      },
      {
        h: 'Security',
        p: [
          'The site is served only over HTTPS, sign-in tokens are stored encrypted, and only the people who run Flamingo County can see member and form data.',
        ],
      },
      {
        h: 'Children',
        p: [
          'Flamingo County is not directed at children under 13, and we don’t knowingly collect information from them. If you believe a child has given us information, email us and we’ll delete it.',
        ],
      },
      {
        h: 'Changes',
        p: [
          'If we change how we handle your information, we’ll update this page and the date at the top. If the change is significant, we’ll say so on the site.',
        ],
      },
    ],
  },
  es: {
    title: 'PRIVACIDAD',
    intro:
      'Flamingo County es un directorio de lugares y eventos del barrio en Hialeah, Miami Lakes y la Pequeña Habana. Esta página explica qué recopilamos, para qué, y qué puedes hacer al respecto. En pocas palabras: recopilamos muy poco, no lo vendemos, y no hay anuncios ni scripts de rastreo.',
    sections: [
      {
        h: 'Si navegas sin cuenta',
        p: [
          'Puedes recorrer todo el sitio — cada negocio, evento e historia — sin iniciar sesión y sin darnos ningún dato.',
          'Tu idioma se guarda en tu propio navegador, en una cookie que solo se crea si usas el botón EN/ES. Se queda en tu dispositivo.',
          'Como cualquier sitio web, nuestros proveedores de alojamiento y red — Railway, que hace funcionar el sitio, y Cloudflare, que está delante — manejan información técnica como tu dirección IP y tu tipo de navegador para entregar las páginas y proteger el sitio contra abusos. No usamos scripts de analítica, publicidad ni rastreo de redes sociales.',
        ],
      },
      {
        h: 'Si inicias sesión con Google',
        p: [
          'Para guardar eventos en Mi Semana, decir que vas y descargar archivos de calendario hay que iniciar sesión — con Google o con un código por correo (más abajo). Así tu semana te sigue de un dispositivo a otro. Al iniciar sesión con Google, Google solo nos comparte lo básico que apruebas en su pantalla:',
          { list: ['tu nombre', 'tu correo electrónico', 'el enlace a tu foto de perfil', 'un identificador de tu cuenta de Google'] },
          'Luego guardamos, para tu cuenta:',
          {
            list: [
              'los eventos de tu Mi Semana y los que marcaste como que vas, y el último idioma que usaste',
              'tus sesiones abiertas, incluida la dirección IP y el navegador desde donde empezaron, para mantenerte conectado y detectar abusos',
              'los tokens de inicio de sesión que emite Google, guardados cifrados. Nunca los usamos para leer ni cambiar nada en tu cuenta de Google',
            ],
          },
          'Mientras tengas la sesión abierta, tu navegador también guarda una copia de tu semana para que los botones respondan al instante. Al cerrar sesión se borra.',
          'No accedemos a tus contactos, Gmail, Drive ni a nada más de tu cuenta de Google. El uso que hacemos de la información recibida de Google cumple con la Política de Datos de Usuario de los Servicios de API de Google, incluidos sus requisitos de Uso Limitado.',
        ],
      },
      {
        h: 'Si entras con un código por correo',
        p: [
          'Dentro de apps como Instagram, Facebook y TikTok, donde Google no deja iniciar sesión, puedes entrar con un código de 6 dígitos que te mandamos por correo. Para eso usamos tu correo electrónico — para enviarte el código y como tu cuenta. Si es el mismo correo que usas con Google, es la misma cuenta.',
          'El código se envía a través de Resend, un servicio de envío de correo, que maneja tu dirección y el mensaje solo para entregarlo. Solo guardamos una copia cifrada (hash) del código, y deja de funcionar a los 10 minutos o en cuanto se usa.',
          'Todo lo demás — tu semana guardada, las sesiones y borrar tu cuenta — funciona exactamente como se explica arriba.',
        ],
      },
      {
        h: 'Formularios que nos envías',
        p: [
          'Boletín: tu correo electrónico y el idioma en que te suscribiste, para poder enviártelo.',
          'Pon tu negocio: el nombre del negocio, tu nombre, teléfono y correo, la ciudad y la categoría, y lo que nos cuentes del lugar — para revisarlo y responderte.',
        ],
      },
      {
        h: 'Cookies',
        p: [
          'Solo usamos las cookies que el sitio necesita para funcionar:',
          {
            list: [
              'una cookie de idioma, solo cuando usas el botón EN/ES',
              'cookies de inicio de sesión, solo si inicias sesión — te mantienen conectado y protegen el paso de inicio de sesión',
            ],
          },
          'Nada de cookies de publicidad ni de analítica.',
        ],
      },
      {
        h: 'Para qué lo usamos — y para qué no',
        p: [
          'Usamos esta información solo para hacer funcionar el sitio: mostrar tu semana guardada, mantenerte conectado, enviarte el boletín que pediste, atender las solicitudes de listado y mantener el sitio seguro.',
          'No vendemos tu información, no la alquilamos, no la usamos para publicidad, y no la compartimos con nadie salvo los proveedores que hacen funcionar el sitio (Railway y Cloudflare, Google para el inicio de sesión y Resend para los códigos de acceso), o cuando la ley lo exige.',
        ],
      },
      {
        h: 'Cuánto tiempo lo guardamos',
        p: [
          'Tu cuenta y tu semana guardada: hasta que borres tu cuenta. Las sesiones vencen a los 7 días, y se extienden mientras sigas usando el sitio.',
          'Suscripciones al boletín: hasta que nos pidas que te quitemos. Solicitudes de listado: mientras las necesitemos para revisar y mantener el listado.',
          'La información borrada puede quedar un tiempo corto en copias de seguridad antes de que se reemplacen.',
        ],
      },
      {
        h: 'Lo que puedes hacer',
        p: [
          'Borra tu cuenta cuando quieras desde Mi Semana — eso elimina tu cuenta y tu semana guardada. Cerrar sesión borra tu semana guardada de ese dispositivo.',
          `Para cualquier otra cosa — una copia de lo que tenemos sobre ti, una corrección, salir del boletín o borrar una solicitud de listado — escribe a ${CONTACT}. Te respondemos en un máximo de 30 días.`,
        ],
      },
      {
        h: 'Seguridad',
        p: [
          'El sitio solo funciona por HTTPS, los tokens de inicio de sesión se guardan cifrados, y solo las personas que llevan Flamingo County pueden ver los datos de socios y formularios.',
        ],
      },
      {
        h: 'Menores',
        p: [
          'Flamingo County no está dirigido a menores de 13 años, y no recopilamos a sabiendas información de ellos. Si crees que un menor nos dio información, escríbenos y la borramos.',
        ],
      },
      {
        h: 'Cambios',
        p: [
          'Si cambiamos cómo manejamos tu información, actualizaremos esta página y la fecha de arriba. Si el cambio es importante, lo avisaremos en el sitio.',
        ],
      },
    ],
  },
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  return {
    title: lang === 'es' ? 'Privacidad' : 'Privacy',
    alternates: {
      canonical: routes.privacy(lang),
      languages: { en: routes.privacy('en'), es: routes.privacy('es') },
    },
  }
}

/** Wraps the contact address in a mailto link wherever it appears. */
function withMail(text: string) {
  const parts = text.split(CONTACT)
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <a key={i} href={`mailto:${CONTACT}`} style={{ color: 'inherit', fontWeight: 800 }}>
            {CONTACT}
          </a>,
          part,
        ],
  )
}

export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)
  const c = COPY[lang as Lang]
  const es = lang === 'es'

  const body: React.CSSProperties = {
    margin: 0,
    fontSize: 'clamp(15px,3.6vw,16px)',
    fontWeight: 600,
    lineHeight: 1.6,
    maxWidth: '68ch',
    textWrap: 'pretty',
  }

  return (
    <PageShell>
      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: 'clamp(16px,4vw,26px) clamp(12px,3.5vw,22px) 70px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(18px,3vw,24px)',
        }}
      >
        <header
          style={{
            background: 'var(--ink)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--cream)',
            padding: 'clamp(18px,4vw,32px)',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              background: 'var(--yellow)',
              color: 'var(--ink)',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '2px',
              padding: '6px 10px',
            }}
          >
            {es ? `ACTUALIZADO EL ${UPDATED.es.toUpperCase()}` : `UPDATED ${UPDATED.en.toUpperCase()}`}
          </div>
          <h1
            style={{
              margin: '12px 0 0',
              fontFamily: 'var(--display)',
              fontSize: 'clamp(32px,8vw,64px)',
              lineHeight: 0.9,
              color: 'var(--cream)',
            }}
          >
            {c.title}
          </h1>
          <p style={{ ...body, margin: '16px 0 0', color: 'var(--cream)', maxWidth: '58ch' }}>{c.intro}</p>
        </header>

        <article
          style={{
            background: 'var(--grad-cream)',
            border: '4px solid var(--ink)',
            boxShadow: '8px 8px 0 var(--ink)',
            padding: 'clamp(20px,4vw,40px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(24px,4vw,34px)',
          }}
        >
          {c.sections.map((section) => (
            <section key={section.h} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--display)',
                  fontSize: 'clamp(20px,4.6vw,26px)',
                  lineHeight: 1.05,
                }}
              >
                {section.h}
              </h2>
              {section.p.map((block, i) =>
                typeof block === 'string' ? (
                  <p key={i} style={body}>
                    {withMail(block)}
                  </p>
                ) : (
                  <ul key={i} style={{ ...body, paddingLeft: '1.2em', display: 'grid', gap: 4 }}>
                    {block.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}

          <p style={{ ...body, borderTop: '3px dotted var(--ink)', paddingTop: 18 }}>
            {es ? 'Preguntas: ' : 'Questions: '}
            {withMail(CONTACT)}
            {' · '}
            <Link href={routes.myWeek(lang as Lang)} style={{ color: 'inherit', fontWeight: 800 }}>
              {t('MY WEEK')}
            </Link>
          </p>
        </article>
      </main>
    </PageShell>
  )
}

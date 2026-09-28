import type { Lang } from '../i18n'
import type { WebviewCopy } from '../components/WebviewPrompt'

/**
 * The "open this in Safari / Chrome" copy, shared by My Week's account panel
 * and the sign-in gate on the event buttons so the two never drift apart.
 */
export function webviewCopy(lang: Lang): WebviewCopy & { close: string } {
  return lang === 'es'
    ? {
        webviewH: 'ÁBRELO EN {browser} PARA ENTRAR.',
        webviewP:
          'Para guardar eventos, decir que vas o añadirlos al calendario hay que entrar con Google, y Google no deja iniciar sesión dentro del navegador de {app}. Abre esta página en {browser} y entra desde ahí.',
        webviewPUnknown:
          'Para guardar eventos, decir que vas o añadirlos al calendario hay que entrar con Google, y Google no deja iniciar sesión dentro del navegador de esta app. Abre esta página en {browser} y entra desde ahí.',
        openChrome: 'ABRIR EN CHROME',
        copyLink: 'COPIAR ENLACE',
        copied: '¡COPIADO!',
        hintIos: 'O toca ⋯ o el ícono de compartir y elige «Abrir en Safari».',
        hintAndroid: 'O toca ⋮ y elige «Abrir en Chrome».',
        close: 'CERRAR',
      }
    : {
        webviewH: 'OPEN THIS IN {browser} TO SIGN IN.',
        webviewP:
          'Saving events, saying you’re going and adding them to your calendar need a Google sign-in, and Google doesn’t allow signing in inside {app}’s browser. Open this page in {browser} and sign in there.',
        webviewPUnknown:
          'Saving events, saying you’re going and adding them to your calendar need a Google sign-in, and Google doesn’t allow signing in inside this app’s browser. Open this page in {browser} and sign in there.',
        openChrome: 'OPEN IN CHROME',
        copyLink: 'COPY LINK',
        copied: 'COPIED!',
        hintIos: 'Or tap ⋯ or the share icon and choose “Open in Safari”.',
        hintAndroid: 'Or tap ⋮ and choose “Open in Chrome”.',
        close: 'CLOSE',
      }
}

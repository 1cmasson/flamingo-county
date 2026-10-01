import type { Lang } from '../i18n'
import type { EmailCodeCopy } from '../components/EmailCodeSignIn'
import type { WebviewCopy } from '../components/WebviewPrompt'

/** The emailed-code form's copy, shared by every place it appears. */
export function emailCodeCopy(lang: Lang): EmailCodeCopy {
  return lang === 'es'
    ? {
        emailLabel: 'TU CORREO',
        sendCode: 'ENVIARME UN CÓDIGO',
        sentTo: 'Te mandamos un código de 6 dígitos a {email}. Puede tardar un minuto; mira también en spam.',
        codeLabel: 'CÓDIGO',
        verify: 'ENTRAR',
        resend: 'Enviarlo otra vez',
        resent: 'Listo, te mandamos un código nuevo.',
        changeEmail: 'Usar otro correo',
        badEmail: 'Ese correo no parece válido.',
        badCode: 'Ese código no es correcto. Revísalo o pide uno nuevo.',
        expiredCode: 'Ese código caducó. Pide uno nuevo.',
        tooMany: 'Demasiados intentos. Espera un minuto y vuelve a probar.',
        sendFailed: 'No se pudo enviar el código. Inténtalo de nuevo.',
      }
    : {
        emailLabel: 'YOUR EMAIL',
        sendCode: 'EMAIL ME A CODE',
        sentTo: 'We sent a 6-digit code to {email}. It can take a minute — check spam too.',
        codeLabel: 'CODE',
        verify: 'SIGN IN',
        resend: 'Send it again',
        resent: 'Done — we sent a new code.',
        changeEmail: 'Use a different email',
        badEmail: 'That email doesn’t look right.',
        badCode: 'That code isn’t right. Check it or ask for a new one.',
        expiredCode: 'That code has expired. Ask for a new one.',
        tooMany: 'Too many tries. Wait a minute and try again.',
        sendFailed: 'Couldn’t send the code. Try again.',
      }
}

/**
 * The in-app-browser sign-in copy — emailed code first, "open this in Safari /
 * Chrome" second — shared by My Week's account panel and the sign-in gate on
 * the event buttons so the two never drift apart.
 */
export function webviewCopy(lang: Lang): WebviewCopy & { close: string } {
  return lang === 'es'
    ? {
        ...emailCodeCopy(lang),
        webviewH: 'ENTRA CON TU CORREO.',
        webviewP:
          'Google no deja iniciar sesión dentro del navegador de {app}, así que te mandamos un código por correo. Si ya entraste antes con Google, usa ese mismo correo y recuperas tu cuenta.',
        webviewPUnknown:
          'Google no deja iniciar sesión dentro del navegador de esta app, así que te mandamos un código por correo. Si ya entraste antes con Google, usa ese mismo correo y recuperas tu cuenta.',
        orBrowser: 'O abre esta página en {browser} para entrar con Google.',
        openChrome: 'ABRIR EN CHROME',
        copyLink: 'COPIAR ENLACE',
        copied: '¡COPIADO!',
        hintIos: 'Toca ⋯ o el ícono de compartir y elige «Abrir en Safari».',
        hintAndroid: 'O toca ⋮ y elige «Abrir en Chrome».',
        close: 'CERRAR',
      }
    : {
        ...emailCodeCopy(lang),
        webviewH: 'SIGN IN WITH YOUR EMAIL.',
        webviewP:
          'Google doesn’t allow signing in inside {app}’s browser, so we’ll email you a code instead. If you’ve signed in with Google before, use that same email and you’ll get your account back.',
        webviewPUnknown:
          'Google doesn’t allow signing in inside this app’s browser, so we’ll email you a code instead. If you’ve signed in with Google before, use that same email and you’ll get your account back.',
        orBrowser: 'Or open this page in {browser} to sign in with Google.',
        openChrome: 'OPEN IN CHROME',
        copyLink: 'COPY LINK',
        copied: 'COPIED!',
        hintIos: 'Tap ⋯ or the share icon and choose “Open in Safari”.',
        hintAndroid: 'Or tap ⋮ and choose “Open in Chrome”.',
        close: 'CLOSE',
      }
}

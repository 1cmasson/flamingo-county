import { describe, expect, it } from 'vitest'
import { chromeIntent, detectWebview } from '@/lib/webview'

/**
 * One case per in-app browser Google refuses to sign in from, plus the real
 * browsers that must NOT be flagged — a false positive hides the Google button
 * from someone who could have used it.
 */
const UA = {
  instagramIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 614425426)',
  instagramAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 Instagram 342.0.0.33.103 Android',
  facebookIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/475.0.0.37.109;FBBV/635071043;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/80]',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918U Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/475.0.0.46.109;]',
  tiktokIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.8.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US',
  lineIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0',
  snapchatIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.0.0.40 (like Safari/8617.2.4.10.8, panda)',
  genericAndroidWebview:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36',

  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/127.0.6533.107 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
  samsungInternet:
    'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  chromeDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  iosHomeScreenApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
}

describe('detectWebview', () => {
  it.each([
    ['instagramIos', 'Instagram', 'ios'],
    ['instagramAndroid', 'Instagram', 'android'],
    ['facebookIos', 'Facebook', 'ios'],
    ['facebookAndroid', 'Facebook', 'android'],
    ['tiktokIos', 'TikTok', 'ios'],
    ['lineIos', 'LINE', 'ios'],
    ['snapchatIos', 'Snapchat', 'ios'],
    ['genericAndroidWebview', '', 'android'],
  ] as const)('flags %s', (key, app, os) => {
    expect(detectWebview(UA[key])).toEqual({ app, os })
  })

  it.each([
    'safariIos',
    'chromeIos',
    'chromeAndroid',
    'samsungInternet',
    'chromeDesktop',
    'iosHomeScreenApp',
  ] as const)('leaves %s alone', (key) => {
    expect(detectWebview(UA[key])).toBeNull()
  })

  it('handles a missing header', () => {
    expect(detectWebview(null)).toBeNull()
    expect(detectWebview('')).toBeNull()
  })
})

describe('chromeIntent', () => {
  it('keeps host, path and query and names Chrome', () => {
    expect(chromeIntent('https://flamingocounty.com/es/my-week?x=1')).toBe(
      'intent://flamingocounty.com/es/my-week?x=1#Intent;scheme=https;package=com.android.chrome;end',
    )
  })
})

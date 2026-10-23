import { BrowserCacheLocation, type Configuration } from '@azure/msal-browser';

export function msalConfig(origin: string, basePath: string): Configuration {
  return {
    auth: {
      clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID || '294bcae4-d5c3-44e2-9e06-06cc230a9bfd',
      authority: process.env.NEXT_PUBLIC_MSAL_AUTHORITY || 'https://login.microsoftonline.com/44467e6f-462c-4ea2-823f-7800de5434e3',
      redirectUri: process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI || `${origin}${basePath}/auth/callback`,
      postLogoutRedirectUri: `${origin}${basePath}/sign-in`,
    },
    // MSAL shares its encrypted account/token cache across same-origin tabs.
    // Redirect transaction state stays in MSAL's default tab-specific storage.
    cache: { cacheLocation: BrowserCacheLocation.LocalStorage },
  };
}

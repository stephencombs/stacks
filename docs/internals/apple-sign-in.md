# Sign in with Apple

iOS offers the native Apple sheet beside Clerk's hosted pages (`AppleSignInButton`). Android keeps
the hosted pages, which show Apple too once the web steps below are done. Both end in the same
Clerk user.

## Setup the code can't show

Do this in each Clerk instance a build uses, and for each bundle ID (`app.config.ts`: `.dev`,
`.preview` and the production ID):

- Apple Developer: turn on the Sign in with Apple capability for the App ID.
- Clerk: register each bundle ID as a native application, and turn on Apple SSO for sign-up and
  sign-in.
- Hosted pages and Android: add a Services ID tied to the primary App ID, with Clerk's return URL,
  and a Private Email Relay email source.
- Clerk: make first and last name optional. Apple sends a name only on the first authorization, and
  the person can withhold it.

A build only shows the button once its native app is registered in the Clerk instance it points at.
The EAS `production` profile still points at a Clerk test instance.

## Traps

- Clerk's `useSignInWithApple` resolves with no session both when the person cancels and when
  sign-up needs more fields. Only `signUp.status === "missing_requirements"` is an error.
- Sign-out stays on Clerk's `signOut()`. Apple has no app-side sign-out to call.
- Hide My Email makes a different email, so Clerk doesn't link it to an existing email or Google
  user. The API keys users by Clerk subject, so that person gets a new, empty account. Nothing
  merges them; they sign back in with the original method.
- The button isn't tested in Maestro: the simulator can't finish Apple's sheet without a person.

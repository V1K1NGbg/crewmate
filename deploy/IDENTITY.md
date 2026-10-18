# Owner identity and application bootstrap

Authelia 4.39.28 owns one file-backed user. All application routes pass its
`/api/authz/forward-auth` check; an existing downstream application session alone
is insufficient. Authelia's own portal/OIDC endpoints are not forward-auth gated
(doing that would create a login loop). Application backends have no published
ports and do not share one broad ingress network. Only Caddy reaches the private
Authelia network. OIDC clients resolve the issuer hostname to Caddy via narrowly
scoped Docker network aliases, preserving the **same HTTPS issuer** in browser
and backend. No alias exposes the identity backend directly.

## Configure identity secrets

Generate separate random client IDs/secrets for each client; retain plaintext
client secrets only in the relevant application's protected configuration and
hashed secrets in Authelia. Use its pinned CLI (no passwords in command history):

```sh
docker run --rm -it authelia/authelia:4.39.28@sha256:bd97cff4fcbf715b5ff1f9ae286afbe6033afce385302520b0368122d43a6f54 \
  authelia crypto hash generate argon2
docker run --rm -it authelia/authelia:4.39.28@sha256:bd97cff4fcbf715b5ff1f9ae286afbe6033afce385302520b0368122d43a6f54 \
  authelia crypto hash generate pbkdf2 --variant sha512
sudo sh -c 'umask 077; openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out /etc/crewmate/oidc.pem'
```

Use the argon2 digest for `OWNER_PASSWORD_HASH`; pbkdf2 digests for the three
`*_OIDC_SECRET_HASH` values. The actual Crewmate plaintext client secret is
`AUTH_OIDC_CLIENT_SECRET`. Store the Portainer/Immich plaintext secrets securely
for their admin settings; they are not environment variables on unrelated apps.
Generate separate 32+-character random `AUTH_SECRET`, Authelia session/storage/
OIDC HMAC secrets, and database password. Never reuse the owner's password.
See [Authelia's secret guide](https://www.authelia.com/integration/openid-connect/frequently-asked-questions/#how-do-i-generate-a-client-identifier-or-client-secret).

`configure.py render --bootstrap` permits the owner OIDC subject to remain absent
only while bootstrapping **Authelia and Caddy**, never while opening Crewmate.
Initialize the identity database, then use the supported identifier commands:

```sh
# Substitute the configured owner username, not the illustrative word OWNER.
sudo docker compose --env-file /etc/crewmate/deployment.env -f deploy/access/compose.yml \
  exec authelia authelia storage user identifiers generate --users OWNER --services openid --config /config/configuration.yml
sudo docker compose --env-file /etc/crewmate/deployment.env -f deploy/access/compose.yml \
  exec authelia authelia storage user identifiers export --file /data/identifiers.yml --config /config/configuration.yml
```

Read the export locally; copy the owner's `openid` identifier for the empty/public
sector into `AUTH_OWNER_SUBJECT`. Confirm the actual issued `sub` matches in the
first controlled login without logging tokens. This is an opaque stable subject,
**not** username/email. Preserve the identity database during replacement/restore.
No wildcard owner allowlist or "allow any login once" mode is needed. Run full
`configure.py check`, then recreate only the Crewmate container with the value.
[Identifier commands](https://www.authelia.com/reference/cli/authelia/authelia_storage_user_identifiers/).

## Exact registered clients

| Client | Redirect URI(s), no wildcards | Token endpoint method | Scopes / identity |
|---|---|---|---|
| Crewmate | `https://CREWMATE_HOST/api/auth/callback/local` | `client_secret_basic` | `openid profile email`; exact `sub` allowlist; PKCE S256/state/nonce |
| Portainer CE | `https://PORTAINER_HOST` **no trailing slash** | `client_secret_post` / GUI **In Params** | `openid profile groups email`; `preferred_username`; PKCE not required by this supported integration |
| Immich browser | `https://IMMICH_HOST/auth/login`, `https://IMMICH_HOST/user-settings` | `client_secret_basic` | `openid profile email`; existing owner account linked to subject; PKCE S256 |

All clients use authorization-code flow, confidential secrets, opaque access
tokens and unsigned JSON userinfo. Explicit `consent_mode: implicit` is limited
to these owner-operated clients, so a recurring consent screen does not break
iframe redirects. The default OIDC policy and gateway ACL deny access; an exact
`user:OWNER_USERNAME` rule permits only the file owner. Password change/reset is
disabled (read-only users file), and no registration endpoint is introduced.
The local filesystem notifier does not send email. Initial policy is one factor;
moving to MFA needs enrollment/recovery testing, not an untested toggle.

## Portainer CE

1. Open the **direct private** Portainer origin through Caddy after owner login.
   Complete initial administrator creation promptly (Portainer setup can time
   out; deliberately restart just Portainer if needed). Store that local recovery
   credential outside browser-readable application configuration.
2. Create a Portainer administrator whose username exactly equals Authelia's
   `preferred_username`. Keep automatic provisioning **off**. Do not grant admin
   through uncontrolled email/group matching. The initial recovery account is
   only for emergency local administration, not another identity-provider user.
3. Settings → Authentication → OAuth → Custom:
   - Client ID / secret: the dedicated Portainer pair.
   - Authorization URL: `https://IDENTITY_HOST/api/oidc/authorization`.
   - Access Token URL: `https://IDENTITY_HOST/api/oidc/token`.
   - Resource URL: `https://IDENTITY_HOST/api/oidc/userinfo`.
   - Redirect URL, scopes, identifier and auth style: exactly as above.
   - Use SSO: enabled; logout URL: `https://IDENTITY_HOST/logout`.
4. Verify the OAuth user has the intended local Docker environment, then test
   dashboard embedding. Do not configure Edge-agent ports or duplicate stacks.

`--http-enabled` exposes HTTP **only inside** the private Docker network.
`--no-csp` is necessary for framing, but Caddy reinstates the pinned source's
`script-src`, `object-src`, `frame-src` directives, replaces only `frame-ancestors`
with the exact Crewmate HTTPS origin, and adds base/form restrictions. No
`unsafe-eval`, framing wildcard, or bypassing published backend is supplied.
Console/log/WebSocket/navigation CSP compatibility still requires a browser test.

## Immich

1. Create the initial owner/admin account via the protected private origin.
   Configure OAuth in Administration → Settings with the dedicated client pair,
   the HTTPS Authelia issuer, `openid profile email`, RS256 ID tokens, unsigned
   userinfo, and `client_secret_basic`. Leave `prompt` empty (do not force login).
2. Keep **Auto Register off**. Link the existing owner's account using its
   User Settings OAuth link flow. Confirm no duplicate account was created and
   the owner retains admin. Do not infer admin status from an email alone.
3. Set Auto Launch on after the link succeeds. Set the optional end-session URL
   to `https://IDENTITY_HOST/logout`; this launches the provider logout portal,
   not an unsupported RP-initiated logout endpoint. Verify the actual flow.
4. Disable password login after SSO/recovery proof using the supported admin
   setting or `immich-admin disable-password-login`. Preserve local recovery.
5. Add an external library owned by that account at `/external/pcloud`; use only
   disposable files until the pCloud gate passes. Disable watcher/scheduled scans
   until partial-transfer behavior is proven. Do not configure mobile uploads.

Only browser callbacks are registered. Native Immich mobile apps need their own
documented callback and an access design compatible with gateway cookies; they
are **not** claimed to work through this browser-only gateway. Phone **browser**
SSO is in scope. If Immich adds a conflicting CSP `frame-ancestors` in an update,
multiple CSPs intersect: stop and review, never blindly delete all its headers.

## Logout and honest limits

Crewmate POSTs its Auth.js sign-out then navigates the top-level window to the
supported Authelia **portal `/logout`**. Upstream's SPA routes that URL to SignOut,
which calls its logout API; the server destroys the current Authelia session.
The browser must complete that navigation. Do not call it OIDC global logout.
The proxy checks that session on **every new request**, even with valid Immich or
Portainer cookies/tokens. Both direct origins remain protected after logout.

This does **not** prove all downstream sessions/tokens are invalidated, revoke
other devices' sessions, erase already rendered/downloaded data, or terminate an
already authorized response/WebSocket immediately. Upstream application's browser
token storage must be inspected; no claim that those applications never store
tokens in the browser is made. No backchannel logout exception bypass is added.
The proxy caps upgraded streams at five minutes, but that is **not immediate
logout enforcement** and is not a guarantee for ordinary long responses. Strict
long-lived-session logout acceptance remains **pending**, and must block calling
unified logout complete if the requirement includes immediate stream termination.

Test no-session/expired-session direct URLs, back button/cache, token replay,
iframe refresh, CSRF, active terminal/log/media streams, desktop and phone.
When the IdP needs a fresh login its anti-framing headers may require top-level
navigation; do not weaken IdP framing protection to hide that boundary.

## Sources checked 2026-10-16

- [Authelia Caddy integration](https://www.authelia.com/integration/proxies/caddy/)
- [Authelia Portainer integration, CE and EE](https://www.authelia.com/integration/openid-connect/clients/portainer/) and [Portainer OAuth](https://docs.portainer.io/admin/settings/authentication/oauth)
- [Portainer iframe warning](https://docs.portainer.io/faqs/troubleshooting/ui-and-features/why-doesnt-the-portainer-ui-load-inside-an-iframe), [2.45.2 CSP source](https://github.com/portainer/portainer/blob/2.45.2/api/http/security/bouncer.go)
- [Authelia Immich integration](https://www.authelia.com/integration/openid-connect/clients/immich/) and [Immich OAuth](https://docs.immich.app/administration/oauth)
- [Authelia `/logout` constant](https://github.com/authelia/authelia/blob/v4.39.28/web/src/constants/Routes.ts), [SPA route](https://github.com/authelia/authelia/blob/v4.39.28/web/src/App.tsx), [session destruction](https://github.com/authelia/authelia/blob/v4.39.28/internal/handlers/handler_logout.go)

Integration guides describe methods, not proof for this complete pinned stack.

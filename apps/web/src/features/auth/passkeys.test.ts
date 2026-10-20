import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  webcrypto,
} from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthMiddleware } from "better-auth/api";
import { admin, anonymous, testUtils } from "better-auth/plugins";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  emailLogin: "true",
  rows: {
    user: [] as Record<string, unknown>[],
    session: [] as Record<string, unknown>[],
    account: [] as Record<string, unknown>[],
    verification: [] as Record<string, unknown>[],
    passkey: [] as Record<string, unknown>[],
  },
}));

vi.mock("@/env", () => ({
  env: {
    APP_NAME: "Rshwub Meet",
    get EMAIL_LOGIN_ENABLED() {
      return fixture.emailLogin;
    },
  },
}));
vi.mock("@rallly/utils/absolute-url", () => ({
  absoluteUrl: () => "https://meet.rshwub.com",
}));
vi.mock("@rallly/database", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        fixture.rows.user.find((user) => user.id === where.id) ?? null,
    },
    passkey: {
      findUnique: async ({ where }: { where: { credentialID: string } }) => {
        const passkey = fixture.rows.passkey.find(
          (row) => row.credentialID === where.credentialID,
        );
        return passkey
          ? {
              user: fixture.rows.user.find(
                (user) => user.id === passkey.userId,
              ),
            }
          : null;
      },
    },
  },
}));

import {
  enforcePasskeyAuthenticationOptions,
  meetPasskeys,
  protectPasskeyRequest,
} from "./service";

const origin = "https://meet.rshwub.com";

function cookieHeader(response: Response, existing = "") {
  const cookies = new Map<string, string>();
  for (const cookie of [
    ...existing.split("; "),
    ...response.headers.getSetCookie().map((value) => value.split(";")[0]),
  ]) {
    if (!cookie) continue;
    const separator = cookie.indexOf("=");
    cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
  }
  return Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ");
}

function createFixtureAuth() {
  return betterAuth({
    baseURL: `${origin}/api/better-auth`,
    secret: "test-only-passkey-secret-32-characters-long",
    database: memoryAdapter(fixture.rows),
    plugins: [admin(), anonymous(), meetPasskeys, testUtils()],
    hooks: {
      // Match auth.ts's composition, including the no-result fallthrough.
      before: createAuthMiddleware(async (ctx) => {
        await protectPasskeyRequest(ctx);
      }),
      after: createAuthMiddleware(async (ctx) => {
        const options = await enforcePasskeyAuthenticationOptions(ctx);
        if (options) return options;
      }),
    },
    trustedOrigins: [origin],
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });
}

type FixtureAuth = ReturnType<typeof createFixtureAuth>;

async function request(
  auth: FixtureAuth,
  path: string,
  { cookie = "", body }: { cookie?: string; body?: unknown } = {},
) {
  return auth.handler(
    new Request(`${origin}/api/better-auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        cookie,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

async function createUserSession(
  auth: FixtureAuth,
  overrides: Record<string, unknown> = {},
) {
  const ctx = await auth.$context;
  const user = await ctx.test.saveUser(
    ctx.test.createUser({
      emailVerified: true,
      isAnonymous: false,
      banned: false,
      ...overrides,
    }),
  );
  const login = await ctx.test.login({ userId: user.id });
  return {
    user,
    session: login.session,
    cookie: login.headers.get("cookie") ?? "",
  };
}

async function expectCode(response: Response, code: string) {
  expect(response.ok).toBe(false);
  expect(await response.json()).toMatchObject({ code });
}

function createSigningCredential(userId: string, persist = true) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const jwk = publicKey.export({ format: "jwk" });
  if (!jwk.x || !jwk.y) throw new Error("Missing P-256 coordinates");
  // Canonical COSE EC2 public key: kty=2, alg=-7, crv=1, x/y=32 bytes.
  const cose = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(jwk.y, "base64url"),
  ]);
  const credentialID = randomBytes(32).toString("base64url");
  const credential = {
    id: `passkey-${credentialID}`,
    userId,
    name: "Test authenticator",
    publicKey: cose.toString("base64"),
    credentialID,
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    transports: "internal",
    createdAt: new Date(),
  };
  if (persist) fixture.rows.passkey.push(credential);

  return {
    credential,
    registration(challenge: string, verified = true) {
      const credentialBytes = Buffer.from(credentialID, "base64url");
      const idLength = Buffer.alloc(2);
      idLength.writeUInt16BE(credentialBytes.length);
      const authenticatorData = Buffer.concat([
        createHash("sha256").update("meet.rshwub.com").digest(),
        Buffer.from([verified ? 0x45 : 0x41]), // UP, optional UV, attested data
        Buffer.alloc(4), // Initial signature counter
        Buffer.alloc(16), // Anonymous authenticator AAGUID
        idLength,
        credentialBytes,
        cose,
      ]);
      // CBOR {fmt:"none", attStmt:{}, authData:bytes}; no attestation trust
      // claim is needed for a credential whose possession we later prove.
      const attestationObject = Buffer.concat([
        Buffer.from(
          "a363666d74646e6f6e656761747453746d74a0686175746844617461",
          "hex",
        ),
        Buffer.from([0x58, authenticatorData.length]),
        authenticatorData,
      ]);
      return {
        id: credentialID,
        rawId: credentialID,
        type: "public-key",
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({ type: "webauthn.create", challenge, origin }),
          ).toString("base64url"),
          attestationObject: attestationObject.toString("base64url"),
          transports: ["internal"],
        },
      };
    },
    assertion(
      challenge: string,
      {
        verified = true,
        clientOrigin = origin,
        rpID = "meet.rshwub.com",
        tamperedSignature = false,
      } = {},
    ) {
      const clientData = Buffer.from(
        JSON.stringify({
          type: "webauthn.get",
          challenge,
          origin: clientOrigin,
          crossOrigin: false,
        }),
      );
      const counter = Buffer.alloc(4);
      counter.writeUInt32BE(1);
      const authenticatorData = Buffer.concat([
        createHash("sha256").update(rpID).digest(),
        Buffer.from([verified ? 0x05 : 0x01]),
        counter,
      ]);
      const signature = sign(
        "sha256",
        Buffer.concat([
          authenticatorData,
          createHash("sha256").update(clientData).digest(),
        ]),
        privateKey,
      );
      if (tamperedSignature) {
        signature[signature.length - 1] =
          (signature[signature.length - 1] ?? 0) ^ 1;
      }
      return {
        id: credentialID,
        rawId: credentialID,
        type: "public-key",
        response: {
          clientDataJSON: clientData.toString("base64url"),
          authenticatorData: authenticatorData.toString("base64url"),
          signature: signature.toString("base64url"),
          userHandle: Buffer.from(userId).toString("base64url"),
        },
      };
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  fixture.emailLogin = "true";
  for (const rows of Object.values(fixture.rows)) rows.splice(0);
});

describe("passkey HTTP authorization with Better Auth's real session store", () => {
  it("preserves ordinary session and sign-out responses through composed hooks", async () => {
    const auth = createFixtureAuth();
    expect(await (await request(auth, "/get-session")).json()).toBeNull();
    const account = await createUserSession(auth);
    const session = await (await request(auth, "/get-session", account)).json();
    expect(session.user.id).toBe(account.user.id);
    expect(session).not.toHaveProperty("headers");
    expect(session).not.toHaveProperty("response");
    const signedOut = await request(auth, "/sign-out", {
      cookie: account.cookie,
      body: {},
    });
    expect(await signedOut.json()).toEqual({ success: true });
  });

  it("returns unwrapped, non-cacheable browser authentication options", async () => {
    const auth = createFixtureAuth();
    const response = await request(
      auth,
      "/passkey/generate-authenticate-options",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    const options = await response.json();
    expect(options).toMatchObject({
      rpId: "meet.rshwub.com",
      userVerification: "required",
      challenge: expect.any(String),
    });
    expect(options).not.toHaveProperty("response");
    expect(options).not.toHaveProperty("headers");
  });

  it("requires an account, with guest sign-in and stale sessions rejected", async () => {
    const auth = createFixtureAuth();
    await expectCode(
      await request(auth, "/passkey/generate-register-options"),
      "PASSKEY_ACCOUNT_REQUIRED",
    );
    const guest = await createUserSession(auth, { isAnonymous: true });
    await expectCode(
      await request(auth, "/passkey/generate-register-options", guest),
      "PASSKEY_ACCOUNT_REQUIRED",
    );
    const account = await createUserSession(auth);
    const session = fixture.rows.session.find(
      (row) => row.id === account.session.id,
    );
    if (!session) throw new Error("Session fixture missing");
    session.createdAt = new Date(Date.now() - 16 * 60_000);
    await expectCode(
      await request(auth, "/passkey/generate-register-options", account),
      "PASSKEY_REAUTHENTICATION_REQUIRED",
    );
    expect(
      (await request(auth, "/passkey/list-user-passkeys", account)).ok,
    ).toBe(true);
  });

  it("uses the configured RP, discoverable credentials and required user verification", async () => {
    const auth = createFixtureAuth();
    const account = await createUserSession(auth);
    const response = await request(
      auth,
      "/passkey/generate-register-options",
      account,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      rp: { id: "meet.rshwub.com", name: "Rshwub Meet" },
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
  });

  it("does not allow a revoked session using a still-valid cookie cache", async () => {
    const auth = createFixtureAuth();
    const account = await createUserSession(auth);
    const cached = await request(auth, "/get-session", account);
    const cookie = cookieHeader(cached, account.cookie);
    expect(cookie).toContain("session_data=");
    fixture.rows.session.splice(0);
    await expectCode(
      await request(auth, "/passkey/generate-register-options", { cookie }),
      "PASSKEY_ACCOUNT_REQUIRED",
    );
  });

  it.each([
    { emailVerified: false },
    { banned: true },
    { deletedAt: new Date() },
  ])("checks current account eligibility %o", async (change) => {
    const auth = createFixtureAuth();
    const account = await createUserSession(auth);
    Object.assign(fixture.rows.user[0], change);
    await expectCode(
      await request(auth, "/passkey/generate-register-options", account),
      "PASSKEY_ACCOUNT_REQUIRED",
    );
  });

  it("cannot modify another account's credential", async () => {
    const auth = createFixtureAuth();
    const owner = await createUserSession(auth);
    const stranger = await createUserSession(auth);
    const { credential } = createSigningCredential(owner.user.id);
    for (const [path, body] of [
      ["/passkey/delete-passkey", { id: credential.id }],
      ["/passkey/update-passkey", { id: credential.id, name: "Stolen" }],
    ] as const) {
      const response = await request(auth, path, { ...stranger, body });
      expect(response.ok).toBe(false);
    }
    expect(fixture.rows.passkey).toHaveLength(1);
    expect(fixture.rows.passkey[0].name).toBe("Test authenticator");
    const deleted = await request(auth, "/passkey/delete-passkey", {
      ...owner,
      body: { id: credential.id },
    });
    expect(deleted.ok).toBe(true);
    expect(fixture.rows.passkey).toHaveLength(0);
  });

  it("respects SSO-only instance settings for public and protected endpoints", async () => {
    const auth = createFixtureAuth();
    const account = await createUserSession(auth);
    fixture.emailLogin = "false";
    for (const path of [
      "/passkey/generate-register-options",
      "/passkey/generate-authenticate-options",
    ]) {
      await expectCode(await request(auth, path, account), "PASSKEY_DISABLED");
    }
  });

  it("rejects labels longer than 100 characters before creating or renaming a credential", async () => {
    const auth = createFixtureAuth();
    const account = await createUserSession(auth);
    const { credential } = createSigningCredential(account.user.id);
    for (const path of [
      "/passkey/verify-registration",
      "/passkey/update-passkey",
    ]) {
      await expectCode(
        await request(auth, path, {
          ...account,
          body: { id: credential.id, name: "x".repeat(101), response: {} },
        }),
        "PASSKEY_NAME_INVALID",
      );
    }
    expect(fixture.rows.passkey).toHaveLength(1);
    expect(fixture.rows.passkey[0].name).toBe("Test authenticator");
  });
});

describe("real P-256 WebAuthn assertions", () => {
  it.each([
    true,
    false,
  ])("persists registration only after user verification (UV=%s)", async (verified) => {
    const auth = createFixtureAuth();
    const account = await createUserSession(auth);
    const authenticator = createSigningCredential(account.user.id, false);
    const options = await request(
      auth,
      "/passkey/generate-register-options",
      account,
    );
    const { challenge } = await options.json();
    const response = await request(auth, "/passkey/verify-registration", {
      cookie: cookieHeader(options, account.cookie),
      body: {
        response: authenticator.registration(challenge, verified),
        name: "  Registered authenticator  ",
      },
    });
    if (verified) {
      expect(response.status).toBe(200);
      expect(fixture.rows.passkey).toHaveLength(1);
      expect(fixture.rows.passkey[0]).toMatchObject({
        credentialID: authenticator.credential.credentialID,
        userId: account.user.id,
        name: "Registered authenticator",
      });
    } else {
      await expectCode(response, "PASSKEY_USER_VERIFICATION_REQUIRED");
      expect(fixture.rows.passkey).toHaveLength(0);
    }
    expect(fixture.rows.session).toHaveLength(1);
  });

  it("signs in, advances the counter, issues a session, and refuses challenge replay", async () => {
    const auth = createFixtureAuth();
    const account = await createUserSession(auth);
    const authenticator = createSigningCredential(account.user.id);
    const options = await request(
      auth,
      "/passkey/generate-authenticate-options",
    );
    const authenticationOptions = await options.json();
    expect(authenticationOptions.userVerification).toBe("required");
    const { challenge } = authenticationOptions;
    const cookie = cookieHeader(options);
    const body = { response: authenticator.assertion(challenge) };
    const response = await request(auth, "/passkey/verify-authentication", {
      cookie,
      body,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { id: account.user.id, role: "user" },
      session: { userId: account.user.id },
    });
    expect(cookieHeader(response)).toContain("session_token=");
    expect(fixture.rows.passkey[0].counter).toBe(1);
    expect(fixture.rows.session).toHaveLength(2);
    await expectCode(
      await request(auth, "/passkey/verify-authentication", { cookie, body }),
      "CHALLENGE_NOT_FOUND",
    );
    expect(fixture.rows.session).toHaveLength(2);

    const nextOptions = await request(
      auth,
      "/passkey/generate-authenticate-options",
    );
    const nextChallenge = (await nextOptions.json()).challenge;
    // A fresh challenge cannot rescue a cloned/non-advancing authenticator.
    await expectCode(
      await request(auth, "/passkey/verify-authentication", {
        cookie: cookieHeader(nextOptions),
        body: { response: authenticator.assertion(nextChallenge) },
      }),
      "AUTHENTICATION_FAILED",
    );
    expect(fixture.rows.passkey[0].counter).toBe(1);
    expect(fixture.rows.session).toHaveLength(2);
  });

  it.each([
    [{ verified: false }, "PASSKEY_USER_VERIFICATION_REQUIRED"],
    [{ clientOrigin: "https://attacker.invalid" }, "AUTHENTICATION_FAILED"],
    [{ rpID: "attacker.invalid" }, "AUTHENTICATION_FAILED"],
    [{ tamperedSignature: true }, "AUTHENTICATION_FAILED"],
  ])("rejects assertion %o before creating a session", async (override, code) => {
    const auth = createFixtureAuth();
    const account = await createUserSession(auth);
    const authenticator = createSigningCredential(account.user.id);
    const options = await request(
      auth,
      "/passkey/generate-authenticate-options",
    );
    const { challenge } = await options.json();
    await expectCode(
      await request(auth, "/passkey/verify-authentication", {
        cookie: cookieHeader(options),
        body: { response: authenticator.assertion(challenge, override) },
      }),
      code,
    );
    expect(fixture.rows.passkey[0].counter).toBe(0);
    expect(fixture.rows.session).toHaveLength(1);
  });

  it.each([
    { banned: true },
    { deletedAt: new Date() },
  ])("refuses a valid assertion for a disabled account %o", async (change) => {
    const auth = createFixtureAuth();
    const account = await createUserSession(auth);
    const authenticator = createSigningCredential(account.user.id);
    Object.assign(fixture.rows.user[0], change);
    const options = await request(
      auth,
      "/passkey/generate-authenticate-options",
    );
    const { challenge } = await options.json();
    await expectCode(
      await request(auth, "/passkey/verify-authentication", {
        cookie: cookieHeader(options),
        body: { response: authenticator.assertion(challenge) },
      }),
      "PASSKEY_ACCOUNT_REQUIRED",
    );
    expect(fixture.rows.session).toHaveLength(1);
  });
});

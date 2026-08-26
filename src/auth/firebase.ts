import { createRemoteJWKSet, jwtVerify } from "jose";

/** Google's public keys for Firebase ID tokens (same for every project). */
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface VerifiedIdentity {
  providerUid: string;
  email?: string;
  name?: string;
}

/** Verifies the Firebase ID token minted by the developer-portal Firebase project. */
export type IdentityVerifier = (idToken: string) => Promise<VerifiedIdentity>;

export class InvalidIdentityTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIdentityTokenError";
  }
}

export function createFirebaseIdentityVerifier(projectId: string): IdentityVerifier {
  const jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

  return async (idToken: string): Promise<VerifiedIdentity> => {
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, jwks, {
        algorithms: ["RS256"],
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      }));
    } catch (err) {
      throw new InvalidIdentityTokenError(
        `Could not verify the sign-in token: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const providerUid = typeof payload.sub === "string" ? payload.sub : "";
    if (!providerUid) {
      throw new InvalidIdentityTokenError("Sign-in token has no subject.");
    }
    return {
      providerUid,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  };
}

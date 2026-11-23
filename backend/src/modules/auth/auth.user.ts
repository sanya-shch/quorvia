import type { AuthUser } from "./auth.types.js";

type AuthUserRow = {
  id: string;
  email: string;
  isDemo?: boolean | null;
  demoExpiresAt?: Date | null;
};

// What the client sees of a user. A demo account also carries its expiry (the frontend shows the
// countdown); for everyone else the shape stays {id, email}.
export const toAuthUser = (user: AuthUserRow): AuthUser => ({
  id: user.id,
  email: user.email,
  ...(user.isDemo && user.demoExpiresAt
    ? { demo: { expiresAt: user.demoExpiresAt.toISOString() } }
    : {}),
});

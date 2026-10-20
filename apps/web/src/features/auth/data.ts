import "server-only";
import { prisma } from "@rallly/database";

const passkeyAccountSelection = {
  isAnonymous: true,
  emailVerified: true,
  banned: true,
  deletedAt: true,
} as const;

export async function getPasskeyAccount(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: passkeyAccountSelection,
  });
}

export async function getPasskeyCredentialAccount(credentialID: string) {
  const credential = await prisma.passkey.findUnique({
    where: { credentialID },
    select: { user: { select: passkeyAccountSelection } },
  });
  return credential?.user ?? null;
}

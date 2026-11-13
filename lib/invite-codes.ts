import { randomInt } from "node:crypto";

// Uppercase letters and digits, minus the ones that are easy to misread when a
// code is read aloud or copied by hand: I, O, 0 and 1.
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

/** What the admin API returns for a code. */
export const inviteCodeSelect = {
  id: true,
  code: true,
  role: true,
  maxUses: true,
  usedCount: true,
  createdAt: true,
  groupId: true,
  group: { select: { id: true, name: true } },
  subjects: {
    select: { subject: { select: { id: true, title: true } } },
  },
} as const;

/** Codes are case-insensitive, and people paste them with stray spaces. */
export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase();
}

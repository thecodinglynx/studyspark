import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/prisma";

let counter = 0;
const next = () => {
  counter += 1;
  return counter;
};

export const TEST_PASSWORD = "correct-horse";
// Low cost factor: these hashes only need to verify, not resist attack.
const TEST_PASSWORD_HASH = hashSync(TEST_PASSWORD, 4);

export async function createUser(
  overrides: { username?: string; name?: string | null } = {}
) {
  const n = next();
  return prisma.user.create({
    data: {
      username: overrides.username ?? `user${n}`,
      name: overrides.name === undefined ? `User ${n}` : overrides.name,
      passwordHash: TEST_PASSWORD_HASH,
    },
  });
}

export async function createFlashcardSubject(
  ownerId: string,
  options: {
    title?: string;
    description?: string;
    studyGoal?: number;
    cards?: Array<{ prompt: string; answer: string }>;
  } = {}
) {
  const cards = options.cards ?? [
    { prompt: "2 + 2", answer: "4" },
    { prompt: "Capital of France", answer: "Paris" },
    { prompt: "H2O", answer: "Water" },
  ];

  const subject = await prisma.subject.create({
    data: {
      title: options.title ?? `Flashcards ${next()}`,
      description: options.description,
      studyGoal: options.studyGoal ?? 0,
      type: "FLASHCARDS",
      ownerId,
    },
  });

  // Created one at a time so createdAt (the display order) is deterministic.
  const created = [];
  for (const [index, card] of cards.entries()) {
    created.push(
      await prisma.card.create({
        data: {
          ...card,
          subjectId: subject.id,
          createdAt: new Date(Date.UTC(2025, 0, 1, 0, 0, index)),
        },
      })
    );
  }

  return { subject, cards: created };
}

export async function createChecklistSubject(
  ownerId: string,
  options: {
    title?: string;
    items?: Array<{ title: string; description?: string }>;
  } = {}
) {
  const items = options.items ?? [
    { title: "Warm-up scales", description: "Ten minutes" },
    { title: "Sight reading" },
  ];

  const subject = await prisma.subject.create({
    data: {
      title: options.title ?? `Checklist ${next()}`,
      type: "CHECKLIST",
      ownerId,
    },
  });

  const created = [];
  for (const [position, item] of items.entries()) {
    created.push(
      await prisma.checklistItem.create({
        data: { ...item, position, subjectId: subject.id },
      })
    );
  }

  return { subject, items: created };
}

export async function shareSubject(
  subjectId: string,
  userId: string,
  role: "VIEWER" | "EDITOR" = "VIEWER"
) {
  return prisma.subjectShare.create({ data: { subjectId, userId, role } });
}

export async function createStudySession(
  subjectId: string,
  userId: string,
  data: {
    correct?: number;
    incorrect?: number;
    durationMin?: number;
    cardCount?: number;
    studiedAt?: Date;
  } = {}
) {
  return prisma.studySession.create({
    data: {
      subjectId,
      userId,
      correct: data.correct ?? 1,
      incorrect: data.incorrect ?? 0,
      durationMin: data.durationMin ?? 1,
      cardCount: data.cardCount ?? (data.correct ?? 1) + (data.incorrect ?? 0),
      ...(data.studiedAt ? { studiedAt: data.studiedAt } : {}),
    },
  });
}

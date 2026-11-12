import { describe, expect, it } from "vitest";
import SubjectPage from "@/app/subjects/[id]/page";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createChecklistSubject,
  createFlashcardSubject,
  createStudySession,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { routeContext } from "../helpers/http";
import { redirectTarget, renderPage } from "../helpers/render";

const open = (id: string) => SubjectPage(routeContext({ id }));
const render = async (id: string) => renderPage(await open(id));

describe("subject page access", () => {
  it("sends anonymous visitors to the login page", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    expect(await redirectTarget(() => open(subject.id))).toBe("/login");
  });

  it("sends users without access back to the dashboard", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id, { title: "Secret" });

    signInAs(await createUser());

    expect(await redirectTarget(() => open(subject.id))).toBe("/dashboard");
  });

  it("shows not-found for an unknown subject", async () => {
    signInAs(await createUser());

    await expect(open("does-not-exist")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("flashcard subject page", () => {
  it("gives the owner the study view, the card manager and sharing controls", async () => {
    const owner = await createUser({ username: "owner" });
    const { subject } = await createFlashcardSubject(owner.id, {
      title: "Chemistry",
      description: "Exam 3",
    });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Chemistry Owned by you");
    expect(text).toContain("Exam 3");
    expect(text).toContain("Card 1 of 3");
    expect(text).toContain("Card manager");
    expect(text).toContain("Invite teammates by username");
    expect(text).toContain("Share subject");
    expect(text).toContain("No sessions yet. Start your first study run!");
  });

  it("gives an editor the card manager but not sharing controls", async () => {
    const owner = await createUser({ username: "owner" });
    const editor = await createUser({ username: "editor" });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, editor.id, "EDITOR");

    signInAs(editor);
    const { text } = await render(subject.id);

    expect(text).toContain("Owned by owner");
    expect(text).toContain("Card manager");
    expect(text).toContain("These collaborators have access to this subject.");
    expect(text).not.toContain("Share subject");
  });

  it("gives a viewer the study view only", async () => {
    const owner = await createUser({ username: "owner" });
    const viewer = await createUser({ username: "viewer" });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, viewer.id, "VIEWER");

    signInAs(viewer);
    const { text } = await render(subject.id);

    expect(text).toContain("Card 1 of 3");
    expect(text).not.toContain("Card manager");
    expect(text).not.toContain("Share subject");
  });

  it("shows the user's own totals, accuracy and session history", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, viewer.id);
    await createStudySession(subject.id, owner.id, {
      correct: 3,
      incorrect: 1,
      durationMin: 6,
      cardCount: 3,
    });
    await createStudySession(subject.id, viewer.id, { correct: 0, incorrect: 8 });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("3 Cards 3 Correct 1 Incorrect 75% Accuracy");
    expect(text).toContain("3/3 cards +3 -1 6 min");
    expect(text).not.toContain("-8");
  });

  it("lists collaborators", async () => {
    const owner = await createUser();
    const friend = await createUser({ username: "friend", name: "Best Friend" });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, friend.id, "EDITOR");

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("friend Best Friend editor Remove");
  });

  it("handles a subject whose cards were all removed", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id, { cards: [] });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("No cards available");
    expect(text).toContain("0 Cards 0 Correct 0 Incorrect 0% Accuracy");
  });
});

describe("checklist subject page", () => {
  it("gives the owner the checklist, its manager and sharing controls", async () => {
    const owner = await createUser();
    const { subject } = await createChecklistSubject(owner.id, { title: "Piano" });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Piano Owned by you");
    expect(text).toContain("Select the items you practiced today");
    expect(text).toContain("Warm-up scales");
    expect(text).toContain("Checklist manager");
    expect(text).toContain("Share subject");
    expect(text).toContain("2 Items 0 Total practices Not practiced yet Last practiced");
    expect(text).not.toContain("Card manager");
  });

  it("hides the checklist manager from a viewer", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { subject } = await createChecklistSubject(owner.id);
    await shareSubject(subject.id, viewer.id, "VIEWER");

    signInAs(viewer);
    const { text } = await render(subject.id);

    expect(text).toContain("Select the items you practiced today");
    expect(text).not.toContain("Checklist manager");
  });

  it("counts every practice the user logged, not just the recent ones shown", async () => {
    const owner = await createUser();
    const { subject, items } = await createChecklistSubject(owner.id);
    await prisma.checklistEntry.createMany({
      data: Array.from({ length: 25 }, (_, index) => ({
        subjectId: subject.id,
        itemId: items[index % 2].id,
        userId: owner.id,
        practicedAt: new Date(2025, 0, index + 1, 12),
      })),
    });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("2 Items 25 Total practices");
    expect(text).toContain(
      `${new Date(2025, 0, 25, 12).toLocaleDateString()} Last practiced`
    );
  });

  it("shows each user their own practice history and last-practiced dates", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { subject, items } = await createChecklistSubject(owner.id);
    await shareSubject(subject.id, viewer.id);
    await prisma.checklistEntry.create({
      data: { subjectId: subject.id, itemId: items[0].id, userId: owner.id },
    });

    signInAs(viewer);
    const { text } = await render(subject.id);

    expect(text).toContain("0 Total practices");
    expect(text).toContain("Last practiced Never");
    expect(text).not.toMatch(/Last practiced \d/);
    expect(text).toContain("No practice logged yet.");
  });
});

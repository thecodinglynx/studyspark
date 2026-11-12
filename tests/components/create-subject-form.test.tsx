import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateSubjectForm } from "@/components/dashboard/create-subject-form";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const save = () => screen.getByRole("button", { name: "Save subject" });

describe("CreateSubjectForm", () => {
  it("starts as a flashcard subject with two empty cards", () => {
    render(<CreateSubjectForm />);

    expect(screen.getAllByLabelText("Prompt")).toHaveLength(2);
    expect(screen.getAllByLabelText("Answer")).toHaveLength(2);
    expect(screen.getByText("0% ready")).toBeInTheDocument();
  });

  it("tracks how complete the draft is", async () => {
    const user = userEvent.setup();
    render(<CreateSubjectForm />);

    await user.type(screen.getByLabelText("Subject title"), "Chemistry");
    expect(screen.getByText("20% ready")).toBeInTheDocument();

    await user.type(screen.getAllByLabelText("Prompt")[0], "H");
    // A card only counts once both sides are filled in.
    expect(screen.getByText("20% ready")).toBeInTheDocument();

    await user.type(screen.getAllByLabelText("Answer")[0], "Hydrogen");
    expect(screen.getByText("60% ready")).toBeInTheDocument();
  });

  it("adds and removes cards, always keeping at least one", async () => {
    const user = userEvent.setup();
    render(<CreateSubjectForm />);

    await user.click(screen.getByRole("button", { name: "Add another card" }));
    expect(screen.getAllByLabelText("Prompt")).toHaveLength(3);

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(screen.getAllByLabelText("Prompt")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("creates a flashcard subject with trimmed cards and returns to the dashboard", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "subject-1" }, 201));
    render(<CreateSubjectForm />);

    await user.type(screen.getByLabelText("Subject title"), "Chemistry");
    await user.type(screen.getByLabelText("Description"), "  Exam 3  ");
    await user.type(screen.getAllByLabelText("Prompt")[0], " H ");
    await user.type(screen.getAllByLabelText("Answer")[0], " Hydrogen ");
    await user.type(screen.getAllByLabelText("Prompt")[1], "He");
    await user.type(screen.getAllByLabelText("Answer")[1], "Helium");
    await user.click(save());

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(fetchCall(fetchMock)).toEqual({
      url: "/api/subjects",
      method: "POST",
      body: {
        type: "FLASHCARDS",
        title: "Chemistry",
        description: "Exam 3",
        cards: [
          { prompt: "H", answer: "Hydrogen" },
          { prompt: "He", answer: "Helium" },
        ],
      },
    });
  });

  it("leaves the description out when it is blank", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "subject-1" }, 201));
    render(<CreateSubjectForm />);

    await user.type(screen.getByLabelText("Subject title"), "Chemistry");
    await user.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    await user.type(screen.getByLabelText("Prompt"), "H");
    await user.type(screen.getByLabelText("Answer"), "Hydrogen");
    await user.click(save());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).not.toHaveProperty("description");
  });

  it("refuses to save cards that are only whitespace", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<CreateSubjectForm />);

    await user.type(screen.getByLabelText("Subject title"), "Chemistry");
    await user.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    await user.type(screen.getByLabelText("Prompt"), "   ");
    await user.type(screen.getByLabelText("Answer"), "   ");
    await user.click(save());

    expect(
      screen.getByText("Add at least one card with a prompt and answer")
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switches to a checklist and creates it with its items", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "subject-1" }, 201));
    render(<CreateSubjectForm />);

    await user.click(screen.getByRole("button", { name: "Checklist" }));

    expect(screen.queryByLabelText("Prompt")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Title")).toHaveLength(2);

    await user.type(screen.getByLabelText("Subject title"), "Piano");
    await user.type(screen.getAllByLabelText("Title")[0], " Scales ");
    await user.type(screen.getAllByLabelText("Notes")[0], " Major and minor ");
    await user.type(screen.getAllByLabelText("Title")[1], "Arpeggios");
    await user.click(save());

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(fetchCall(fetchMock).body).toEqual({
      type: "CHECKLIST",
      title: "Piano",
      items: [
        { title: "Scales", description: "Major and minor" },
        { title: "Arpeggios" },
      ],
    });
  });

  it("adds checklist items and counts them towards completion", async () => {
    const user = userEvent.setup();
    render(<CreateSubjectForm />);
    await user.click(screen.getByRole("button", { name: "Checklist" }));

    await user.click(screen.getByRole("button", { name: "Add another item" }));
    expect(screen.getAllByLabelText("Title")).toHaveLength(3);

    await user.type(screen.getAllByLabelText("Title")[0], "Scales");
    expect(screen.getByText("25% ready")).toBeInTheDocument();
  });

  it("keeps the flashcard draft when switching type and back", async () => {
    const user = userEvent.setup();
    render(<CreateSubjectForm />);
    await user.type(screen.getAllByLabelText("Prompt")[0], "H");

    await user.click(screen.getByRole("button", { name: "Checklist" }));
    await user.click(screen.getByRole("button", { name: "Flashcards" }));

    expect(screen.getAllByLabelText("Prompt")[0]).toHaveValue("H");
  });

  it("shows the server's error and keeps the draft", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "Invalid data" }, 400));
    render(<CreateSubjectForm />);

    await user.type(screen.getByLabelText("Subject title"), "Chemistry");
    await user.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    await user.type(screen.getByLabelText("Prompt"), "H");
    await user.type(screen.getByLabelText("Answer"), "Hydrogen");
    await user.click(save());

    expect(await screen.findByText("Invalid data")).toBeInTheDocument();
    expect(screen.getByLabelText("Subject title")).toHaveValue("Chemistry");
    expect(screen.getByLabelText("Prompt")).toHaveValue("H");
    expect(router.replace).not.toHaveBeenCalled();
  });
});

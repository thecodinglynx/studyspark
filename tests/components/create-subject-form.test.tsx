import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateSubjectForm } from "@/components/dashboard/create-subject-form";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const save = () => screen.getByRole("button", { name: "Save subject" });
const typeOption = (name: string) => screen.getByRole("radio", { name });
const removeButtons = () => screen.getAllByRole("button", { name: /^Remove (card|item) \d+$/ });
const addButton = () => screen.getByRole("button", { name: /^\+ Add another (card|item)$/ });

describe("CreateSubjectForm", () => {
  it("starts as a flashcard subject with two empty cards", () => {
    render(<CreateSubjectForm />);

    expect(typeOption("Flashcards")).toBeChecked();
    expect(screen.getAllByLabelText("Prompt")).toHaveLength(2);
    expect(screen.getAllByLabelText("Answer")).toHaveLength(2);
    expect(screen.getByText("0 of 2 cards filled in")).toBeInTheDocument();
  });

  it("numbers the cards", () => {
    render(<CreateSubjectForm />);

    expect(screen.getByRole("heading", { name: "Card 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Card 2" })).toBeInTheDocument();
  });

  it("offers the two subject types as a compact choice and explains the selected one", async () => {
    const user = userEvent.setup();
    render(<CreateSubjectForm />);

    const group = screen.getByRole("radiogroup", { name: "What are you creating?" });
    expect(group).toContainElement(typeOption("Flashcards"));
    expect(group).toContainElement(typeOption("Checklist"));
    expect(typeOption("Checklist")).not.toBeChecked();
    expect(screen.getByText(/prompt on the front and an answer on the back/)).toBeInTheDocument();

    await user.click(typeOption("Checklist"));

    expect(typeOption("Checklist")).toBeChecked();
    expect(typeOption("Flashcards")).not.toBeChecked();
    expect(screen.getByText(/A list of things to practice/)).toBeInTheDocument();
    expect(screen.queryByText(/prompt on the front/)).not.toBeInTheDocument();
  });

  it("says which fields are optional", () => {
    render(<CreateSubjectForm />);

    expect(screen.getByLabelText("Description (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Subject title")).toBeRequired();
  });

  it("counts how many cards are filled in, and only counts a card once both sides are", async () => {
    const user = userEvent.setup();
    render(<CreateSubjectForm />);

    await user.type(screen.getAllByLabelText("Prompt")[0], "H");
    expect(screen.getByText("0 of 2 cards filled in")).toBeInTheDocument();

    await user.type(screen.getAllByLabelText("Answer")[0], "Hydrogen");
    expect(screen.getByText("1 of 2 cards filled in")).toBeInTheDocument();

    await user.type(screen.getAllByLabelText("Prompt")[1], "He");
    await user.type(screen.getAllByLabelText("Answer")[1], "Helium");
    expect(screen.getByText("2 of 2 cards filled in")).toBeInTheDocument();
  });

  it("adds and removes cards, always keeping at least one", async () => {
    const user = userEvent.setup();
    render(<CreateSubjectForm />);

    await user.click(addButton());
    expect(screen.getAllByLabelText("Prompt")).toHaveLength(3);
    expect(screen.getByText("0 of 3 cards filled in")).toBeInTheDocument();

    await user.click(removeButtons()[0]);
    await user.click(removeButtons()[0]);

    expect(screen.getAllByLabelText("Prompt")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it("renumbers the cards after one is removed", async () => {
    const user = userEvent.setup();
    render(<CreateSubjectForm />);
    await user.click(addButton());

    await user.click(screen.getByRole("button", { name: "Remove card 1" }));

    expect(screen.getByRole("heading", { name: "Card 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Card 2" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Card 3" })).not.toBeInTheDocument();
  });

  it("creates a flashcard subject with trimmed cards and returns to the dashboard", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "subject-1" }, 201));
    render(<CreateSubjectForm />);

    await user.type(screen.getByLabelText("Subject title"), "Chemistry");
    await user.type(screen.getByLabelText("Description (optional)"), "  Exam 3  ");
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
    await user.click(removeButtons()[1]);
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
    await user.click(removeButtons()[1]);
    await user.type(screen.getByLabelText("Prompt"), "   ");
    await user.type(screen.getByLabelText("Answer"), "   ");
    await user.click(save());

    expect(screen.getByText("Add at least one card with a prompt and answer")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switches to a checklist and creates it with its items", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "subject-1" }, 201));
    render(<CreateSubjectForm />);

    await user.click(typeOption("Checklist"));

    expect(screen.queryByLabelText("Prompt")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Title")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Item 1" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Subject title"), "Piano");
    await user.type(screen.getAllByLabelText("Title")[0], " Scales ");
    await user.type(screen.getAllByLabelText(/^Notes/)[0], " Major and minor ");
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

  it("adds checklist items and counts the ones filled in", async () => {
    const user = userEvent.setup();
    render(<CreateSubjectForm />);
    await user.click(typeOption("Checklist"));
    expect(screen.getByText("0 of 2 items filled in")).toBeInTheDocument();

    await user.click(addButton());
    expect(screen.getAllByLabelText("Title")).toHaveLength(3);

    await user.type(screen.getAllByLabelText("Title")[0], "Scales");
    expect(screen.getByText("1 of 3 items filled in")).toBeInTheDocument();
  });

  it("keeps the flashcard draft when switching type and back", async () => {
    const user = userEvent.setup();
    render(<CreateSubjectForm />);
    await user.type(screen.getAllByLabelText("Prompt")[0], "H");

    await user.click(typeOption("Checklist"));
    await user.click(typeOption("Flashcards"));

    expect(screen.getAllByLabelText("Prompt")[0]).toHaveValue("H");
  });

  it("shows the server's error and keeps the draft", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "Invalid data" }, 400));
    render(<CreateSubjectForm />);

    await user.type(screen.getByLabelText("Subject title"), "Chemistry");
    await user.click(removeButtons()[1]);
    await user.type(screen.getByLabelText("Prompt"), "H");
    await user.type(screen.getByLabelText("Answer"), "Hydrogen");
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid data");
    expect(screen.getByLabelText("Subject title")).toHaveValue("Chemistry");
    expect(screen.getByLabelText("Prompt")).toHaveValue("H");
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("CreateSubjectForm required fields", () => {
  it("only requires the first card, so an empty extra card does not block saving", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "subject-1" }, 201));
    render(<CreateSubjectForm />);

    const [firstPrompt, secondPrompt] = screen.getAllByLabelText("Prompt");
    const [firstAnswer, secondAnswer] = screen.getAllByLabelText("Answer");
    expect(firstPrompt).toBeRequired();
    expect(firstAnswer).toBeRequired();
    expect(secondPrompt).not.toBeRequired();
    expect(secondAnswer).not.toBeRequired();

    await user.type(screen.getByLabelText("Subject title"), "Chemistry");
    await user.type(firstPrompt, "H");
    await user.type(firstAnswer, "Hydrogen");
    await user.click(save());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).toMatchObject({
      cards: [{ prompt: "H", answer: "Hydrogen" }],
    });
  });

  it("only requires the first checklist item", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "subject-1" }, 201));
    render(<CreateSubjectForm />);
    await user.click(typeOption("Checklist"));

    const [first, second] = screen.getAllByLabelText("Title");
    expect(first).toBeRequired();
    expect(second).not.toBeRequired();

    await user.type(screen.getByLabelText("Subject title"), "Piano");
    await user.type(first, "Scales");
    await user.click(save());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).toMatchObject({ items: [{ title: "Scales" }] });
  });
});

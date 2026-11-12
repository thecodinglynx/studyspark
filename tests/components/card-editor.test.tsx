import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CardEditor } from "@/components/subjects/card-editor";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const cards = [
  { id: "card-1", prompt: "2 + 2", answer: "4" },
  { id: "card-2", prompt: "Capital of France", answer: "Paris" },
];

const renderEditor = (props: Partial<React.ComponentProps<typeof CardEditor>> = {}) =>
  render(<CardEditor subjectId="subject-1" cards={cards} canEdit {...props} />);

/** The "Add new card" form. */
const addForm = () =>
  within(screen.getByRole("heading", { name: "Add new card" }).closest("form")!);
/** The box showing one existing card. */
const cardBox = (prompt: string) =>
  within(screen.getByText(prompt).closest("div.rounded-2xl") as HTMLElement);

describe("CardEditor", () => {
  it("renders nothing for users who cannot edit", () => {
    const { container } = renderEditor({ canEdit: false });

    expect(container).toBeEmptyDOMElement();
  });

  it("lists the existing cards", () => {
    renderEditor();

    expect(screen.getByText("2 + 2")).toBeInTheDocument();
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
  });

  it("says so when there are no cards", () => {
    renderEditor({ cards: [] });

    expect(screen.getByText("No cards yet. Add your first one above.")).toBeInTheDocument();
  });

  describe("adding", () => {
    it("posts the trimmed card, clears the form and refreshes", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "card-3" }, 201));
      renderEditor();

      await user.type(addForm().getByLabelText("Prompt"), "  H2O  ");
      await user.type(addForm().getByLabelText("Answer"), "  Water ");
      await user.click(addForm().getByRole("button", { name: "Add card" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchCall(fetchMock)).toEqual({
        url: "/api/subjects/subject-1/cards",
        method: "POST",
        body: { prompt: "H2O", answer: "Water" },
      });
      expect(addForm().getByLabelText("Prompt")).toHaveValue("");
      expect(addForm().getByLabelText("Answer")).toHaveValue("");
    });

    it("does not post a card that is only whitespace", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch();
      renderEditor();

      await user.type(addForm().getByLabelText("Prompt"), "   ");
      await user.type(addForm().getByLabelText("Answer"), "   ");
      await user.click(addForm().getByRole("button", { name: "Add card" }));

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows the server's error and keeps what was typed", async () => {
      const user = userEvent.setup();
      mockFetch(jsonResponse({ error: "Forbidden" }, 403));
      renderEditor();

      await user.type(addForm().getByLabelText("Prompt"), "H2O");
      await user.type(addForm().getByLabelText("Answer"), "Water");
      await user.click(addForm().getByRole("button", { name: "Add card" }));

      expect(await screen.findByText("Forbidden")).toBeInTheDocument();
      expect(addForm().getByLabelText("Prompt")).toHaveValue("H2O");
      expect(router.refresh).not.toHaveBeenCalled();
    });
  });

  describe("editing", () => {
    it("opens the card's current text for editing", async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(cardBox("Capital of France").getByRole("button", { name: "Edit" }));

      expect(screen.getByDisplayValue("Capital of France")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Paris")).toBeInTheDocument();
      // The other card stays read-only.
      expect(screen.getByText("2 + 2")).toBeInTheDocument();
    });

    it("saves changes with PUT and closes the edit form", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "card-2" }));
      renderEditor();
      await user.click(cardBox("Capital of France").getByRole("button", { name: "Edit" }));

      const answer = screen.getByDisplayValue("Paris");
      await user.clear(answer);
      await user.type(answer, "Paris, of course ");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchCall(fetchMock)).toEqual({
        url: "/api/subjects/subject-1/cards/card-2",
        method: "PUT",
        body: { prompt: "Capital of France", answer: "Paris, of course" },
      });
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    });

    it("cancels without calling the server", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch();
      renderEditor();
      await user.click(cardBox("2 + 2").getByRole("button", { name: "Edit" }));

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps the edit form open when saving fails", async () => {
      const user = userEvent.setup();
      mockFetch(jsonResponse({ error: "Not found" }, 404));
      renderEditor();
      await user.click(cardBox("2 + 2").getByRole("button", { name: "Edit" }));

      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Not found")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });
  });

  describe("removing", () => {
    it("deletes the card after confirmation", async () => {
      const user = userEvent.setup();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = mockFetch(jsonResponse({ ok: true }));
      renderEditor();

      await user.click(cardBox("2 + 2").getByRole("button", { name: "Remove" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(confirm).toHaveBeenCalledWith("Remove this card?");
      expect(fetchCall(fetchMock)).toMatchObject({
        url: "/api/subjects/subject-1/cards/card-1",
        method: "DELETE",
      });
    });

    it("does nothing if the confirmation is declined", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const fetchMock = mockFetch();
      renderEditor();

      await user.click(cardBox("2 + 2").getByRole("button", { name: "Remove" }));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("shows the server's error", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(jsonResponse({ error: "Forbidden" }, 403));
      renderEditor();

      await user.click(cardBox("2 + 2").getByRole("button", { name: "Remove" }));

      expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    });
  });
});

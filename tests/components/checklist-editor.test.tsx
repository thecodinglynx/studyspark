import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChecklistEditor } from "@/components/subjects/checklist-editor";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const items = [
  { id: "item-1", title: "Warm-up scales", description: "Ten minutes" },
  { id: "item-2", title: "Sight reading", description: null },
];

const renderEditor = (
  props: Partial<React.ComponentProps<typeof ChecklistEditor>> = {}
) => render(<ChecklistEditor subjectId="subject-1" items={items} canEdit {...props} />);

const addForm = () =>
  within(
    screen.getByRole("heading", { name: "Add new checklist item" }).closest("form")!
  );
const itemBox = (title: string) =>
  within(screen.getByText(title).closest("div.rounded-2xl") as HTMLElement);

describe("ChecklistEditor", () => {
  it("renders nothing for users who cannot edit", () => {
    const { container } = renderEditor({ canEdit: false });

    expect(container).toBeEmptyDOMElement();
  });

  it("lists the existing items and their notes", () => {
    renderEditor();

    expect(screen.getByText("Warm-up scales")).toBeInTheDocument();
    expect(screen.getByText("Ten minutes")).toBeInTheDocument();
    expect(screen.getByText("Sight reading")).toBeInTheDocument();
  });

  it("says so when there are no items", () => {
    renderEditor({ items: [] });

    expect(screen.getByText("No items yet. Add your first one above.")).toBeInTheDocument();
  });

  describe("adding", () => {
    it("posts the trimmed item, clears the form and refreshes", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "item-3" }, 201));
      renderEditor();

      await user.type(addForm().getByLabelText("Title"), " Arpeggios ");
      await user.type(addForm().getByLabelText(/^Notes/), " Both hands ");
      await user.click(addForm().getByRole("button", { name: "Add item" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchCall(fetchMock)).toEqual({
        url: "/api/subjects/subject-1/items",
        method: "POST",
        body: { title: "Arpeggios", description: "Both hands" },
      });
      expect(addForm().getByLabelText("Title")).toHaveValue("");
      expect(addForm().getByLabelText(/^Notes/)).toHaveValue("");
    });

    it("leaves the description out when no notes were typed", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "item-3" }, 201));
      renderEditor();

      await user.type(addForm().getByLabelText("Title"), "Arpeggios");
      await user.click(addForm().getByRole("button", { name: "Add item" }));

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchCall(fetchMock).body).toEqual({ title: "Arpeggios" });
    });

    it("does not post a title that is only whitespace", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch();
      renderEditor();

      await user.type(addForm().getByLabelText("Title"), "   ");
      await user.click(addForm().getByRole("button", { name: "Add item" }));

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows the server's error", async () => {
      const user = userEvent.setup();
      mockFetch(jsonResponse({ error: "Forbidden" }, 403));
      renderEditor();

      await user.type(addForm().getByLabelText("Title"), "Arpeggios");
      await user.click(addForm().getByRole("button", { name: "Add item" }));

      expect(await screen.findByText("Forbidden")).toBeInTheDocument();
      expect(router.refresh).not.toHaveBeenCalled();
    });
  });

  describe("editing", () => {
    it("saves a changed title and notes with PUT", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "item-1" }));
      renderEditor();
      await user.click(itemBox("Warm-up scales").getByRole("button", { name: "Edit" }));

      const title = screen.getByDisplayValue("Warm-up scales");
      await user.clear(title);
      await user.type(title, "Scales");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchCall(fetchMock)).toEqual({
        url: "/api/subjects/subject-1/items/item-1",
        method: "PUT",
        body: { title: "Scales", description: "Ten minutes" },
      });
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    });

    it("sends null to clear the notes", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "item-1" }));
      renderEditor();
      await user.click(itemBox("Warm-up scales").getByRole("button", { name: "Edit" }));

      await user.clear(screen.getByDisplayValue("Ten minutes"));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchCall(fetchMock).body).toEqual({
        title: "Warm-up scales",
        description: null,
      });
    });

    it("cancels without calling the server", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch();
      renderEditor();
      await user.click(itemBox("Sight reading").getByRole("button", { name: "Edit" }));

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("removing", () => {
    it("deletes the item after confirmation", async () => {
      const user = userEvent.setup();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = mockFetch(jsonResponse({ ok: true }));
      renderEditor();

      await user.click(itemBox("Sight reading").getByRole("button", { name: "Remove" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(confirm).toHaveBeenCalledWith("Remove this checklist item?");
      expect(fetchCall(fetchMock)).toMatchObject({
        url: "/api/subjects/subject-1/items/item-2",
        method: "DELETE",
      });
    });

    it("does nothing if the confirmation is declined", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const fetchMock = mockFetch();
      renderEditor();

      await user.click(itemBox("Sight reading").getByRole("button", { name: "Remove" }));

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChecklistStudy } from "@/components/subjects/checklist-study";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const items = [
  {
    id: "item-1",
    title: "Warm-up scales",
    description: "Ten minutes",
    lastPracticedAt: "2025-03-01T10:00:00.000Z",
  },
  { id: "item-2", title: "Sight reading", description: null, lastPracticedAt: null },
];

function renderChecklist(
  props: Partial<React.ComponentProps<typeof ChecklistStudy>> = {}
) {
  return render(
    <ChecklistStudy subjectId="subject-1" items={items} recentEntries={[]} {...props} />
  );
}

const logButton = () => screen.getByRole("button", { name: "Log practice" });

describe("ChecklistStudy", () => {
  it("lists items with their description and last practice date", () => {
    renderChecklist();

    expect(screen.getByRole("checkbox", { name: /Warm-up scales/ })).not.toBeChecked();
    expect(screen.getByText("Ten minutes")).toBeInTheDocument();
    expect(
      screen.getByText(
        `Last practiced ${new Date("2025-03-01T10:00:00.000Z").toLocaleDateString()}`
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Last practiced Never")).toBeInTheDocument();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });

  it("counts and marks selected items", async () => {
    const user = userEvent.setup();
    renderChecklist();

    await user.click(screen.getByRole("checkbox", { name: /Warm-up scales/ }));
    await user.click(screen.getByRole("checkbox", { name: /Sight reading/ }));

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getAllByText("Marked for today")).toHaveLength(2);

    await user.click(screen.getByRole("checkbox", { name: /Sight reading/ }));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getAllByText("Marked for today")).toHaveLength(1);
  });

  it("asks for a selection before logging and does not call the server", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    renderChecklist();

    await user.click(logButton());

    expect(screen.getByText("Select at least one item first")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs the selected items, clears the selection and refreshes", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ ok: true }, 201));
    renderChecklist();
    await user.click(screen.getByRole("checkbox", { name: /Warm-up scales/ }));
    await user.click(screen.getByRole("checkbox", { name: /Sight reading/ }));

    await user.click(logButton());

    expect(await screen.findByText("Practice logged")).toBeInTheDocument();
    expect(fetchCall(fetchMock)).toEqual({
      url: "/api/subjects/subject-1/checklist",
      method: "POST",
      body: { itemIds: ["item-1", "item-2"] },
    });
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Warm-up scales/ })).not.toBeChecked();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the server's error and keeps the selection", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "Invalid items" }, 400));
    renderChecklist();
    await user.click(screen.getByRole("checkbox", { name: /Warm-up scales/ }));

    await user.click(logButton());

    expect(await screen.findByText("Invalid items")).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("falls back to a generic error when the response is not JSON", async () => {
    const user = userEvent.setup();
    mockFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    renderChecklist();
    await user.click(screen.getByRole("checkbox", { name: /Warm-up scales/ }));

    await user.click(logButton());

    expect(await screen.findByText("Failed to log practice")).toBeInTheDocument();
  });

  it("clears an old message when the selection changes", async () => {
    const user = userEvent.setup();
    renderChecklist();
    await user.click(logButton());
    expect(screen.getByText("Select at least one item first")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Warm-up scales/ }));

    expect(screen.queryByText("Select at least one item first")).not.toBeInTheDocument();
  });

  it("disables logging when the checklist is empty", () => {
    renderChecklist({ items: [] });

    expect(
      screen.getByText("No checklist items yet. Ask the owner to add them.")
    ).toBeInTheDocument();
    expect(logButton()).toBeDisabled();
  });

  it("lists recent practice, or says there is none", () => {
    const { unmount } = renderChecklist();
    expect(
      screen.getByText("No practice logged yet. Start by selecting the items above.")
    ).toBeInTheDocument();
    unmount();

    renderChecklist({
      recentEntries: [
        { id: "entry-1", itemTitle: "Arpeggios", practicedAt: "2025-03-02T09:30:00.000Z" },
      ],
    });

    expect(screen.getByText("Arpeggios")).toBeInTheDocument();
    expect(
      screen.getByText(new Date("2025-03-02T09:30:00.000Z").toLocaleString())
    ).toBeInTheDocument();
  });
});

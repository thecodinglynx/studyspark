import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InviteManager } from "@/components/admin/invite-manager";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const subjects = [
  { id: "s1", title: "Chemistry", type: "FLASHCARDS" as const, ownerUsername: "alice", itemCount: 12 },
  { id: "s2", title: "Piano practice", type: "CHECKLIST" as const, ownerUsername: "bob", itemCount: 4 },
  { id: "s3", title: "History", type: "FLASHCARDS" as const, ownerUsername: "alice", itemCount: 30 },
];

const codes = [
  {
    id: "c1",
    code: "JOINUS23",
    role: "EDITOR" as const,
    maxUses: 5,
    usedCount: 2,
    createdAt: "2026-11-01T10:00:00.000Z",
    subjectIds: ["s1", "s3"],
    subjectTitles: ["Chemistry", "History"],
  },
];

const renderManager = (props: Partial<React.ComponentProps<typeof InviteManager>> = {}) =>
  render(<InviteManager subjects={subjects} codes={[]} {...props} />);

const generate = () => screen.getByRole("button", { name: "Generate code" });
const box = (title: string) => screen.getByRole("checkbox", { name: new RegExp(title) });

describe("InviteManager subject list", () => {
  it("shows every subject with its owner and size", () => {
    renderManager();

    expect(screen.getByText("12 cards · by alice")).toBeInTheDocument();
    expect(screen.getByText("4 checklist items · by bob")).toBeInTheDocument();
    expect(screen.getByText("0 of 3 subjects selected.")).toBeInTheDocument();
  });

  it("filters by title or owner", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.type(screen.getByLabelText("Find a subject"), "piano");
    expect(screen.queryByText("Chemistry")).not.toBeInTheDocument();
    expect(screen.getByText("Piano practice")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Find a subject"));
    await user.type(screen.getByLabelText("Find a subject"), "ALICE");
    expect(screen.getByText("Chemistry")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.queryByText("Piano practice")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Find a subject"));
    await user.type(screen.getByLabelText("Find a subject"), "zzz");
    expect(screen.getByText("No subjects match your search.")).toBeInTheDocument();
  });

  it("keeps selections made before a search is typed", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(box("Chemistry"));

    await user.type(screen.getByLabelText("Find a subject"), "piano");
    await user.click(box("Piano practice"));

    expect(screen.getByText("2 of 3 subjects selected.")).toBeInTheDocument();
  });

  it("explains when no subjects exist", () => {
    renderManager({ subjects: [] });

    expect(screen.getByText("No subjects have been created yet.")).toBeInTheDocument();
  });
});

describe("InviteManager creating a code", () => {
  it("asks for a selection first and does not call the server", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    renderManager();

    await user.click(generate());

    expect(screen.getByText("Select at least one subject first")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the selected subjects with viewer access and no limit by default", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ code: "ABCD2345" }, 201));
    renderManager();

    await user.click(box("Chemistry"));
    await user.click(box("History"));
    await user.click(generate());

    expect(await screen.findByTestId("created-code")).toHaveTextContent("ABCD2345");
    expect(fetchCall(fetchMock)).toEqual({
      url: "/api/admin/invite-codes",
      method: "POST",
      body: { subjectIds: ["s1", "s3"], role: "VIEWER", maxUses: null },
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByText("0 of 3 subjects selected.")).toBeInTheDocument();
  });

  it("sends the chosen access level and signup limit", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ code: "ABCD2345" }, 201));
    renderManager();

    await user.click(box("Piano practice"));
    await user.selectOptions(screen.getByLabelText("Access level"), "EDITOR");
    await user.type(screen.getByLabelText("Maximum signups (optional)"), "10");
    await user.click(generate());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).toEqual({
      subjectIds: ["s2"],
      role: "EDITOR",
      maxUses: 10,
    });
  });

  it("sends a custom code when one is typed and clears it afterwards", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ code: "KARATEISFUN" }, 201));
    renderManager();

    await user.click(box("Chemistry"));
    await user.type(screen.getByLabelText(/Custom code/), " karateisfun ");
    await user.click(generate());

    expect(await screen.findByTestId("created-code")).toHaveTextContent("KARATEISFUN");
    expect(fetchCall(fetchMock).body).toMatchObject({ subjectIds: ["s1"], code: "karateisfun" });
    expect(screen.getByLabelText(/Custom code/)).toHaveValue("");
  });

  it("leaves the code out when the field is blank", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ code: "ABCD2345" }, 201));
    renderManager();

    await user.click(box("Chemistry"));
    await user.type(screen.getByLabelText(/Custom code/), "   ");
    await user.click(generate());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).not.toHaveProperty("code");
  });

  it("shows the error and keeps the typed code when it is already taken", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "That code is already in use. Choose a different one." }, 409));
    renderManager();

    await user.click(box("Chemistry"));
    await user.type(screen.getByLabelText(/Custom code/), "karateisfun");
    await user.click(generate());

    expect(await screen.findByText(/already in use/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Custom code/)).toHaveValue("karateisfun");
  });

  it("hides a previous code once the selection changes", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ code: "ABCD2345" }, 201));
    renderManager();
    await user.click(box("Chemistry"));
    await user.click(generate());
    await screen.findByTestId("created-code");

    await user.click(box("History"));

    expect(screen.queryByTestId("created-code")).not.toBeInTheDocument();
  });

  it("shows the server's error and keeps the selection", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "Forbidden" }, 403));
    renderManager();
    await user.click(box("Chemistry"));

    await user.click(generate());

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 subjects selected.")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("InviteManager existing codes", () => {
  it("lists codes with access level, subjects and usage", () => {
    renderManager({ codes });

    const item = screen.getByText("JOINUS23").closest("li") as HTMLElement;
    expect(within(item).getByText("Editor access to Chemistry, History")).toBeInTheDocument();
    expect(within(item).getByText(/Used 2 of 5 times/)).toBeInTheDocument();
  });

  it("says when there are none", () => {
    renderManager();

    expect(screen.getByText("No invite codes yet.")).toBeInTheDocument();
  });

  it("revokes a code after confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = mockFetch(jsonResponse({ ok: true }));
    renderManager({ codes });

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalled();
    expect(fetchCall(fetchMock)).toMatchObject({
      url: "/api/admin/invite-codes/c1",
      method: "DELETE",
    });
  });

  it("does nothing if the confirmation is declined", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = mockFetch();
    renderManager({ codes });

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("InviteManager editing an existing code", () => {
  const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Edit" }));
    return within(screen.getByRole("group", { name: "Edit JOINUS23" }));
  };

  it("opens an editor showing the code, the current subjects and settings", async () => {
    const user = userEvent.setup();
    renderManager({ codes });

    const editor = await openEditor(user);

    expect(editor.getByRole("checkbox", { name: /Chemistry/ })).toBeChecked();
    expect(editor.getByRole("checkbox", { name: /History/ })).toBeChecked();
    expect(editor.getByRole("checkbox", { name: /Piano practice/ })).not.toBeChecked();
    expect(editor.getByText("2 of 3 subjects selected.")).toBeInTheDocument();
    expect(editor.getByLabelText("Access level")).toHaveValue("EDITOR");
    expect(editor.getByLabelText(/Maximum signups/)).toHaveValue(5);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("does not let the code itself be edited, and says so", async () => {
    const user = userEvent.setup();
    renderManager({ codes });

    const editor = await openEditor(user);

    expect(editor.queryByDisplayValue("JOINUS23")).not.toBeInTheDocument();
    expect(editor.getByText(/itself can't be changed/)).toBeInTheDocument();
  });

  it("explains that edits only affect future signups", async () => {
    const user = userEvent.setup();
    renderManager({ codes });

    const editor = await openEditor(user);

    expect(editor.getByText(/anyone who already used this code keeps the access they got/)).toBeInTheDocument();
  });

  it("sends the changed subjects with PATCH, then refreshes and closes", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "c1" }));
    renderManager({ codes });
    const editor = await openEditor(user);

    await user.click(editor.getByRole("checkbox", { name: /History/ })); // remove
    await user.click(editor.getByRole("checkbox", { name: /Piano practice/ })); // add
    await user.click(editor.getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchCall(fetchMock)).toEqual({
      url: "/api/admin/invite-codes/c1",
      method: "PATCH",
      body: { subjectIds: ["s1", "s2"], role: "EDITOR", maxUses: 5 },
    });
    expect(screen.queryByRole("group", { name: "Edit JOINUS23" })).not.toBeInTheDocument();
  });

  it("can change the access level and clear the limit", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "c1" }));
    renderManager({ codes });
    const editor = await openEditor(user);

    await user.selectOptions(editor.getByLabelText("Access level"), "VIEWER");
    await user.clear(editor.getByLabelText(/Maximum signups/));
    await user.click(editor.getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).toEqual({
      subjectIds: ["s1", "s3"],
      role: "VIEWER",
      maxUses: null,
    });
  });

  it("filters the subject list without losing the selection", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "c1" }));
    renderManager({ codes });
    const editor = await openEditor(user);

    await user.type(editor.getByLabelText("Find a subject"), "piano");
    expect(editor.queryByRole("checkbox", { name: /Chemistry/ })).not.toBeInTheDocument();
    await user.click(editor.getByRole("checkbox", { name: /Piano practice/ }));
    await user.click(editor.getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body.subjectIds).toEqual(["s1", "s3", "s2"]);
  });

  it("will not save with no subjects selected", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    renderManager({ codes });
    const editor = await openEditor(user);

    await user.click(editor.getByRole("checkbox", { name: /Chemistry/ }));
    await user.click(editor.getByRole("checkbox", { name: /History/ }));
    await user.click(editor.getByRole("button", { name: "Save changes" }));

    expect(editor.getByText(/needs at least one subject/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's error and stays open so nothing typed is lost", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "This code has already been used 2 times, so the limit can't be lower than that." }, 400));
    renderManager({ codes });
    const editor = await openEditor(user);

    await user.click(editor.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/already been used 2 times/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Edit JOINUS23" })).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("cancels without calling the server", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    renderManager({ codes });
    const editor = await openEditor(user);

    await user.click(editor.getByRole("checkbox", { name: /Piano practice/ }));
    await user.click(editor.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("group", { name: "Edit JOINUS23" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes with the Close button", async () => {
    const user = userEvent.setup();
    renderManager({ codes });
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("group", { name: "Edit JOINUS23" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});

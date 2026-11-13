import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShareManager } from "@/components/subjects/share-manager";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const shares = [
  { id: "share-1", username: "alice", name: "Alice A", role: "EDITOR" as const },
  { id: "share-2", username: "bob", name: null, role: "VIEWER" as const },
];

const renderManager = (
  props: Partial<React.ComponentProps<typeof ShareManager>> = {}
) => render(<ShareManager subjectId="subject-1" isOwner shares={shares} {...props} />);

describe("ShareManager", () => {
  it("lists collaborators with their role", () => {
    renderManager();

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("Alice A")).toBeInTheDocument();
    expect(screen.getByText("editor")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("No name")).toBeInTheDocument();
    expect(screen.getByText("viewer")).toBeInTheDocument();
  });

  it("marks access that comes from a group and does not offer to remove it", () => {
    renderManager({
      shares: [
        { id: "share-1", username: "alice", name: "Alice A", role: "VIEWER", viaGroup: true },
        { id: "share-2", username: "bob", name: null, role: "VIEWER" },
      ],
    });

    expect(screen.getByText("via group")).toBeInTheDocument();
    // Only the direct share can be removed.
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
  });

  it("says so when nobody has access yet", () => {
    renderManager({ shares: [] });

    expect(screen.getByText("No collaborators yet.")).toBeInTheDocument();
  });

  it("is read-only for collaborators", () => {
    renderManager({ isOwner: false });

    expect(
      screen.getByText("These collaborators have access to this subject.")
    ).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share subject" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Share with username")).not.toBeInTheDocument();
  });

  it("shares with a trimmed username as viewer by default", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "share-3" }, 201));
    renderManager();

    await user.type(screen.getByLabelText("Share with username"), "  carol ");
    await user.click(screen.getByRole("button", { name: "Share subject" }));

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchCall(fetchMock)).toEqual({
      url: "/api/subjects/subject-1/share",
      method: "POST",
      body: { username: "carol", role: "VIEWER" },
    });
    expect(screen.getByLabelText("Share with username")).toHaveValue("");
  });

  it("shares with the editor role when chosen", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "share-3" }, 201));
    renderManager();

    await user.type(screen.getByLabelText("Share with username"), "carol");
    await user.selectOptions(screen.getByLabelText("Role"), "EDITOR");
    await user.click(screen.getByRole("button", { name: "Share subject" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).toEqual({ username: "carol", role: "EDITOR" });
  });

  it("does not submit a blank username", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    renderManager();

    await user.type(screen.getByLabelText("Share with username"), "   ");
    await user.click(screen.getByRole("button", { name: "Share subject" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's error and keeps the typed username", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "User not found" }, 404));
    renderManager();

    await user.type(screen.getByLabelText("Share with username"), "ghost");
    await user.click(screen.getByRole("button", { name: "Share subject" }));

    expect(await screen.findByText("User not found")).toBeInTheDocument();
    expect(screen.getByLabelText("Share with username")).toHaveValue("ghost");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("removes a collaborator", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ ok: true }));
    renderManager();

    await user.click(screen.getAllByRole("button", { name: "Remove" })[1]);

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchCall(fetchMock)).toMatchObject({
      url: "/api/subjects/subject-1/share?username=bob",
      method: "DELETE",
    });
  });

  it("URL-encodes the username when removing", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ ok: true }));
    renderManager({
      shares: [{ id: "share-9", username: "a&b=c", name: null, role: "VIEWER" }],
    });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).url).toBe(
      "/api/subjects/subject-1/share?username=a%26b%3Dc"
    );
  });

  it("shows the server's error when removing fails", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "Forbidden" }, 403));
    renderManager();

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

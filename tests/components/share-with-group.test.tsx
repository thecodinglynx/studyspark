import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ShareWithGroup,
  SubjectGroupShare,
  type GroupTarget,
} from "@/components/subjects/share-with-group";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const target = (currentRole: GroupTarget["currentRole"] = null, id = "g1", name = "Karate club"): GroupTarget => ({
  id,
  name,
  currentRole,
});

const renderShare = (currentRole: GroupTarget["currentRole"] = null) =>
  render(<ShareWithGroup subjectId="subject-1" targets={[target(currentRole)]} ownGroupId="g1" />);

describe("ShareWithGroup with one group (a member's own)", () => {
  describe("when the subject is not shared", () => {
    it("offers to share it and explains who gets it", () => {
      renderShare();

      expect(screen.getByRole("heading", { name: "Share with your group" })).toBeInTheDocument();
      expect(screen.getByText(/everyone in Karate club study this subject/)).toBeInTheDocument();
      expect(screen.getByText(/People who join later get it too/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Share with Karate club" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Stop sharing" })).not.toBeInTheDocument();
    });

    it("shares as a viewer by default", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ shared: true }));
      renderShare();

      await user.click(screen.getByRole("button", { name: "Share with Karate club" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchCall(fetchMock)).toEqual({
        url: "/api/subjects/subject-1/group",
        method: "PUT",
        body: { role: "VIEWER", groupId: "g1" },
      });
    });

    it("can share as an editor", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ shared: true }));
      renderShare();

      await user.selectOptions(screen.getByLabelText("Group members can be"), "EDITOR");
      await user.click(screen.getByRole("button", { name: "Share with Karate club" }));

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchCall(fetchMock).body).toEqual({ role: "EDITOR", groupId: "g1" });
    });
  });

  describe("when the subject is already shared", () => {
    it("says who can open it and at what level", () => {
      renderShare("EDITOR");

      expect(
        screen.getByText(/Everyone in Karate club can open this subject as an editor/)
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Group members can be")).toHaveValue("EDITOR");
    });

    it("describes a viewer share as a viewer", () => {
      renderShare("VIEWER");

      expect(screen.getByText(/can open this subject as a viewer/)).toBeInTheDocument();
    });

    it("only offers to update once the level has been changed", async () => {
      const user = userEvent.setup();
      renderShare("VIEWER");
      const update = screen.getByRole("button", { name: "Update access" });
      expect(update).toBeDisabled();

      await user.selectOptions(screen.getByLabelText("Group members can be"), "EDITOR");

      expect(update).toBeEnabled();
    });

    it("changes the level with PUT", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ shared: true }));
      renderShare("VIEWER");

      await user.selectOptions(screen.getByLabelText("Group members can be"), "EDITOR");
      await user.click(screen.getByRole("button", { name: "Update access" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
      expect(fetchCall(fetchMock)).toMatchObject({ method: "PUT", body: { role: "EDITOR", groupId: "g1" } });
    });

    it("stops sharing with DELETE, naming the group", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ shared: false }));
      renderShare("VIEWER");

      await user.click(screen.getByRole("button", { name: "Stop sharing" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchCall(fetchMock)).toMatchObject({
        url: "/api/subjects/subject-1/group?groupId=g1",
        method: "DELETE",
      });
    });
  });

  it("shows the server's error and does not refresh", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "You are not in a group" }, 400));
    renderShare();

    await user.click(screen.getByRole("button", { name: "Share with Karate club" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You are not in a group");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows a message when the network fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network down")));
    renderShare("VIEWER");

    await user.click(screen.getByRole("button", { name: "Stop sharing" }));

    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });
});

describe("ShareWithGroup with several groups (an admin's choice)", () => {
  const renderMany = (own: string | null = null) =>
    render(
      <ShareWithGroup
        subjectId="subject-1"
        ownGroupId={own}
        targets={[target("EDITOR", "g1", "Karate club"), target(null, "g2", "Judo club")]}
      />
    );

  it("says to choose a group and lists each with its state", () => {
    renderMany();

    expect(screen.getByRole("heading", { name: "Share with a group" })).toBeInTheDocument();
    expect(screen.getByText(/Choose which groups can open this subject/)).toBeInTheDocument();
    const [karate, judo] = screen.getAllByRole("listitem");
    expect(within(karate).getByText("Karate club")).toBeInTheDocument();
    expect(within(karate).getByText(/Shared with everyone in this group as an editor/)).toBeInTheDocument();
    expect(within(judo).getByText("Not shared with this group.")).toBeInTheDocument();
  });

  it("calls the heading 'your group' only when there is just the one", () => {
    renderMany("g1");

    expect(screen.queryByRole("heading", { name: "Share with your group" })).not.toBeInTheDocument();
  });

  it("shares with the group whose button was pressed, leaving the others alone", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ shared: true }));
    renderMany();

    await user.click(screen.getByRole("button", { name: "Share with Judo club" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchCall(fetchMock).body).toEqual({ role: "VIEWER", groupId: "g2" });
  });

  it("has an access level for each group on its own", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ shared: true }));
    renderMany();

    await user.selectOptions(screen.getByLabelText("Members of Judo club can be"), "EDITOR");
    await user.click(screen.getByRole("button", { name: "Share with Judo club" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).toEqual({ role: "EDITOR", groupId: "g2" });
    expect(screen.getByLabelText("Members of Karate club can be")).toHaveValue("EDITOR");
  });

  it("stops sharing with just the one group", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ shared: false }));
    renderMany();

    await user.click(screen.getByRole("button", { name: "Stop sharing with Karate club" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock)).toMatchObject({
      url: "/api/subjects/subject-1/group?groupId=g1",
      method: "DELETE",
    });
  });

  it("shows an error against the group it happened for", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "That group does not exist" }, 400));
    renderMany();

    await user.click(screen.getByRole("button", { name: "Share with Judo club" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That group does not exist");
    expect(within(screen.getAllByRole("listitem")[1]).getByRole("alert")).toBe(alert);
  });

  it("URL-encodes the group id when unsharing", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ shared: false }));
    render(
      <ShareWithGroup
        subjectId="subject-1"
        targets={[target("VIEWER", "a b&c", "Odd group"), target(null, "g2", "Other")]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Stop sharing with Odd group" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).url).toBe("/api/subjects/subject-1/group?groupId=a%20b%26c");
  });
});

describe("SubjectGroupShare (on the Group page)", () => {
  const renderRow = (currentRole: GroupTarget["currentRole"] = null) =>
    render(
      <SubjectGroupShare
        subjectId="subject-1"
        title="Katas"
        typeLabel="Flashcards"
        target={target(currentRole)}
      />
    );

  it("shows the subject and whether it is shared", () => {
    const { unmount } = renderRow();
    expect(screen.getByText("Katas")).toBeInTheDocument();
    expect(screen.getByText("Flashcards")).toBeInTheDocument();
    expect(screen.getByText("Not shared")).toBeInTheDocument();
    unmount();

    renderRow("EDITOR");
    expect(screen.getByText("Shared as editor")).toBeInTheDocument();
  });

  it("shares it with the group", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ shared: true }));
    renderRow();

    await user.click(screen.getByRole("button", { name: "Share Katas" }));

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(fetchCall(fetchMock)).toEqual({
      url: "/api/subjects/subject-1/group",
      method: "PUT",
      body: { role: "VIEWER", groupId: "g1" },
    });
  });

  it("can share as an editor", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ shared: true }));
    renderRow();

    await user.selectOptions(screen.getByLabelText("Access for Katas"), "EDITOR");
    await user.click(screen.getByRole("button", { name: "Share Katas" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).toEqual({ role: "EDITOR", groupId: "g1" });
  });

  it("updates the level and stops sharing once shared", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ shared: true }), jsonResponse({ shared: false }));
    renderRow("VIEWER");
    expect(screen.getByRole("button", { name: "Update access to Katas" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Access for Katas"), "EDITOR");
    await user.click(screen.getByRole("button", { name: "Update access to Katas" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchCall(fetchMock, 0).body).toEqual({ role: "EDITOR", groupId: "g1" });

    await user.click(screen.getByRole("button", { name: "Stop sharing Katas" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchCall(fetchMock, 1)).toMatchObject({
      url: "/api/subjects/subject-1/group?groupId=g1",
      method: "DELETE",
    });
  });

  it("shows the server's error", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "Forbidden" }, 403));
    renderRow();

    await user.click(screen.getByRole("button", { name: "Share Katas" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

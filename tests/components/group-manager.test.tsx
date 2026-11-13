import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupManager, type AdminGroup } from "@/components/admin/group-manager";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const karate: AdminGroup = {
  id: "g1",
  name: "Karate club",
  members: [
    { id: "u1", username: "alice", name: "Alice A" },
    { id: "u2", username: "bob", name: null },
  ],
  codeCount: 2,
  subjectCount: 1,
};
const judo: AdminGroup = { id: "g2", name: "Judo club", members: [], codeCount: 0, subjectCount: 0 };
const loner = { id: "u3", username: "carol", name: "Carol C" };

const renderManager = (
  props: Partial<React.ComponentProps<typeof GroupManager>> = {}
) => render(<GroupManager groups={[karate, judo]} ungrouped={[loner]} {...props} />);

const groupBox = (name: string) =>
  within(screen.getByRole("heading", { name }).closest("li") as HTMLElement);

describe("GroupManager", () => {
  describe("what it shows", () => {
    it("lists each group with its counts and members", () => {
      renderManager();

      const karateBox = groupBox("Karate club");
      expect(karateBox.getByText("2 members · 2 invite codes · 1 shared subject")).toBeInTheDocument();
      expect(karateBox.getByText("Alice A (@alice)")).toBeInTheDocument();
      // A member without a display name shows as their username.
      expect(karateBox.getByText("bob")).toBeInTheDocument();
      expect(groupBox("Judo club").getByText("No members yet.")).toBeInTheDocument();
    });

    it("uses the singular for one member and one code", () => {
      renderManager({
        groups: [{ ...karate, members: [karate.members[0]], codeCount: 1, subjectCount: 1 }],
      });

      expect(screen.getByText("1 member · 1 invite code · 1 shared subject")).toBeInTheDocument();
    });

    it("lists people who are not in any group", () => {
      renderManager();

      expect(screen.getByRole("heading", { name: "People without a group (1)" })).toBeInTheDocument();
      expect(screen.getByText("Carol C (@carol)")).toBeInTheDocument();
    });

    it("says so when everyone is in a group or there are no groups", () => {
      const { unmount } = renderManager({ ungrouped: [] });
      expect(screen.getByText("Everyone is in a group.")).toBeInTheDocument();
      unmount();

      renderManager({ groups: [] });
      expect(screen.getByText("No groups yet.")).toBeInTheDocument();
    });

    it("explains what moving someone does", () => {
      renderManager();

      expect(screen.getByText(/removes the access it gave them/)).toBeInTheDocument();
    });
  });

  describe("moving people", () => {
    it("moves an ungrouped person into a group", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "u3", groupId: "g2" }));
      renderManager();

      await user.selectOptions(screen.getByLabelText("Group for carol"), "g2");

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchCall(fetchMock)).toEqual({
        url: "/api/admin/users/u3/group",
        method: "PUT",
        body: { groupId: "g2" },
      });
    });

    it("takes a member out of their group", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "u1", groupId: null }));
      renderManager();

      await user.selectOptions(screen.getByLabelText("Group for alice"), "");

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchCall(fetchMock)).toMatchObject({
        url: "/api/admin/users/u1/group",
        method: "PUT",
        body: { groupId: null },
      });
    });

    it("moves a member straight into another group", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "u2", groupId: "g2" }));
      renderManager();

      expect(screen.getByLabelText("Group for bob")).toHaveValue("g1");
      await user.selectOptions(screen.getByLabelText("Group for bob"), "g2");

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchCall(fetchMock).body).toEqual({ groupId: "g2" });
    });

    it("offers every group and 'No group' for each person", () => {
      renderManager();

      const options = within(screen.getByLabelText("Group for alice"))
        .getAllByRole("option")
        .map((o) => o.textContent);
      expect(options).toEqual(["No group", "Karate club", "Judo club"]);
    });

    it("shows the server's error", async () => {
      const user = userEvent.setup();
      mockFetch(jsonResponse({ error: "That group does not exist" }, 400));
      renderManager();

      await user.selectOptions(screen.getByLabelText("Group for carol"), "g2");

      expect(await screen.findByRole("alert")).toHaveTextContent("That group does not exist");
      expect(router.refresh).not.toHaveBeenCalled();
    });
  });

  describe("creating a group", () => {
    it("creates it, clears the field and refreshes", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "g3" }, 201));
      renderManager();

      await user.type(screen.getByLabelText("New group name"), "Aikido");
      await user.click(screen.getByRole("button", { name: "Create group" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchCall(fetchMock)).toEqual({
        url: "/api/admin/groups",
        method: "POST",
        body: { name: "Aikido" },
      });
      expect(screen.getByLabelText("New group name")).toHaveValue("");
    });

    it("does not offer to create a group with no name", async () => {
      const user = userEvent.setup();
      mockFetch();
      renderManager();

      expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
      await user.type(screen.getByLabelText("New group name"), "   ");
      expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
    });

    it("shows an error for a name that is taken and keeps what was typed", async () => {
      const user = userEvent.setup();
      mockFetch(jsonResponse({ error: "A group with that name already exists" }, 409));
      renderManager();

      await user.type(screen.getByLabelText("New group name"), "Karate club");
      await user.click(screen.getByRole("button", { name: "Create group" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
      expect(screen.getByLabelText("New group name")).toHaveValue("Karate club");
    });
  });

  describe("renaming a group", () => {
    it("renames it with PATCH and closes the form", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ id: "g1", name: "Shotokan" }));
      renderManager();

      await user.click(groupBox("Karate club").getByRole("button", { name: "Rename" }));
      const input = screen.getByLabelText("Group name");
      expect(input).toHaveValue("Karate club");
      await user.clear(input);
      await user.type(input, "Shotokan");
      await user.click(screen.getByRole("button", { name: "Save name" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchCall(fetchMock)).toEqual({
        url: "/api/admin/groups/g1",
        method: "PATCH",
        body: { name: "Shotokan" },
      });
      expect(screen.queryByLabelText("Group name")).not.toBeInTheDocument();
    });

    it("cancels without calling the server", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch();
      renderManager();

      await user.click(groupBox("Karate club").getByRole("button", { name: "Rename" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByLabelText("Group name")).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps the form open and shows the error when the name is taken", async () => {
      const user = userEvent.setup();
      mockFetch(jsonResponse({ error: "A group with that name already exists" }, 409));
      renderManager();

      await user.click(groupBox("Karate club").getByRole("button", { name: "Rename" }));
      const input = screen.getByLabelText("Group name");
      await user.clear(input);
      await user.type(input, "Judo club");
      await user.click(screen.getByRole("button", { name: "Save name" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
      expect(screen.getByLabelText("Group name")).toBeInTheDocument();
    });
  });

  describe("deleting a group", () => {
    it("deletes after confirmation, and the confirmation says nothing else is lost", async () => {
      const user = userEvent.setup();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = mockFetch(jsonResponse({ ok: true }));
      renderManager();

      await user.click(groupBox("Karate club").getByRole("button", { name: "Delete group" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(confirm.mock.calls[0][0]).toContain("Karate club");
      expect(confirm.mock.calls[0][0]).toContain("No accounts or subjects are deleted");
      expect(fetchCall(fetchMock)).toMatchObject({
        url: "/api/admin/groups/g1",
        method: "DELETE",
      });
    });

    it("does nothing when the confirmation is declined", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const fetchMock = mockFetch();
      renderManager();

      await user.click(groupBox("Karate club").getByRole("button", { name: "Delete group" }));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(router.refresh).not.toHaveBeenCalled();
    });
  });
});

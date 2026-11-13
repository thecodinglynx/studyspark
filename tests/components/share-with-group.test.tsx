import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShareWithGroup } from "@/components/subjects/share-with-group";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const renderShare = (currentRole: "VIEWER" | "EDITOR" | null = null) =>
  render(<ShareWithGroup subjectId="subject-1" groupName="Karate club" currentRole={currentRole} />);

describe("ShareWithGroup", () => {
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
        body: { role: "VIEWER" },
      });
    });

    it("can share as an editor", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ shared: true }));
      renderShare();

      await user.selectOptions(screen.getByLabelText("Group members can be"), "EDITOR");
      await user.click(screen.getByRole("button", { name: "Share with Karate club" }));

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchCall(fetchMock).body).toEqual({ role: "EDITOR" });
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
      expect(fetchCall(fetchMock)).toMatchObject({ method: "PUT", body: { role: "EDITOR" } });
    });

    it("stops sharing with DELETE", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({ shared: false }));
      renderShare("VIEWER");

      await user.click(screen.getByRole("button", { name: "Stop sharing" }));

      await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
      expect(fetchCall(fetchMock)).toMatchObject({
        url: "/api/subjects/subject-1/group",
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

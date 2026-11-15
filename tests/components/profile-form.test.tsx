import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProfileForm } from "@/components/settings/profile-form";
import { auth, fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const save = () => screen.getByRole("button", { name: "Save changes" });

describe("ProfileForm", () => {
  it("shows the current name and a login that cannot be edited", () => {
    render(<ProfileForm username="jane" name="Jane" />);

    expect(screen.getByLabelText(/^Name/)).toHaveValue("Jane");
    expect(screen.getByLabelText(/^Username/)).toBeDisabled();
    expect(save()).toBeDisabled();
  });

  it("saves the new name, refreshes the session and the page", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ username: "jane", name: "Jane Learner" }));
    render(<ProfileForm username="jane" name="Jane" />);

    await user.clear(screen.getByLabelText(/^Name/));
    await user.type(screen.getByLabelText(/^Name/), "  Jane Learner ");
    await user.click(save());

    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(fetchCall(fetchMock)).toEqual({
      url: "/api/profile",
      method: "PATCH",
      body: { name: "Jane Learner" },
    });
    expect(auth.update).toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
    expect(save()).toBeDisabled();
  });

  it("sends null to clear the name", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ username: "jane", name: null }));
    render(<ProfileForm username="jane" name="Jane" />);

    await user.clear(screen.getByLabelText(/^Name/));
    await user.click(save());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).toEqual({ name: null });
  });

  it("shows the server's error and keeps what was typed", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "Name can be at most 64 characters" }, 400));
    render(<ProfileForm username="jane" name={null} />);

    await user.type(screen.getByLabelText(/^Name/), "Jane");
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("at most 64");
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Jane");
    expect(auth.update).not.toHaveBeenCalled();
  });
});

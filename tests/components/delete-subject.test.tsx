import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteSubject } from "@/components/subjects/delete-subject";
import { fetchCall, hardNavigate, jsonResponse, mockFetch } from "../helpers/browser";

const renderDelete = () =>
  render(<DeleteSubject subjectId="subject-1" title="Organic chemistry" />);

describe("DeleteSubject", () => {
  it("names the subject and says what is lost and that it cannot be undone", () => {
    renderDelete();

    expect(screen.getByRole("heading", { name: "Delete this subject" })).toBeInTheDocument();
    expect(screen.getByText(/Organic chemistry/)).toBeInTheDocument();
    expect(screen.getByText(/study history/)).toBeInTheDocument();
    expect(screen.getByText(/loses access/)).toBeInTheDocument();
    expect(screen.getByText(/can't be undone/)).toBeInTheDocument();
  });

  it("does nothing until the deletion is confirmed", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    renderDelete();

    await user.click(screen.getByRole("button", { name: "Delete subject…" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Yes, delete permanently" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete subject…" })).not.toBeInTheDocument();
  });

  it("deletes the subject and returns to the dashboard with a full page load", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ ok: true }));
    renderDelete();

    await user.click(screen.getByRole("button", { name: "Delete subject…" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete permanently" }));

    await vi.waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/dashboard"));
    expect(fetchCall(fetchMock)).toMatchObject({
      url: "/api/subjects/subject-1",
      method: "DELETE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("backs out when cancelled, without calling the server", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    renderDelete();

    await user.click(screen.getByRole("button", { name: "Delete subject…" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Delete subject…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes, delete permanently" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("shows the server's error, stays on the page and lets the user try again", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ error: "Forbidden" }, 403), jsonResponse({ ok: true }));
    renderDelete();

    await user.click(screen.getByRole("button", { name: "Delete subject…" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete permanently" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
    expect(hardNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Yes, delete permanently" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Yes, delete permanently" }));

    await vi.waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/dashboard"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a message when the network fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network down")));
    renderDelete();

    await user.click(screen.getByRole("button", { name: "Delete subject…" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete permanently" }));

    expect(await screen.findByText("Network down")).toBeInTheDocument();
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("clears an old error when cancelled", async () => {
    const user = userEvent.setup();
    mockFetch(jsonResponse({ error: "Forbidden" }, 403));
    renderDelete();
    await user.click(screen.getByRole("button", { name: "Delete subject…" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete permanently" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

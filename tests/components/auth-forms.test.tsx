import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/forms/login-form";
import { SignupForm } from "@/components/forms/signup-form";
import { auth, fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

describe("LoginForm", () => {
  async function fillAndSubmit(username: string, password: string) {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Username"), username);
    await user.type(screen.getByLabelText("Password"), password);
    await user.click(screen.getByRole("button", { name: "Log in" }));
  }

  it("signs in without a full-page redirect and opens the dashboard", async () => {
    auth.signIn.mockResolvedValue({ ok: true, error: null });

    await fillAndSubmit("  jane ", "secret123");

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(auth.signIn).toHaveBeenCalledWith("credentials", {
      redirect: false,
      username: "jane",
      password: "secret123",
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("does not trim the password", async () => {
    auth.signIn.mockResolvedValue({ ok: true, error: null });

    await fillAndSubmit("jane", " spaced out ");

    await vi.waitFor(() =>
      expect(auth.signIn).toHaveBeenCalledWith(
        "credentials",
        expect.objectContaining({ password: " spaced out " })
      )
    );
  });

  it("shows the error and stays on the page when sign-in is rejected", async () => {
    auth.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });

    await fillAndSubmit("jane", "wrong-password");

    expect(await screen.findByText("CredentialsSignin")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });

  it("does not submit while required fields are empty", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("masks the password field", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });
});

describe("SignupForm", () => {
  async function fillAndSubmit(fields: {
    name?: string;
    username: string;
    password: string;
    inviteCode?: string;
  }) {
    const user = userEvent.setup();
    render(<SignupForm />);
    if (fields.name) {
      await user.type(screen.getByLabelText("Full name"), fields.name);
    }
    await user.type(screen.getByLabelText("Username"), fields.username);
    await user.type(screen.getByLabelText("Password"), fields.password);
    if (fields.inviteCode) {
      await user.type(screen.getByLabelText(/Invite code/), fields.inviteCode);
    }
    await user.click(screen.getByRole("button", { name: "Create account" }));
  }

  it("creates the account, signs in and opens the dashboard", async () => {
    const fetchMock = mockFetch(jsonResponse({ id: "user-1" }, 201));
    auth.signIn.mockResolvedValue({ ok: true, error: null });

    await fillAndSubmit({ name: " Jane Doe ", username: " jane ", password: "secret123" });

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
    expect(fetchCall(fetchMock)).toEqual({
      url: "/api/signup",
      method: "POST",
      body: { username: "jane", password: "secret123", name: "Jane Doe" },
    });
    expect(auth.signIn).toHaveBeenCalledWith("credentials", {
      redirect: false,
      username: "jane",
      password: "secret123",
    });
  });

  it("leaves the name out when none was typed", async () => {
    const fetchMock = mockFetch(jsonResponse({ id: "user-1" }, 201));
    auth.signIn.mockResolvedValue({ ok: true, error: null });

    await fillAndSubmit({ username: "jane", password: "secret123" });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).toEqual({ username: "jane", password: "secret123" });
  });

  it("sends the invite code when one is entered", async () => {
    const fetchMock = mockFetch(jsonResponse({ id: "user-1" }, 201));
    auth.signIn.mockResolvedValue({ ok: true, error: null });

    await fillAndSubmit({ username: "jane", password: "secret123", inviteCode: " ab12cd34 " });

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
    expect(fetchCall(fetchMock).body).toEqual({
      username: "jane",
      password: "secret123",
      inviteCode: "ab12cd34",
    });
  });

  it("shows an invalid invite code error and does not sign in", async () => {
    mockFetch(jsonResponse({ error: "Invalid or expired invite code" }, 400));

    await fillAndSubmit({ username: "jane", password: "secret123", inviteCode: "WRONG234" });

    expect(await screen.findByText("Invalid or expired invite code")).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("marks the invite code field as optional", () => {
    render(<SignupForm />);

    expect(screen.getByLabelText(/Invite code \(optional\)/)).not.toBeRequired();
  });

  it("shows the server's error and does not sign in", async () => {
    mockFetch(jsonResponse({ error: "Username already taken" }, 409));

    await fillAndSubmit({ username: "taken", password: "secret123" });

    expect(await screen.findByText("Username already taken")).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("shows an error if the account was created but sign-in failed", async () => {
    mockFetch(jsonResponse({ id: "user-1" }, 201));
    auth.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });

    await fillAndSubmit({ username: "jane", password: "secret123" });

    expect(await screen.findByText("CredentialsSignin")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("does not submit while required fields are empty", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<SignupForm />);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

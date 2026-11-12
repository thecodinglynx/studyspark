import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FlipCard } from "@/components/flip-card";
import { TopNav } from "@/components/top-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { auth, navigation } from "../helpers/browser";

describe("Button", () => {
  it("is a non-submitting button by default", () => {
    render(<Button>Go</Button>);

    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button");
  });

  it("is disabled and hides its label while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).not.toHaveTextContent("Save");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not fire clicks when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("styles its child instead of rendering a button when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/signup">Get started</a>
      </Button>
    );

    const link = screen.getByRole("link", { name: "Get started" });
    expect(link).toHaveAttribute("href", "/signup");
    expect(link.className).toContain("rounded-full");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Input and TextArea", () => {
  it("connect the label to the field", () => {
    render(
      <>
        <Input label="Username" />
        <TextArea label="Notes" />
      </>
    );

    expect(screen.getByLabelText("Username").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Notes").tagName).toBe("TEXTAREA");
  });

  it("show an error in place of the description", () => {
    render(<Input label="Username" description="Pick anything" error="Too short" />);

    expect(screen.getByText("Too short")).toBeInTheDocument();
    expect(screen.queryByText("Pick anything")).not.toBeInTheDocument();
  });
});

describe("FlipCard", () => {
  const card = () => screen.getByRole("button");
  const isFlipped = () => card().className.includes("rotateY(180deg)");

  it("shows both faces and starts on the front", () => {
    render(<FlipCard front="Question" back="Answer" />);

    expect(screen.getByText("Question")).toBeInTheDocument();
    expect(screen.getByText("Answer")).toBeInTheDocument();
    expect(isFlipped()).toBe(false);
  });

  it("flips on click and flips back on a second click", async () => {
    const user = userEvent.setup();
    render(<FlipCard front="Question" back="Answer" />);

    await user.click(card());
    expect(isFlipped()).toBe(true);

    await user.click(card());
    expect(isFlipped()).toBe(false);
  });

  it.each(["Enter", " "])("flips with the %j key", (key) => {
    render(<FlipCard front="Question" back="Answer" />);

    fireEvent.keyDown(card(), { key });

    expect(isFlipped()).toBe(true);
  });

  it("ignores other keys", () => {
    render(<FlipCard front="Question" back="Answer" />);

    fireEvent.keyDown(card(), { key: "a" });

    expect(isFlipped()).toBe(false);
  });
});

describe("TopNav", () => {
  it("offers sign-in to anonymous visitors and hides account links", async () => {
    const user = userEvent.setup();
    render(<TopNav />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Analytics" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create subject" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.signIn).toHaveBeenCalled();
  });

  it("shows the username, account links and log out when signed in", async () => {
    auth.session = {
      status: "authenticated",
      data: { user: { id: "user-1", username: "jane" } },
    };
    const user = userEvent.setup();
    render(<TopNav />);

    expect(screen.getByText("jane")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute(
      "href",
      "/analytics"
    );
    expect(screen.getByRole("link", { name: "Create subject" })).toHaveAttribute(
      "href",
      "/subjects/new"
    );
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(auth.signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("shows neither sign-in nor log out while the session is loading", () => {
    auth.session = { status: "loading", data: null };
    render(<TopNav />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  it("highlights the link for the current section", () => {
    auth.session = {
      status: "authenticated",
      data: { user: { id: "user-1", username: "jane" } },
    };
    navigation.pathname = "/analytics";
    render(<TopNav />);

    expect(screen.getByRole("link", { name: "Analytics" }).className).toContain("text-white");
    expect(screen.getByRole("link", { name: "Dashboard" }).className).toContain(
      "text-slate-400"
    );
  });

  it("opens the mobile menu and closes it with Escape or an outside click", async () => {
    const user = userEvent.setup();
    render(<TopNav />);
    const toggle = screen.getByRole("button", { name: "Open navigation menu" });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link", { name: "Dashboard" })).toHaveLength(2);

    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("link", { name: "Dashboard" })).toHaveLength(1);

    await user.click(toggle);
    await user.click(screen.getByRole("link", { name: "StudySpark" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

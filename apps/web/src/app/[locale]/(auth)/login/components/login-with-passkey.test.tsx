import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/test/test-utils";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), supported: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { passkey: mocks.signIn } },
}));
vi.mock("@/lib/passkey-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/passkey-client")>()),
  supportsPasskeys: mocks.supported,
}));

import { LoginWithPasskey } from "./login-with-passkey";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.supported.mockReturnValue(true);
});

describe("explicit passkey sign-in", () => {
  it("does not start a browser prompt on mount and explains unsupported browsers", () => {
    mocks.supported.mockReturnValue(false);
    render(<LoginWithPasskey />);
    expect(
      screen.getByRole("button", { name: "Sign in with a passkey" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Passkeys are unavailable in this browser/),
    ).toBeInTheDocument();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("handles cancellation with a retry and keeps other sign-in methods usable", async () => {
    mocks.signIn.mockResolvedValue({ error: { code: "AUTH_CANCELLED" } });
    const user = userEvent.setup();
    render(<LoginWithPasskey redirectTo="/settings/security" />);
    await user.click(
      screen.getByRole("button", { name: "Sign in with a passkey" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "canceled or timed out",
    );
    expect(
      screen.getByRole("button", { name: "Sign in with a passkey" }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: "Sign in with a passkey" }),
    );
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledTimes(2));
  });

  it("handles rejected network requests without exposing raw error text", async () => {
    mocks.signIn.mockRejectedValue(new Error("private detail"));
    const user = userEvent.setup();
    render(<LoginWithPasskey />);
    await user.click(
      screen.getByRole("button", { name: "Sign in with a passkey" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not sign in",
    );
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });
});

import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@/test/test-utils";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  signOut: vi.fn(),
  supported: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useListPasskeys: mocks.list,
    passkey: {
      addPasskey: mocks.add,
      updatePasskey: mocks.rename,
      deletePasskey: mocks.remove,
    },
  },
  signOut: mocks.signOut,
}));
vi.mock("@rallly/ui/sonner", () => ({ toast: { success: mocks.toast } }));
vi.mock("@/lib/passkey-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/passkey-client")>()),
  supportsPasskeys: mocks.supported,
}));

import { PasskeySettings } from "./passkey-settings";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.supported.mockReturnValue(true);
  mocks.list.mockReturnValue({
    data: [{ id: "key-a", name: "Personal laptop" }],
    isPending: false,
    error: null,
    refetch: mocks.refetch,
  });
  mocks.add.mockResolvedValue({ data: { id: "key-b" } });
  mocks.rename.mockResolvedValue({ data: { status: true } });
  mocks.remove.mockResolvedValue({ data: { status: true } });
});

describe("passkey settings", () => {
  it("requires a named confirmation before removal and cancel leaves the credential intact", async () => {
    const user = userEvent.setup();
    render(<PasskeySettings />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Personal laptop")).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ id: "key-a" }),
    );
  });

  it("trims the name and enforces the 100-character input limit", async () => {
    const user = userEvent.setup();
    render(<PasskeySettings />);
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Passkey name");
    expect(input).toHaveAttribute("maxlength", "100");
    expect(
      within(dialog).getByRole("button", { name: "Add a passkey" }),
    ).toBeDisabled();
    await user.type(input, "  Phone  ");
    await user.click(
      within(dialog).getByRole("button", { name: "Add a passkey" }),
    );
    await waitFor(() =>
      expect(mocks.add).toHaveBeenCalledExactlyOnceWith({ name: "Phone" }),
    );
  });

  it("offers explicit reauthentication without automatically signing out", async () => {
    mocks.rename.mockResolvedValue({
      error: { code: "PASSKEY_REAUTHENTICATION_REQUIRED" },
    });
    mocks.signOut.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<PasskeySettings />);
    await user.click(screen.getByRole("button", { name: "Rename" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const reauthenticate = await within(dialog).findByRole("button", {
      name: "Sign in again",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(reauthenticate);
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not update your passkeys",
    );
  });

  it("keeps cancellation recoverable in the name dialog", async () => {
    mocks.add.mockResolvedValue({ error: { code: "ERROR_CEREMONY_ABORTED" } });
    const user = userEvent.setup();
    render(<PasskeySettings />);
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Passkey name"), "Phone");
    await user.click(
      within(dialog).getByRole("button", { name: "Add a passkey" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "canceled or timed out",
    );
    expect(within(dialog).getByLabelText("Passkey name")).toHaveValue("Phone");
    expect(
      within(dialog).getByRole("button", { name: "Add a passkey" }),
    ).toBeEnabled();
  });

  it("allows managing existing passkeys even if this browser cannot create them", () => {
    mocks.supported.mockReturnValue(false);
    render(<PasskeySettings />);
    expect(
      screen.getByRole("button", { name: "Add a passkey" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rename" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
  });

  it("does not misreport a failed list request as an empty account", async () => {
    mocks.list.mockReturnValue({
      data: null,
      error: { code: "OFFLINE" },
      isPending: false,
      refetch: mocks.refetch,
    });
    const user = userEvent.setup();
    render(<PasskeySettings />);
    expect(
      screen.queryByText("You haven't added any passkeys yet."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add a passkey" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
});

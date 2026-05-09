import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./theme-toggle";

const mockUseTheme = vi.fn();
const mockUseAuth = vi.fn();
const mockUseTranslations = vi.fn();

vi.mock("./theme-provider", () => ({
  useThemePreference: () => mockUseTheme(),
  isTheme: (v: unknown) =>
    ["light", "dark", "forest", "ocean", "sunset", "nordic", "high-contrast", "metro"].includes(v as string),
  THEMES: ["light", "dark", "forest", "ocean", "sunset", "nordic", "high-contrast", "metro"],
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => mockUseTranslations(),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      getToken: vi.fn(),
    });
    mockUseTranslations.mockReturnValue((key: string) => key);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not call setTheme on initial render", () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: "dark", setTheme });
    render(<ThemeToggle />);
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("opens theme dropdown on button click", () => {
    mockUseTheme.mockReturnValue({ theme: "light", setTheme: vi.fn() });
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /toggleTheme/i }));
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("Forest")).toBeInTheDocument();
  });

  it("calls setTheme with chosen theme from dropdown", () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: "light", setTheme });
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: /toggleTheme/i }));
    fireEvent.click(screen.getByText("Dark"));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("closes dropdown after selecting a theme", () => {
    const setTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: "light", setTheme });
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: /toggleTheme/i }));
    fireEvent.click(screen.getByText("Forest"));

    expect(screen.queryByText("Ocean")).not.toBeInTheDocument();
  });
});

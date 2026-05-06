import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./theme-toggle";

const mockUseTheme = vi.fn();
const mockUseAuth = vi.fn();
const mockUseTranslations = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => mockUseTheme(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => mockUseTranslations(),
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

  it("writes current theme to localStorage on mount", () => {
    mockUseTheme.mockReturnValue({
      theme: "dark",
      setTheme: vi.fn(),
    });

    render(<ThemeToggle />);

    expect(localStorage.getItem("boet-theme-preference")).toBe("dark");
  });

  it("applies stored localStorage theme when different from current theme", () => {
    localStorage.setItem("boet-theme-preference", "light");
    const setTheme = vi.fn();

    mockUseTheme.mockReturnValue({
      theme: "dark",
      setTheme,
    });

    render(<ThemeToggle />);

    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("toggles to the opposite theme on click", () => {
    const setTheme = vi.fn();

    mockUseTheme.mockReturnValue({
      theme: "dark",
      setTheme,
    });

    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));

    expect(setTheme).toHaveBeenCalledWith("light");
  });
});
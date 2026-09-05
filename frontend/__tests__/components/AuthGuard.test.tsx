import React from "react";
import { render, screen } from "@testing-library/react";
import { AuthGuard } from "../../components/family/AuthGuard";
import * as authContext from "../../lib/family/authContext";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("AuthGuard Component", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders loading spinner while authentication status is loading", () => {
    jest.spyOn(authContext, "useAuth").mockReturnValue({
      user: null,
      token: null,
      isLoading: true,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      refreshProfile: jest.fn(),
    });

    render(
      <AuthGuard>
        <div data-testid="protected-content">Protected Children</div>
      </AuthGuard>
    );

    expect(
      screen.getByText(/Checking secure maritime connection/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated user to login", () => {
    jest.spyOn(authContext, "useAuth").mockReturnValue({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      refreshProfile: jest.fn(),
    });

    render(
      <AuthGuard>
        <div data-testid="protected-content">Protected Children</div>
      </AuthGuard>
    );

    expect(mockPush).toHaveBeenCalledWith("/login?redirect=family&reason=unauthenticated");
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("redirects unauthorized roles (e.g. OPERATOR) to login", () => {
    jest.spyOn(authContext, "useAuth").mockReturnValue({
      user: {
        id: "op-1",
        email: "operator@example.test",
        phone: "",
        name: "Operator John",
        role: "OPERATOR",
        assignedBoatIds: [],
      } as any,
      token: "valid-token",
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshProfile: jest.fn(),
    });

    render(
      <AuthGuard>
        <div data-testid="protected-content">Protected Children</div>
      </AuthGuard>
    );

    expect(mockPush).toHaveBeenCalledWith("/login?reason=unauthorized_role");
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("renders children when user is authenticated with FAMILY role", () => {
    jest.spyOn(authContext, "useAuth").mockReturnValue({
      user: {
        id: "fam-1",
        email: "family@example.test",
        phone: "",
        name: "Lakshmi Rao",
        role: "FAMILY",
        assignedBoatIds: ["AP-07-FISH-12"],
      },
      token: "valid-token",
      isLoading: false,
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      refreshProfile: jest.fn(),
    });

    render(
      <AuthGuard>
        <div data-testid="protected-content">Protected Children</div>
      </AuthGuard>
    );

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

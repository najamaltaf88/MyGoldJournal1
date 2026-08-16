// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoginScreen } from "./GoldJournal";

describe("Gold Journal Supabase login", () => {
  afterEach(() => cleanup());

  it("renders the Supabase email/password sign-in form", () => {
    render(<LoginScreen />);
    expect(screen.getByPlaceholderText("Email address")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in securely" })).toBeTruthy();
  });

  it("allows a visitor to switch to account creation", () => {
    render(<LoginScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Need a new account? Create one" }));
    expect(screen.getByRole("button", { name: "Create Supabase account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Already have an account? Sign in" })).toBeTruthy();
  });
});

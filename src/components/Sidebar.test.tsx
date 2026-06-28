import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Sidebar from "./Sidebar";
import type { View } from "../types";

describe("Sidebar", () => {
  const mockNavigate = vi.fn();

  const renderSidebar = (currentView: View = "dashboard") =>
    render(<Sidebar currentView={currentView} onNavigate={mockNavigate} />);

  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("should render the dweb logo/title", () => {
    renderSidebar();
    expect(screen.getByText("dweb")).toBeInTheDocument();
  });

  it("should render all navigation items", () => {
    renderSidebar();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Browser")).toBeInTheDocument();
    expect(screen.getByText("AI Agent")).toBeInTheDocument();
    expect(screen.getByText("Domains")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("should highlight the current view as active", () => {
    renderSidebar("ai-agent");
    const aiAgentBtn = screen.getByTitle("AI Agent");
    expect(aiAgentBtn).toHaveClass("active");

    const dashboardBtn = screen.getByTitle("Dashboard");
    expect(dashboardBtn).not.toHaveClass("active");
  });

  it("should call onNavigate when a nav item is clicked", () => {
    renderSidebar();
    fireEvent.click(screen.getByTitle("Domains"));
    expect(mockNavigate).toHaveBeenCalledWith("domains");

    fireEvent.click(screen.getByTitle("Settings"));
    expect(mockNavigate).toHaveBeenCalledWith("settings");
  });

  it("should collapse when toggle button is clicked", () => {
    renderSidebar();
    const aside = document.querySelector("aside");
    expect(aside).not.toHaveClass("collapsed");

    const toggleBtn = screen.getByRole("button", { name: "" });
    // The Menu button is the toggle
    fireEvent.click(toggleBtn);
    expect(aside).toHaveClass("collapsed");
  });

  it("should hide labels when collapsed", () => {
    renderSidebar();
    const toggleBtn = screen.getByRole("button", { name: "" });
    fireEvent.click(toggleBtn);

    // Labels should be hidden when collapsed
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("AI Agent")).not.toBeInTheDocument();
  });

  it("should show version in footer", () => {
    renderSidebar();
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
  });

  it("should show NEW badge on AI Agent", () => {
    renderSidebar();
    expect(screen.getByText("NEW")).toBeInTheDocument();
  });
});

import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuddyCareAction, WHITECOAT_GP_URL } from "../src/BuddyCareAction";
import { emptyState, execute, validateState } from "care-buddy-shared";

it("renders the fixed WhiteCoat link only for a routine GP handoff", () => {
  const html = renderToStaticMarkup(
    createElement(BuddyCareAction, {
      navigation: "gp",
      onUrgentHelp: () => {},
    }),
  );
  expect(html).toContain(`href="${WHITECOAT_GP_URL}"`);
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain("See a GP on WhiteCoat");
  expect(html).not.toContain("emergency-help instructions");
});

it("offers emergency instructions without a WhiteCoat link", () => {
  const html = renderToStaticMarkup(
    createElement(BuddyCareAction, {
      navigation: "emergency",
      onUrgentHelp: () => {},
    }),
  );
  expect(html).toContain("View emergency-help instructions");
  expect(html).not.toContain(WHITECOAT_GP_URL);
});

it("does not add a GP prompt to an ordinary chat reply", () => {
  expect(
    renderToStaticMarkup(
      createElement(BuddyCareAction, {
        navigation: undefined,
        onUrgentHelp: () => {},
      }),
    ),
  ).toBe("");
});

it.each([
  ["assistant", undefined, true],
  ["assistant", "gp", true],
  ["assistant", "emergency", true],
  ["assistant", "https://untrusted.example", false],
  ["user", "gp", false],
] as const)(
  "validates %s navigation %s as %s",
  (role, careNavigation, valid) => {
    const state = execute(emptyState(), {
      type: "createSelfProfile",
      displayName: "Test person",
      acknowledged: true,
    });
    state.chats = [
      {
        id: "care-message",
        profileId: state.selectedProfileId,
        role,
        text: "Chat reply",
        timestamp: state.now,
        contextId: null,
        careNavigation,
      },
    ] as any;
    expect(validateState(state)).toBe(valid);
  },
);

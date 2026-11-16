import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { colors, fontSize, radii } from "./index.ts";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function themeValue(name: string): string | undefined {
  return css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
}

describe("design tokens", () => {
  it("colors match globals.css", () => {
    for (const [name, value] of Object.entries(colors)) {
      assert.equal(themeValue(`color-${name}`), value, name);
    }
  });

  it("radii match globals.css", () => {
    for (const [name, value] of Object.entries(radii)) {
      assert.equal(themeValue(`radius-${name}`), `${value}px`, name);
    }
  });

  it("font sizes match globals.css", () => {
    for (const [name, value] of Object.entries(fontSize)) {
      assert.equal(themeValue(`text-${name}`), `${value}px`, name);
    }
  });
});

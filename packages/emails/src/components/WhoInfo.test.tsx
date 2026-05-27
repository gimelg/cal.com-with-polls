import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersonInfo } from "./WhoInfo";

describe("PersonInfo", () => {
  it("renders the attendee name for additional invitees in the email who section", () => {
    const html = renderToStaticMarkup(
      <PersonInfo name="Beta Invitee" email="beta@example.com" role="guest" />
    );

    expect(html).toContain("Beta Invitee");
    expect(html).toContain("beta@example.com");
  });

  it("falls back cleanly when only email is available", () => {
    const html = renderToStaticMarkup(<PersonInfo name="   " email="beta@example.com" role="guest" />);

    expect(html).toContain("beta@example.com");
    expect(html).not.toContain(" - guest  <");
  });
});

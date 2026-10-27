import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppLayout } from "../../src/app/AppLayout";
import { bypassesStartupGate } from "../../src/app/startup-gate";
import { ApplicationServicesProvider, type ApplicationServices } from "../../src/app/services";
import { challengeRoute } from "../../src/features/challenge/challenge-routes";

describe("bypassesStartupGate", () => {
  it.each(["/practice", "/practice/pack-1", "/practice/pack-1/ex-1", "/challenge", "/challenge/delivery-time", "/challenge/a/b"])(
    "bypasses %s",
    (path) => expect(bypassesStartupGate(path)).toBe(true),
  );

  it.each(["/", "/learn", "/course/x", "/mission/x", "/challenges", "/challenge-x", "/practices", "/practice-x", "/x/challenge", "/Challenge", ""])(
    "does not bypass %s",
    (path) => expect(bypassesStartupGate(path)).toBe(false),
  );
});

describe("Challenge route table", () => {
  const match = (path: string) =>
    matchRoutes([challengeRoute], path)?.map((m) => m.route.path ?? (m.route.index ? "(index)" : "?"));

  it("matches the listing and the detail path only", () => {
    expect(match("/challenge")).toEqual(["challenge", "(index)"]);
    expect(match("/challenge/delivery-time")).toEqual(["challenge", ":challengeId"]);
    expect(matchRoutes([challengeRoute], "/challenge/delivery-time")?.[1]?.params).toEqual({ challengeId: "delivery-time" });
    expect(match("/challenges")).toBeUndefined();
    expect(match("/challenge/a/b")).toBeUndefined();
    expect(match("/learn")).toBeUndefined();
  });

  it("loads every component lazily", () => {
    for (const route of [challengeRoute, ...(challengeRoute.children ?? [])]) {
      expect(typeof route.lazy).toBe("function");
      expect(route.element).toBeUndefined();
      expect(route.Component).toBeUndefined();
    }
  });
});

describe("AppLayout startup gate", () => {
  const failed = {
    getInitializationState: () => ({ status: "failed", error: new Error("boom") }),
    subscribeInitialization: () => () => undefined,
  } as unknown as ApplicationServices;

  function renderAt(path: string): string {
    return renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(ApplicationServicesProvider, {
          services: failed,
          children: createElement(
            Routes,
            null,
            createElement(
              Route,
              { path: "/", element: createElement(AppLayout) },
              createElement(Route, { path: "*", element: createElement("p", null, "ROUTE-CONTENT") }),
            ),
          ),
        }),
      ),
    );
  }

  it("still shows Challenge and Practice when the CS116 startup failed", () => {
    expect(renderAt("/challenge")).toContain("ROUTE-CONTENT");
    expect(renderAt("/challenge/delivery-time")).toContain("ROUTE-CONTENT");
    expect(renderAt("/practice")).toContain("ROUTE-CONTENT");
  });

  it("keeps blocking unrelated routes, including look-alikes", () => {
    for (const path of ["/learn", "/challenges", "/challenge-x"]) expect(renderAt(path)).not.toContain("ROUTE-CONTENT");
  });

  it("offers a Challenge navigation entry", () => {
    const markup = renderAt("/challenge");
    expect(markup).toContain('href="/challenge"');
    expect(markup).toContain("Thử thách");
  });
});

import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { strings } from "./strings";

type AppRoute = "home" | "health";

type HealthPayload = Readonly<{
  readonly status: "ok";
  readonly service: string;
}>;

type HealthState =
  | Readonly<{ readonly status: "checking" }>
  | Readonly<{ readonly status: "connected"; readonly service: string }>
  | Readonly<{ readonly status: "unavailable" }>;

export function resolveRoute(pathname: string): AppRoute {
  return pathname === "/health" ? "health" : "home";
}

function isHealthPayload(value: unknown): value is HealthPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return payload.status === "ok" && typeof payload.service === "string";
}

export function App(): ReactElement {
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
  const route = resolveRoute(window.location.pathname);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/health", { signal: controller.signal })
      .then(async (response): Promise<unknown> => {
        if (!response.ok) {
          throw new Error(`Health request failed: ${response.status}`);
        }

        return response.json();
      })
      .then((payload: unknown) => {
        if (!isHealthPayload(payload)) {
          throw new Error("Health response has an unexpected shape");
        }

        setHealth({ status: "connected", service: payload.service });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setHealth({ status: "unavailable" });
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            AI
          </span>
          <span>{strings.productName}</span>
        </a>
        <nav aria-label="主导航" className="navigation">
          <a className={route === "home" ? "active" : ""} href="/">
            {strings.navigation.home}
          </a>
          <a className={route === "health" ? "active" : ""} href="/health">
            {strings.navigation.health}
          </a>
        </nav>
      </header>

      <main className="main-content">
        <section className="hero-card" aria-labelledby="page-title">
          <p className="eyebrow">{strings.home.eyebrow}</p>
          <h1 id="page-title">{strings.home.title}</h1>
          <p className="tagline">{strings.tagline}</p>
          <p className="description">{strings.home.description}</p>
        </section>

        <section className="status-card" aria-labelledby="health-title">
          <div>
            <p className="eyebrow">
              {route === "health" ? "HEALTH" : "SYSTEM"}
            </p>
            <h2 id="health-title">{strings.health.title}</h2>
            <p className="description">{strings.health.endpoint}</p>
          </div>
          <div className={`health-state ${health.status}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            <span>
              {health.status === "checking" && strings.health.checking}
              {health.status === "connected" &&
                `${strings.health.connected} · ${health.service}`}
              {health.status === "unavailable" && strings.health.unavailable}
            </span>
          </div>
        </section>
      </main>

      <footer className="site-footer">{strings.footer}</footer>
    </div>
  );
}

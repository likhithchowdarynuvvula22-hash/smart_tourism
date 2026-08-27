import { InternalServerError, BadGatewayError } from "./appError";
import { logger } from "../lib/logger";

export interface HttpRequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  retries?: number; // Maximum retry attempts on transient network / 5xx failure
}

interface CircuitState {
  consecutiveFailures: number;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  openUntil: number;
}

class CircuitBreakerManager {
  private circuits: Map<string, CircuitState> = new Map();
  private readonly threshold = 5;
  private readonly cooldownMs = 30000;

  getHostname(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "unknown";
    }
  }

  isOpen(url: string): boolean {
    const host = this.getHostname(url);
    const circuit = this.circuits.get(host);
    if (!circuit || circuit.state === "CLOSED") return false;

    const now = Date.now();
    if (circuit.state === "OPEN") {
      if (now > circuit.openUntil) {
        circuit.state = "HALF_OPEN";
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(url: string): void {
    const host = this.getHostname(url);
    const circuit = this.circuits.get(host);
    if (circuit) {
      circuit.consecutiveFailures = 0;
      circuit.state = "CLOSED";
    }
  }

  recordFailure(url: string): void {
    const host = this.getHostname(url);
    let circuit = this.circuits.get(host);
    if (!circuit) {
      circuit = { consecutiveFailures: 0, state: "CLOSED", openUntil: 0 };
      this.circuits.set(host, circuit);
    }

    circuit.consecutiveFailures += 1;
    if (circuit.consecutiveFailures >= this.threshold || circuit.state === "HALF_OPEN") {
      circuit.state = "OPEN";
      circuit.openUntil = Date.now() + this.cooldownMs;
      logger.warn(
        { host, consecutiveFailures: circuit.consecutiveFailures, cooldownMs: this.cooldownMs },
        "Circuit breaker tripped OPEN for external provider"
      );
    }
  }

  reset(): void {
    this.circuits.clear();
  }
}

export const circuitBreaker = new CircuitBreakerManager();
export const resetCircuitBreakers = (): void => {
  circuitBreaker.reset();
};

/**
 * Builds URL with query parameters.
 */
export const buildUrl = (
  baseUrl: string,
  params?: Record<string, string | number | boolean | undefined>
): string => {
  if (!params) return baseUrl;

  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
};

/**
 * Strips sensitive query parameters from URLs before logging.
 */
export const sanitizeUrlForLogging = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    const sensitiveKeys = ["key", "apikey", "api_key", "token", "secret", "password"];
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

/**
 * Robust HTTP GET client with explicit timeout, error transformation, bounded retries, and circuit breaker.
 */
export const httpGet = async <T = unknown>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<T> => {
  const { timeoutMs = 5000, headers = {}, params, retries = 1 } = options;
  const fullUrl = buildUrl(url, params);

  if (circuitBreaker.isOpen(fullUrl)) {
    throw new BadGatewayError("External provider is currently unavailable (circuit open)");
  }

  let attempt = 0;
  const maxAttempts = 1 + Math.max(0, retries);

  while (attempt < maxAttempts) {
    attempt++;
    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(fullUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "SIH-Tourism-Platform/1.0 (sih-smart-tourism@gov.in)",
          ...headers
        }
      });

      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        // Do not retry 4xx client errors
        if (response.status >= 400 && response.status < 500) {
          logger.warn(
            { url: sanitizeUrlForLogging(fullUrl), status: response.status, durationMs },
            "External HTTP request failed with 4xx client status"
          );
          throw new BadGatewayError(
            `External provider returned error status ${response.status} (${response.statusText})`
          );
        }

        // 5xx server errors can be retried if attempts remain
        if (attempt < maxAttempts) {
          logger.warn(
            { url: sanitizeUrlForLogging(fullUrl), status: response.status, attempt, maxAttempts },
            "Retrying transient external 5xx failure"
          );
          continue;
        }

        circuitBreaker.recordFailure(fullUrl);
        throw new BadGatewayError(
          `External provider returned error status ${response.status} (${response.statusText})`
        );
      }

      const json = (await response.json()) as T;
      circuitBreaker.recordSuccess(fullUrl);
      logger.debug(
        { url: sanitizeUrlForLogging(fullUrl), status: response.status, durationMs },
        "External HTTP GET succeeded"
      );
      return json;
    } catch (err: unknown) {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      if (err instanceof BadGatewayError) {
        throw err;
      }

      if (err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"))) {
        if (attempt < maxAttempts) {
          logger.warn(
            { url: sanitizeUrlForLogging(fullUrl), timeoutMs, attempt, maxAttempts },
            "Retrying timed out external request"
          );
          continue;
        }
        circuitBreaker.recordFailure(fullUrl);
        logger.error(
          { url: sanitizeUrlForLogging(fullUrl), timeoutMs, durationMs },
          "External provider request timed out"
        );
        throw new BadGatewayError(`External provider timed out after ${timeoutMs}ms`);
      }

      if (attempt < maxAttempts) {
        logger.warn(
          { url: sanitizeUrlForLogging(fullUrl), err, attempt },
          "Retrying failed external network request"
        );
        continue;
      }

      circuitBreaker.recordFailure(fullUrl);
      logger.error(
        { err, url: sanitizeUrlForLogging(fullUrl), durationMs },
        "External HTTP request failed"
      );
      throw new InternalServerError("Failed to communicate with external provider");
    }
  }

  throw new InternalServerError("Failed to communicate with external provider after retries");
};

/**
 * Robust HTTP POST client with explicit timeout and error transformation.
 */
export const httpPost = async <T = unknown>(
  url: string,
  body: unknown,
  options: HttpRequestOptions = {}
): Promise<T> => {
  const { timeoutMs = 5000, headers = {}, params } = options;
  const fullUrl = buildUrl(url, params);

  if (circuitBreaker.isOpen(fullUrl)) {
    throw new BadGatewayError("External provider is currently unavailable (circuit open)");
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(fullUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "SIH-Tourism-Platform/1.0 (sih-smart-tourism@gov.in)",
        ...headers
      },
      body: JSON.stringify(body)
    });

    clearTimeout(timer);
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      circuitBreaker.recordFailure(fullUrl);
      logger.warn(
        { url: sanitizeUrlForLogging(fullUrl), status: response.status, durationMs },
        "External HTTP POST failed with non-2xx status"
      );
      throw new BadGatewayError(
        `External provider returned error status ${response.status} (${response.statusText})`
      );
    }

    const json = (await response.json()) as T;
    circuitBreaker.recordSuccess(fullUrl);
    return json;
  } catch (err: unknown) {
    clearTimeout(timer);
    const durationMs = Date.now() - startTime;

    if (err instanceof BadGatewayError) {
      throw err;
    }

    if (err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"))) {
      circuitBreaker.recordFailure(fullUrl);
      logger.error(
        { url: sanitizeUrlForLogging(fullUrl), timeoutMs, durationMs },
        "External provider request timed out"
      );
      throw new BadGatewayError(`External provider timed out after ${timeoutMs}ms`);
    }

    circuitBreaker.recordFailure(fullUrl);
    logger.error(
      { err, url: sanitizeUrlForLogging(fullUrl), durationMs },
      "External HTTP POST request failed"
    );
    throw new InternalServerError("Failed to communicate with external provider");
  }
};

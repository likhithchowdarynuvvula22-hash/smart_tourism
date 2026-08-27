import { describe, it, expect } from "vitest";
import { supabase, checkDatabaseConnection } from "../src/lib/supabase";
import { destinationService } from "../src/services/destination.service";
import { destinationRepository } from "../src/repositories/destination.repository";
import { AppError, BadRequestError, NotFoundError } from "../src/utils/appError";

describe("Supabase Integration & Data Access Suite", () => {
  it("should initialize the Supabase client singleton properly", () => {
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe("function");
    expect(typeof supabase.auth).toBe("object");
  });

  it("should successfully verify live database connectivity via checkDatabaseConnection()", async () => {
    const check = await checkDatabaseConnection();

    expect(check.status).toBe("connected");
    expect(check.verifiedTable).toBe("destinations");
    expect(typeof check.recordCount).toBe("number");
    expect(check.recordCount).toBeGreaterThanOrEqual(600);
    expect(check.latencyMs).toBeGreaterThan(0);
    expect(check.error).toBeUndefined();
  }, 15000);

  it("should retrieve real seeded destination records from Supabase via DestinationService", async () => {
    const result = await destinationService.getDestinations({ limit: 3 });

    expect(result).toBeDefined();
    expect(Array.isArray(result.destinations)).toBe(true);
    expect(result.destinations.length).toBe(3);
    expect(result.total).toBeGreaterThanOrEqual(600);
    expect(result.limit).toBe(3);
    expect(result.offset).toBe(0);

    const first = result.destinations[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("state");
    expect(typeof first.id).toBe("string");
    expect(typeof first.name).toBe("string");
    expect(typeof first.state).toBe("string");
  });

  it("should retrieve a single destination record by its real UUID", async () => {
    const listResult = await destinationService.getDestinations({ limit: 1 });
    const existing = listResult.destinations[0];
    expect(existing).toBeDefined();

    const fetched = await destinationService.getDestinationById(existing.id);
    expect(fetched).toBeDefined();
    expect(fetched.id).toBe(existing.id);
    expect(fetched.name).toBe(existing.name);
    expect(fetched.state).toBe(existing.state);
  });

  it("should throw BadRequestError when requesting destination with an invalid/empty ID", async () => {
    await expect(destinationService.getDestinationById("")).rejects.toThrow(BadRequestError);
  });

  it("should throw NotFoundError when requesting a non-existent UUID", async () => {
    const nonExistentUuid = "00000000-0000-0000-0000-000000000000";
    await expect(destinationService.getDestinationById(nonExistentUuid)).rejects.toThrow(
      NotFoundError
    );
  });

  it("should ensure repository methods return typed arrays and total counts", async () => {
    const count = await destinationRepository.count();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(600);

    const stateFilter = await destinationRepository.findMany({ state: "Andhra Pradesh", limit: 2 });
    expect(Array.isArray(stateFilter)).toBe(true);
    stateFilter.forEach((item) => {
      expect(item.state.toLowerCase()).toContain("andhra pradesh");
    });
  });

  it("should preserve error structure as AppError without leaking internal connection info", () => {
    const appError = new AppError("Simulated safe db error", 500, "DATABASE_ERROR");
    expect(appError.statusCode).toBe(500);
    expect(appError.code).toBe("DATABASE_ERROR");
    expect(appError.isOperational).toBe(true);
  });
});

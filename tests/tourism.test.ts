import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { destinationService } from "../src/services/destination.service";

describe("Core Tourism Read APIs Suite", () => {
  const app = createApp();
  let sampleDestinationId: string;

  beforeAll(async () => {
    // Retrieve one real destination record for relational tests
    const list = await destinationService.getDestinations({ limit: 1 });
    expect(list.destinations.length).toBeGreaterThan(0);
    sampleDestinationId = list.destinations[0].id;
  });

  describe("Destination Catalog & Search API", () => {
    it("should retrieve a paginated list of destinations with metadata", async () => {
      const response = await request(app).get("/api/v1/destinations?page=1&pageSize=5");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("success", true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(5);
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.pagination).toMatchObject({
        page: 1,
        pageSize: 5,
        hasNextPage: true,
        hasPrevPage: false
      });
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(600);
    });

    it("should support page 2 pagination", async () => {
      const response = await request(app).get("/api/v1/destinations?page=2&pageSize=5");

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(5);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.hasPrevPage).toBe(true);
    });

    it("should filter destinations by state", async () => {
      const response = await request(app).get(
        "/api/v1/destinations?state=Andhra%20Pradesh&pageSize=5"
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((item: { state: string }) => {
        expect(item.state.toLowerCase()).toContain("andhra pradesh");
      });
    });

    it("should search destinations by name or location", async () => {
      const response = await request(app).get("/api/v1/destinations?search=Tirupati");

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      const found = response.body.data.some(
        (item: { name: string; city: string }) =>
          item.name.toLowerCase().includes("tirupati") ||
          (item.city && item.city.toLowerCase().includes("tirupati"))
      );
      expect(found).toBe(true);
    });
  });

  describe("Single Destination Detail API", () => {
    it("should retrieve full destination details for a valid UUID", async () => {
      const response = await request(app).get(`/api/v1/destinations/${sampleDestinationId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(sampleDestinationId);
      expect(response.body.data).toHaveProperty("name");
      expect(response.body.data).toHaveProperty("state");
      expect(response.body.data).toHaveProperty("description");
    });

    it("should return 400 Bad Request for malformed UUID format", async () => {
      const response = await request(app).get("/api/v1/destinations/not-a-valid-uuid-123");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("BAD_REQUEST");
      expect(response.body.error.message).toContain("Must be a valid UUID");
    });

    it("should return 404 Not Found for non-existent valid UUID", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app).get(`/api/v1/destinations/${nonExistentId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("Relational Tourism Information APIs", () => {
    it("should retrieve attractions for a destination", async () => {
      const response = await request(app).get(
        `/api/v1/destinations/${sampleDestinationId}/attractions`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("should retrieve experiences for a destination", async () => {
      const response = await request(app).get(
        `/api/v1/destinations/${sampleDestinationId}/experiences`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("should retrieve opening hours for destination attractions", async () => {
      const response = await request(app).get(
        `/api/v1/destinations/${sampleDestinationId}/opening-hours`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("should retrieve entry fees for destination attractions", async () => {
      const response = await request(app).get(
        `/api/v1/destinations/${sampleDestinationId}/entry-fees`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("should retrieve accessibility features for destination attractions", async () => {
      const response = await request(app).get(
        `/api/v1/destinations/${sampleDestinationId}/accessibility`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("should retrieve elderly support features for destination attractions", async () => {
      const response = await request(app).get(
        `/api/v1/destinations/${sampleDestinationId}/elderly-support`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("should retrieve images for a destination", async () => {
      const response = await request(app).get(`/api/v1/destinations/${sampleDestinationId}/images`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("should retrieve languages for a destination", async () => {
      const response = await request(app).get(
        `/api/v1/destinations/${sampleDestinationId}/languages`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      if (response.body.data) {
        expect(response.body.data).toHaveProperty("destination_id");
      }
    });
  });

  describe("Safety & Emergency APIs", () => {
    it("should retrieve aggregated safety overview for a destination", async () => {
      const response = await request(app).get(`/api/v1/destinations/${sampleDestinationId}/safety`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        destinationId: sampleDestinationId,
        destinationName: expect.any(String),
        state: expect.any(String),
        indicators: expect.any(Array),
        alerts: expect.any(Array),
        incidents: expect.any(Array)
      });
    });

    it("should retrieve emergency resources for a destination", async () => {
      const response = await request(app).get(
        `/api/v1/destinations/${sampleDestinationId}/emergency-resources`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe("Local Businesses API", () => {
    it("should retrieve local businesses in a destination", async () => {
      const response = await request(app).get(
        `/api/v1/destinations/${sampleDestinationId}/businesses`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe("Nested Error Handling", () => {
    it("should return 400 for nested endpoints with invalid UUID", async () => {
      const response = await request(app).get("/api/v1/destinations/invalid-id/attractions");
      expect(response.status).toBe(400);
    });

    it("should return 404 for nested endpoints with non-existent UUID", async () => {
      const nonExistent = "00000000-0000-0000-0000-000000000000";
      const response = await request(app).get(`/api/v1/destinations/${nonExistent}/attractions`);
      expect(response.status).toBe(404);
    });
  });
});

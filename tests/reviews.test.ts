import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";

describe("Destination Reviews & Ratings API Suite", () => {
  const arakuId = "01e98249-049a-4017-a5fb-98b913e05ca5";
  const nonExistentId = "99999999-9999-4999-8999-999999999999";

  it("should retrieve reviews for a valid destination", async () => {
    const res = await request(app)
      .get(`/api/v1/destinations/${arakuId}/reviews`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    
    // Check fields of the review
    const review = res.body.data[0];
    expect(review).toHaveProperty("id");
    expect(review).toHaveProperty("destination_id", arakuId);
    expect(review).toHaveProperty("user_name");
    expect(review).toHaveProperty("rating");
    expect(review).toHaveProperty("comment");
  });

  it("should create a new review and return 201", async () => {
    const newReview = {
      userName: "Test User",
      rating: 5,
      comment: "A beautiful testing experience."
    };

    const res = await request(app)
      .post(`/api/v1/destinations/${arakuId}/reviews`)
      .send(newReview)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("id");
    expect(res.body.data).toHaveProperty("user_name", newReview.userName);
    expect(res.body.data).toHaveProperty("rating", newReview.rating);
    expect(res.body.data).toHaveProperty("comment", newReview.comment);
  });

  it("should fail to create a review with invalid rating", async () => {
    const badReview = {
      userName: "Test User",
      rating: 6, // Invalid rating
      comment: "Too high rating"
    };

    const res = await request(app)
      .post(`/api/v1/destinations/${arakuId}/reviews`)
      .send(badReview)
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it("should return 404 for reviews of non-existent destination", async () => {
    await request(app)
      .get(`/api/v1/destinations/${nonExistentId}/reviews`)
      .expect(404);
  });
});

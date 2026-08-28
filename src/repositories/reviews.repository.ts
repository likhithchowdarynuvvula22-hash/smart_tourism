import { supabase } from "../lib/supabase";
import { InternalServerError } from "../utils/appError";
import { logger } from "../lib/logger";

export interface DestinationReviewRow {
  id: string;
  destination_id: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export class ReviewsRepository {
  /**
   * Fetches reviews for a destination.
   */
  async findByDestinationId(destinationId: string): Promise<DestinationReviewRow[]> {
    const { data, error } = await supabase
      .from("destination_reviews")
      .select("*")
      .eq("destination_id", destinationId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error({ error, destinationId }, "Error querying destination reviews from repository");
      throw new InternalServerError("Failed to query reviews from database");
    }

    return data || [];
  }

  /**
   * Inserts a new review for a destination.
   */
  async create(destinationId: string, userName: string, rating: number, comment: string): Promise<DestinationReviewRow> {
    const { data, error } = await supabase
      .from("destination_reviews")
      .insert({
        destination_id: destinationId,
        user_name: userName,
        rating,
        comment
      })
      .select("*")
      .single();

    if (error) {
      logger.error({ error, destinationId, userName }, "Error inserting review into repository");
      throw new InternalServerError("Failed to save review to database");
    }

    return data;
  }
}

export const reviewsRepository = new ReviewsRepository();

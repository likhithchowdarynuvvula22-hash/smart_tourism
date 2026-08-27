import {
  destinationRepository,
  DestinationRepository,
  DestinationQueryOptions
} from "../repositories/destination.repository";
import { DestinationRow } from "../types/database.types";
import { BadRequestError, NotFoundError } from "../utils/appError";
import { logger } from "../lib/logger";

export interface GetDestinationsResult {
  destinations: DestinationRow[];
  total: number;
  limit: number;
  offset: number;
}

export class DestinationService {
  constructor(private readonly repo: DestinationRepository = destinationRepository) {}

  /**
   * Retrieves a verified list of destinations with pagination.
   */
  async getDestinations(options: DestinationQueryOptions = {}): Promise<GetDestinationsResult> {
    const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 100);
    const offset = Math.max(Number(options.offset) || 0, 0);

    const [destinations, total] = await Promise.all([
      this.repo.findMany({ limit, offset, state: options.state }),
      this.repo.count()
    ]);

    logger.debug(
      { count: destinations.length, total, limit, offset },
      "Retrieved destination records from Supabase"
    );

    return {
      destinations,
      total,
      limit,
      offset
    };
  }

  /**
   * Retrieves a single destination record by ID.
   */
  async getDestinationById(id: string): Promise<DestinationRow> {
    if (!id || typeof id !== "string" || id.trim().length === 0) {
      throw new BadRequestError("Valid destination ID is required");
    }

    const destination = await this.repo.findById(id);

    if (!destination) {
      throw new NotFoundError(`Destination with ID '${id}' not found`);
    }

    return destination;
  }

  /**
   * Returns total count of destinations.
   */
  async getTotalDestinationsCount(): Promise<number> {
    return this.repo.count();
  }
}

export const destinationService = new DestinationService();

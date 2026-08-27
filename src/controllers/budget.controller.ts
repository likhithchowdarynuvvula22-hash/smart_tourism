import { Request, Response, NextFunction } from "express";
import { budgetService, BudgetService } from "../services/budget/budget.service";
import { BudgetQueryOptions } from "../types/budget";

export class BudgetController {
  constructor(private readonly service: BudgetService = budgetService) {}

  /**
   * GET /api/v1/budget/destinations/:id
   * Public endpoint to retrieve grounded destination budget and cost breakdown.
   */
  getDestinationBudget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const {
        userBudget,
        currency,
        adults,
        seniors,
        children,
        students,
        foreignAdults,
        durationDays
      } = req.query;

      const options: BudgetQueryOptions = {
        userBudget: userBudget ? Number(userBudget) : undefined,
        currency: currency ? String(currency) : undefined,
        adults: adults ? Number(adults) : undefined,
        seniors: seniors ? Number(seniors) : undefined,
        children: children ? Number(children) : undefined,
        students: students ? Number(students) : undefined,
        foreignAdults: foreignAdults ? Number(foreignAdults) : undefined,
        durationDays: durationDays ? Number(durationDays) : undefined
      };

      const userId = (req as { user?: { id?: string } }).user?.id;
      const result = await this.service.getDestinationBudget(id, options, userId);

      res.status(200).json({
        status: "success",
        data: result
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/budget/destinations/:id/fees
   * Public endpoint to retrieve attraction entry fee catalog for a destination.
   */
  getAttractionFees = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const fees = await this.service.getAttractionFees(id);

      res.status(200).json({
        status: "success",
        data: fees
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/budget/calculate
   * Public/Authenticated calculation of custom multi-place budget.
   */
  calculateCustomBudget = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = (req as { user?: { id?: string } }).user?.id;
      const result = await this.service.calculateCustomBudget(req.body, userId);

      res.status(200).json({
        status: "success",
        data: result
      });
    } catch (err) {
      next(err);
    }
  };
}

export const budgetController = new BudgetController();

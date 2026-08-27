import { Response } from "express";
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
  PaginationMeta
} from "../types/api";

export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  message?: string
): Response<ApiSuccessResponse<T>> => {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    ...(message ? { message } : {}),
    data
  };
  return res.status(statusCode).json(payload);
};

export const sendPaginatedSuccess = <T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  statusCode: number = 200,
  message?: string
): Response<ApiPaginatedResponse<T>> => {
  const payload: ApiPaginatedResponse<T> = {
    success: true,
    ...(message ? { message } : {}),
    data,
    pagination
  };
  return res.status(statusCode).json(payload);
};

export const sendError = (
  res: Response,
  message: string,
  statusCode: number = 500,
  code: string = "INTERNAL_SERVER_ERROR",
  details?: unknown,
  stack?: string
): Response<ApiErrorResponse> => {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(stack ? { stack } : {})
    }
  };
  return res.status(statusCode).json(payload);
};

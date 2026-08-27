export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message?: string;
  data: T;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ApiPaginatedResponse<T = unknown> {
  success: true;
  message?: string;
  data: T[];
  pagination: PaginationMeta;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[] | unknown;
    stack?: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface HealthCheckData {
  status: "healthy" | "degraded" | "unhealthy";
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  service: string;
  version: string;
  database?: DatabaseHealthData;
}

export interface DatabaseHealthData {
  status: "connected" | "error";
  verifiedTable: string;
  recordCount: number;
  latencyMs: number;
  error?: string;
}

import { AIProvider } from "./ai.provider";
import { httpPost } from "../../../utils/httpClient";
import { BadGatewayError, InternalServerError } from "../../../utils/appError";
import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";

interface GeminiPart {
  text: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export class GeminiAIProvider implements AIProvider {
  readonly providerName = "Google Gemini";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || env.GEMINI_API_KEY;
    this.model = model || env.AI_MODEL_NAME;
    this.baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  private checkKey(): string {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw new BadGatewayError("GEMINI_API_KEY is not configured on the server");
    }
    return this.apiKey;
  }

  async generateStructuredResponse<T>(prompt: string, systemInstruction?: string): Promise<T> {
    const key = this.checkKey();
    const url = `${this.baseUrl}?key=${key}`;

    const body: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
        temperature: 0.2
      }
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    try {
      const raw = await httpPost<GeminiResponse>(url, body, { timeoutMs: 10000 });

      if (raw.error) {
        logger.error({ error: raw.error }, "Gemini API returned error response");
        throw new BadGatewayError(`Gemini API error: ${raw.error.message}`);
      }

      const candidateText = raw.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) {
        throw new BadGatewayError("Gemini API returned empty response candidates");
      }

      return JSON.parse(candidateText) as T;
    } catch (err: unknown) {
      if (err instanceof BadGatewayError) throw err;
      logger.error({ err }, "Failed to generate structured response from Gemini");
      throw new InternalServerError("Failed to parse AI provider response");
    }
  }

  async generateText(prompt: string, systemInstruction?: string): Promise<string> {
    const key = this.checkKey();
    const url = `${this.baseUrl}?key=${key}`;

    const body: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
        temperature: 0.2
      }
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const raw = await httpPost<GeminiResponse>(url, body, { timeoutMs: 10000 });
    const candidateText = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new BadGatewayError("Gemini API returned empty text response");
    }
    return candidateText;
  }
}

export const geminiAIProvider = new GeminiAIProvider();

export interface AIProvider {
  readonly providerName: string;
  generateStructuredResponse<T>(
    prompt: string,
    systemInstruction?: string,
    schema?: unknown
  ): Promise<T>;
  generateText(prompt: string, systemInstruction?: string): Promise<string>;
}

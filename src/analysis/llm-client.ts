/**
 * LLM client for running analysis
 * For MVP, this outputs the prompt to a file for manual analysis
 * In production, this would call an LLM API (OpenAI, Anthropic, etc.)
 */

import fs from 'fs/promises';
import path from 'path';

export interface LLMResponse {
  content: string;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * LLM client interface
 */
export interface LLMClient {
  analyze(prompt: string): Promise<LLMResponse>;
}

/**
 * File-based LLM client for MVP
 * Outputs prompts to files for manual analysis in IDE
 */
export class FileLLMClient implements LLMClient {
  constructor(private readonly outputDir: string) {}

  /**
   * "Analyze" by saving the prompt to a file
   * Returns instructions for manual analysis
   */
  async analyze(prompt: string): Promise<LLMResponse> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `analysis-prompt-${timestamp}.md`;
    const filepath = path.join(this.outputDir, filename);

    await fs.writeFile(filepath, prompt, 'utf-8');

    const instructions = `
# Manual Analysis Required

The analysis prompt has been saved to:
${filepath}

## Next Steps:

1. Open the file in your IDE
2. Copy the entire prompt
3. Paste it into your preferred LLM:
   - ChatGPT (GPT-4 recommended)
   - Claude (Opus or Sonnet)
   - Or any other LLM with long context support

4. Copy the LLM's response
5. Save it as: ${filepath.replace('-prompt-', '-result-')}

## Future Enhancement

In production, this will automatically call an LLM API and return results programmatically.
    `.trim();

    return {
      content: instructions,
      model: 'manual',
    };
  }
}

/**
 * API-based LLM client (for future use)
 * This would integrate with OpenAI, Anthropic, or other LLM providers
 */
export class APILLMClient implements LLMClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'gpt-4'
  ) {}

  async analyze(prompt: string): Promise<LLMResponse> {
    // TODO: Implement actual API calls
    // Example for OpenAI:
    // const response = await fetch('https://api.openai.com/v1/chat/completions', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${this.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     model: this.model,
    //     messages: [{ role: 'user', content: prompt }],
    //   }),
    // });

    throw new Error('API LLM client not yet implemented. Use FileLLMClient for MVP.');
  }
}




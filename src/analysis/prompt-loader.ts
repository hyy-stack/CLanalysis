import fs from 'fs/promises';
import path from 'path';

/**
 * Load and manage analysis prompts from markdown files
 */
export class PromptLoader {
  constructor(private readonly promptsDir: string) {}

  /**
   * Load a prompt template from a markdown file
   */
  async loadPrompt(filename: string): Promise<string> {
    const promptPath = path.join(this.promptsDir, filename);
    
    try {
      const content = await fs.readFile(promptPath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to load prompt from ${promptPath}: ${(error as Error).message}`);
    }
  }

  /**
   * Load the deal loss analysis prompt
   */
  async loadDealLossAnalysisPrompt(): Promise<string> {
    return this.loadPrompt('deal-loss-analysis.md');
  }

  /**
   * Load the customer sentiment analysis prompt
   */
  async loadCustomerSentimentPrompt(): Promise<string> {
    return this.loadPrompt('customer-sentiment.md');
  }

  /**
   * Load the active deal analysis prompt
   */
  async loadActiveDealAnalysisPrompt(): Promise<string> {
    return this.loadPrompt('active-deal-analysis.md');
  }

  /**
   * List all available prompts
   */
  async listPrompts(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.promptsDir);
      return files.filter(file => file.endsWith('.md'));
    } catch (error) {
      console.error('Failed to list prompts:', error);
      return [];
    }
  }
}

/**
 * Replace placeholders in a prompt template with actual data
 */
export function fillPromptTemplate(
  template: string,
  data: Record<string, string>
): string {
  let result = template;
  
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  }
  
  return result;
}


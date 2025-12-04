import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude API client for deal analysis
 */

export interface ClaudeAnalysisResult {
  execSummary: string;
  nextSteps: string;
  details: any;
  fullResponse: string;
}

export class ClaudeClient {
  private client: Anthropic;
  
  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
    });
  }

  /**
   * Analyze with a prompt and context
   * @param fullPrompt - Complete prompt with context filled in
   * @returns Parsed analysis result
   */
  async analyze(fullPrompt: string): Promise<ClaudeAnalysisResult> {
    console.log('[Claude] Sending analysis request...');
    console.log(`[Claude] Prompt length: ${fullPrompt.length} chars`);
    
    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
    });
    
    const response = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';
    
    console.log(`[Claude] Response length: ${response.length} chars`);
    
    // Parse the response
    const parsed = this.parseResponse(response);
    
    return {
      ...parsed,
      fullResponse: response,
    };
  }

  /**
   * Parse Claude's markdown response into structured sections
   * Looks for common headers and extracts content
   */
  private parseResponse(markdown: string): Omit<ClaudeAnalysisResult, 'fullResponse'> {
    // Extract executive summary
    const execSummaryMatch = markdown.match(/###?\s*Executive Summary[\s\S]*?\n\n([\s\S]*?)(?=\n###|$)/i);
    const execSummary = execSummaryMatch ? execSummaryMatch[1].trim() : '';
    
    // Extract next steps / recommendations
    const nextStepsMatch = markdown.match(/###?\s*(?:Next Steps|Recommendations|Critical Recommendations)[\s\S]*?\n\n([\s\S]*?)(?=\n###|$)/i);
    const nextSteps = nextStepsMatch ? nextStepsMatch[1].trim() : '';
    
    // Store full response as details
    const details = {
      fullText: markdown,
      sections: this.extractSections(markdown),
    };
    
    return {
      execSummary: execSummary || markdown.substring(0, 500),
      nextSteps: nextSteps || 'See full analysis for details',
      details,
    };
  }

  /**
   * Extract all sections from markdown for structured storage
   */
  private extractSections(markdown: string): Record<string, string> {
    const sections: Record<string, string> = {};
    
    // Split by headers (###)
    const parts = markdown.split(/\n###\s+/);
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const firstNewline = part.indexOf('\n');
      
      if (firstNewline > 0) {
        const header = part.substring(0, firstNewline).trim();
        const content = part.substring(firstNewline + 1).trim();
        sections[header] = content;
      }
    }
    
    return sections;
  }
}


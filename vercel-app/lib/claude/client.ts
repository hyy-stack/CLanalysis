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
    // Extract executive summary - capture everything from "Executive Summary" until "Next Steps" or similar
    // This includes subsections like "Deal Health Assessment" that are formatted as ### headers
    // but are actually part of the Executive Summary section
    const nextSectionPattern = /\n###?\s*(?:Next Steps|Recommendations|Critical Recommendations|Key Learnings)/i;
    const nextSectionMatch = markdown.match(nextSectionPattern);
    const execSummaryHeaderMatch = markdown.match(/###?\s*Executive Summary/i);
    
    let execSummary = '';
    
    if (execSummaryHeaderMatch) {
      const startIndex = execSummaryHeaderMatch.index! + execSummaryHeaderMatch[0].length;
      const endIndex = nextSectionMatch ? nextSectionMatch.index! : markdown.length;
      
      // Extract everything from after "Executive Summary" header until next major section
      execSummary = markdown.substring(startIndex, endIndex).trim();
      
      // Remove leading newlines/whitespace
      execSummary = execSummary.replace(/^\s*\n+/, '').trim();
    }
    
    // Fallback: if extraction failed, try sections
    if (!execSummary || execSummary.length < 100) {
      const sections = this.extractSections(markdown);
      if (sections['Executive Summary']) {
        execSummary = sections['Executive Summary'];
      }
    }
    
    // Extract next steps / recommendations - improved regex
    const nextStepsMatch = markdown.match(/###?\s*(?:Next Steps|Recommendations|Critical Recommendations|Key Learnings)[\s\S]*?\n\n([\s\S]*?)(?=\n###\s+(?!.*\n##)|$)/i);
    let nextSteps = nextStepsMatch ? nextStepsMatch[1].trim() : '';
    
    // If regex didn't match, try sections
    if (!nextSteps || nextSteps.length < 50) {
      const sections = this.extractSections(markdown);
      if (sections['Next Steps'] || sections['Recommendations'] || sections['Critical Recommendations']) {
        nextSteps = sections['Next Steps'] || sections['Recommendations'] || sections['Critical Recommendations'];
      }
    }
    
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


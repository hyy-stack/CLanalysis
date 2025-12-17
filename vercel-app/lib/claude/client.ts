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
    console.log(`[Claude] Response preview (first 500 chars): ${response.substring(0, 500)}`);
    console.log(`[Claude] Response preview (last 500 chars): ${response.substring(Math.max(0, response.length - 500))}`);
    
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
    
    // Find the start of Executive Summary section
    const execSummaryHeaderMatch = markdown.match(/###?\s*Executive Summary/i);
    
    // Find the start of the next major section (Next Steps, Recommendations, etc.)
    // Look for these headers that come AFTER Executive Summary
    const nextSectionHeaders = [
      'Next Steps',
      'Recommendations', 
      'Critical Recommendations',
      'Key Learnings',
      'Critical Recommendations',
      'Timeline Assessment',
      'Competitive Landscape',
      'Objections & Concerns',
      'Customer Sentiment Evolution',
      'Critical Recommendations',
      'Deal Forecast'
    ];
    
    let execSummary = '';
    let endIndex = markdown.length;
    
    if (execSummaryHeaderMatch) {
      const startIndex = execSummaryHeaderMatch.index! + execSummaryHeaderMatch[0].length;
      
      // Find the earliest occurrence of any "next section" header after Executive Summary
      for (const header of nextSectionHeaders) {
        const pattern = new RegExp(`\\n###?\\s*${header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        const match = markdown.substring(startIndex).match(pattern);
        if (match && match.index !== undefined) {
          const candidateEnd = startIndex + match.index;
          if (candidateEnd < endIndex) {
            endIndex = candidateEnd;
          }
        }
      }
      
      // Extract everything from after "Executive Summary" header until next major section
      execSummary = markdown.substring(startIndex, endIndex).trim();
      
      // Remove leading newlines/whitespace
      execSummary = execSummary.replace(/^\s*\n+/, '').trim();
      
      console.log(`[Claude] Extracted exec summary: ${execSummary.length} chars (start: ${startIndex}, end: ${endIndex})`);
      console.log(`[Claude] Exec summary preview (first 300 chars): ${execSummary.substring(0, 300)}`);
      console.log(`[Claude] Exec summary preview (last 300 chars): ${execSummary.substring(Math.max(0, execSummary.length - 300))}`);
    }
    
    // Fallback: if extraction failed or seems too short, try a more aggressive approach
    if (!execSummary || execSummary.length < 200) {
      console.log(`[Claude] Exec summary too short (${execSummary.length} chars), trying fallback extraction`);
      
      // Try extracting everything before common "next section" headers
      const beforeNextSteps = markdown.split(/\n###?\s*(?:Next Steps|Recommendations|Critical Recommendations|Key Learnings)/i)[0];
      if (beforeNextSteps) {
        const afterHeader = beforeNextSteps.split(/###?\s*Executive Summary/i)[1];
        if (afterHeader && afterHeader.length > execSummary.length) {
          execSummary = afterHeader.replace(/^[\s\S]*?\n\n/, '').trim();
          console.log(`[Claude] Fallback extraction: ${execSummary.length} chars`);
        }
      }
      
      // Last resort: try sections
      if (!execSummary || execSummary.length < 200) {
        const sections = this.extractSections(markdown);
        if (sections['Executive Summary'] && sections['Executive Summary'].length > execSummary.length) {
          execSummary = sections['Executive Summary'];
          console.log(`[Claude] Using sections extraction: ${execSummary.length} chars`);
        }
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
    
    // Final safety check: if exec summary seems incomplete (less than 500 chars), 
    // use a more aggressive extraction - everything from Executive Summary to end, 
    // then let Next Steps extraction handle its own section
    if (execSummary.length < 500) {
      console.log(`[Claude] Exec summary seems incomplete (${execSummary.length} chars), trying aggressive extraction`);
      const execHeaderIndex = markdown.indexOf('### Executive Summary');
      if (execHeaderIndex >= 0) {
        // Get everything from Executive Summary to the end, then we'll extract Next Steps separately
        const fromExecSummary = markdown.substring(execHeaderIndex);
        // Remove the header line itself
        const withoutHeader = fromExecSummary.replace(/^###\s*Executive Summary\s*/i, '').trim();
        // If this is longer than what we extracted, use it (but still try to stop at Next Steps if found)
        if (withoutHeader.length > execSummary.length) {
          const nextStepsIndex = withoutHeader.search(/\n###\s*(?:Next Steps|Recommendations|Critical Recommendations|Key Learnings)/i);
          if (nextStepsIndex > 0) {
            execSummary = withoutHeader.substring(0, nextStepsIndex).trim();
          } else {
            execSummary = withoutHeader;
          }
          console.log(`[Claude] Aggressive extraction: ${execSummary.length} chars`);
        }
      }
    }
    
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


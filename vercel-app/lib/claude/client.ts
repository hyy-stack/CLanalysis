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
   * Send a system + user prompt to Claude and return raw text output.
   * Used by the coaching pipeline — does NOT parse for specific headers.
   */
  async analyzeRaw(systemPrompt: string, userPrompt: string): Promise<string> {
    console.log('[Claude] Sending raw coaching request...');
    console.log(`[Claude] System prompt length: ${systemPrompt.length} chars`);
    console.log(`[Claude] User prompt length: ${userPrompt.length} chars`);

    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const response = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    console.log(`[Claude] Raw response length: ${response.length} chars`);
    return response;
  }

  /**
   * Parse Claude's markdown response into structured sections
   * Looks for common headers and extracts content
   */
  private parseResponse(markdown: string): Omit<ClaudeAnalysisResult, 'fullResponse'> {
    // Strip any JSON block at the start of the response (used by CoM Enhanced prompt for structured data)
    const jsonBlockMatch = markdown.match(/^```json\s*[\s\S]*?```\s*/);
    if (jsonBlockMatch) {
      markdown = markdown.substring(jsonBlockMatch[0].length).trim();
      console.log(`[Claude] Stripped JSON block (${jsonBlockMatch[0].length} chars) from response`);
    }

    // Extract executive summary - capture everything from "Executive Summary" until "Next Steps" or similar
    // This includes subsections like "Deal Health Assessment" that are formatted as ### headers
    // but are actually part of the Executive Summary section

    // Debug: Log all headers found in the response
    const allHeaders = markdown.match(/^#{1,3}\s+.+$/gm) || [];
    console.log(`[Claude] Found ${allHeaders.length} headers in response:`, allHeaders.slice(0, 10));
    
    // Find the start of Executive Summary section - try multiple formats
    // Also recognize that the first major section IS the executive summary, even if not labeled as such
    let execSummaryHeaderMatch = markdown.match(/^#{1,3}\s*Executive Summary/i);
    if (!execSummaryHeaderMatch) {
      execSummaryHeaderMatch = markdown.match(/###?\s*Executive Summary/i);
    }
    if (!execSummaryHeaderMatch) {
      execSummaryHeaderMatch = markdown.match(/##\s*Executive Summary/i);
    }
    if (!execSummaryHeaderMatch) {
      execSummaryHeaderMatch = markdown.match(/#\s*Executive Summary/i);
    }
    
    // If no "Executive Summary" header found, treat the first major section as the exec summary
    // This handles cases where Claude uses "Active Deal Health Analysis" or similar as the first section
    if (!execSummaryHeaderMatch) {
      const firstHeaderMatch = markdown.match(/^#{1,2}\s+.+$/m);
      if (firstHeaderMatch) {
        execSummaryHeaderMatch = firstHeaderMatch;
        console.log(`[Claude] No "Executive Summary" header found, using first major section: "${firstHeaderMatch[0]}"`);
      }
    }
    
    console.log(`[Claude] Executive Summary header match:`, execSummaryHeaderMatch ? `Found at index ${execSummaryHeaderMatch.index}: "${execSummaryHeaderMatch[0]}"` : 'NOT FOUND');
    
    // Find the start of the next major section (Next Steps, Recommendations, etc.)
    // Look for these headers that come AFTER Executive Summary
    // Note: For CoM Enhanced prompt, exec summary should include everything up to Current Next Steps/Untapped Opportunities
    const nextSectionHeaders = [
      'Current Next Steps',
      'Untapped Opportunities',
      'Next Steps',
      'Recommendations',
      'Critical Recommendations',
      'Timeline Assessment',
      'Competitive Landscape',
      'Objections & Concerns',
      'Customer Sentiment Evolution',
      'Deal Forecast'
    ];
    
    let execSummary = '';
    let endIndex = markdown.length;
    
    if (execSummaryHeaderMatch) {
      const startIndex = execSummaryHeaderMatch.index! + execSummaryHeaderMatch[0].length;
      
      // Find the earliest occurrence of any "next section" header after Executive Summary
      for (const header of nextSectionHeaders) {
        // Try multiple header formats for next section
        const patterns = [
          new RegExp(`\\n#{1,3}\\s*${header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
          new RegExp(`^#{1,3}\\s*${header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'im'),
        ];
        
        for (const pattern of patterns) {
          const match = markdown.substring(startIndex).match(pattern);
          if (match && match.index !== undefined) {
            const candidateEnd = startIndex + match.index;
            if (candidateEnd < endIndex) {
              endIndex = candidateEnd;
            }
          }
        }
      }
      
      // Extract everything from after the header until next major section
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
      
      // Try extracting everything before common "next section" headers - try multiple header formats
      const nextStepsPatterns = [
        /\n#{1,3}\s*(?:Next Steps|Recommendations|Critical Recommendations|Key Learnings)/i,
        /^#{1,3}\s*(?:Next Steps|Recommendations|Critical Recommendations|Key Learnings)/im,
      ];
      
      let beforeNextSteps = markdown;
      for (const pattern of nextStepsPatterns) {
        const split = markdown.split(pattern);
        if (split.length > 1 && split[0].length < beforeNextSteps.length) {
          beforeNextSteps = split[0];
        }
      }
      
      if (beforeNextSteps && beforeNextSteps.length > 0) {
        // Try to find Executive Summary header in various formats
        const execPatterns = [
          /#{1,3}\s*Executive Summary/i,
          /Executive Summary/i,
        ];
        
        for (const pattern of execPatterns) {
          const match = beforeNextSteps.match(pattern);
          if (match) {
            const startIdx = match.index! + match[0].length;
            const extracted = beforeNextSteps.substring(startIdx).trim();
            if (extracted.length > execSummary.length) {
              execSummary = extracted.replace(/^\s*\n+/, '').trim();
              console.log(`[Claude] Fallback extraction (pattern ${pattern}): ${execSummary.length} chars`);
              break;
            }
          }
        }
        
        // If still no exec summary, just take everything from the start (might be the whole response before Next Steps)
        if (!execSummary || execSummary.length < 200) {
          // Remove any leading headers/titles
          const cleaned = beforeNextSteps.replace(/^#{1,3}\s*[^\n]+\n+/m, '').trim();
          if (cleaned.length > execSummary.length && cleaned.length > 200) {
            execSummary = cleaned;
            console.log(`[Claude] Fallback: using everything before Next Steps: ${execSummary.length} chars`);
          }
        }
      }
      
      // Last resort: try sections
      if (!execSummary || execSummary.length < 200) {
        const sections = this.extractSections(markdown);
        console.log(`[Claude] Available sections:`, Object.keys(sections));
        if (sections['Executive Summary'] && sections['Executive Summary'].length > execSummary.length) {
          execSummary = sections['Executive Summary'];
          console.log(`[Claude] Using sections extraction: ${execSummary.length} chars`);
        }
      }
    }
    
    // Extract next steps / recommendations - improved regex
    // Includes CoM Enhanced prompt sections: "Current Next Steps" and "Untapped Opportunities"
    const nextStepsMatch = markdown.match(/###?\s*(?:Current Next Steps|Untapped Opportunities|Next Steps|Recommendations|Critical Recommendations)[\s\S]*?\n\n([\s\S]*?)(?=\n###\s+(?!.*\n##)|$)/i);
    let nextSteps = nextStepsMatch ? nextStepsMatch[1].trim() : '';

    // If regex didn't match, try sections
    if (!nextSteps || nextSteps.length < 50) {
      const sections = this.extractSections(markdown);
      // Try CoM Enhanced sections first, then fall back to standard sections
      nextSteps = sections['Current Next Steps'] ||
                  sections['Untapped Opportunities'] ||
                  sections['Next Steps'] ||
                  sections['Recommendations'] ||
                  sections['Critical Recommendations'] ||
                  '';
    }

    // For CoM Enhanced, try to combine Current Next Steps and Untapped Opportunities
    if (nextSteps.length < 100) {
      const sections = this.extractSections(markdown);
      const currentNextSteps = sections['Current Next Steps'] || '';
      const untappedOpps = sections['Untapped Opportunities'] || '';
      if (currentNextSteps || untappedOpps) {
        nextSteps = '';
        if (currentNextSteps) {
          nextSteps += `*Current Next Steps:*\n${currentNextSteps}\n\n`;
        }
        if (untappedOpps) {
          nextSteps += `*Untapped Opportunities:*\n${untappedOpps}`;
        }
        nextSteps = nextSteps.trim();
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
      
      // Try multiple formats to find Executive Summary
      const execHeaderPatterns = [
        /###\s*Executive Summary/i,
        /##\s*Executive Summary/i,
        /#\s*Executive Summary/i,
        /Executive Summary/i,
      ];
      
      for (const pattern of execHeaderPatterns) {
        const match = markdown.match(pattern);
        if (match) {
          const execHeaderIndex = match.index!;
          // Get everything from Executive Summary to the end, then we'll extract Next Steps separately
          const fromExecSummary = markdown.substring(execHeaderIndex);
          // Remove the header line itself
          const withoutHeader = fromExecSummary.replace(/^#{1,3}\s*Executive Summary\s*/i, '').trim();
          // If this is longer than what we extracted, use it (but still try to stop at Next Steps if found)
          if (withoutHeader.length > execSummary.length) {
            const nextStepsIndex = withoutHeader.search(/\n#{1,3}\s*(?:Next Steps|Recommendations|Critical Recommendations|Key Learnings)/i);
            if (nextStepsIndex > 0) {
              execSummary = withoutHeader.substring(0, nextStepsIndex).trim();
            } else {
              execSummary = withoutHeader;
            }
            console.log(`[Claude] Aggressive extraction (pattern ${pattern}): ${execSummary.length} chars`);
            break;
          }
        }
      }
    }
    
    // Ultimate fallback: if we still have nothing meaningful, use the first substantial chunk
    // But try to stop before Next Steps if we can find it
    if (!execSummary || execSummary.length < 200) {
      console.log(`[Claude] Ultimate fallback: using first part of response`);
      const nextStepsMatch = markdown.match(/\n#{1,3}\s*(?:Next Steps|Recommendations|Critical Recommendations|Key Learnings)/i);
      if (nextStepsMatch && nextStepsMatch.index! > 500) {
        execSummary = markdown.substring(0, nextStepsMatch.index!).trim();
      } else {
        execSummary = markdown.substring(0, Math.min(3000, markdown.length)).trim();
      }
      console.log(`[Claude] Ultimate fallback result: ${execSummary.length} chars`);
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


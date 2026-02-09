/**
 * report_issue tool
 * Get instructions for reporting bugs/issues in this MCP server
 */

import { z } from 'zod';
import { ToolResponse } from '../types.js';

/**
 * Input schema for report_issue
 */
export const ReportIssueSchema = z.object({
  issueType: z
    .enum(['bug', 'feature', 'question', 'documentation'])
    .optional()
    .describe('Type of issue to report (default: bug)'),
});

export type ReportIssueInput = z.infer<typeof ReportIssueSchema>;

/**
 * Report issue (provides instructions)
 */
export async function reportIssue(input: ReportIssueInput): Promise<ToolResponse> {
  const params = ReportIssueSchema.parse(input);
  const issueType = params.issueType || 'bug';

  const templates = {
    bug: {
      title: '🐛 Bug Report',
      labels: ['bug'],
      template: `**Describe the bug**
A clear description of what the bug is.

**Tool affected**
Which tool is causing the issue? (e.g., create_pr, get_pr, etc.)

**To Reproduce**
Steps to reproduce:
1. Call tool with: ...
2. Expected: ...
3. Got: ...

**Environment**
- MCP Client: [e.g., Claude Desktop, OpenClaw]
- Version: [e.g., 0.1.0]
- Azure DevOps: [e.g., Cloud, Server 2022]

**Additional context**
Any other relevant information.`,
    },
    feature: {
      title: '✨ Feature Request',
      labels: ['enhancement'],
      template: `**Describe the feature**
What would you like to see added?

**Use case**
Why is this feature important? What problem does it solve?

**Proposed solution**
How do you envision this working?

**Alternatives considered**
Any alternative approaches you've thought of?`,
    },
    question: {
      title: '❓ Question',
      labels: ['question'],
      template: `**Your question**
What would you like to know?

**What you've tried**
What have you already attempted or researched?

**Context**
Any additional context that might help.`,
    },
    documentation: {
      title: '📚 Documentation Issue',
      labels: ['documentation'],
      template: `**What's unclear or missing?**
Which part of the documentation needs improvement?

**Suggested improvement**
How could it be better explained?

**Affected pages**
Links or sections that need updating.`,
    },
  };

  const template = templates[issueType];
  const repoUrl = 'https://github.com/om-surushe/efficient-ado';
  const issuesUrl = `${repoUrl}/issues/new`;

  // Build label parameter for URL
  const labelParam = template.labels.join(',');
  const issueUrlWithTemplate = `${issuesUrl}?labels=${labelParam}&template=${issueType}.md`;

  return {
    success: true,
    data: {
      issueType,
      title: template.title,
      repository: repoUrl,
      issuesUrl,
      directUrl: issueUrlWithTemplate,
      template: template.template,
      instructions: [
        `1. Visit: ${issuesUrl}`,
        `2. Click "New Issue"`,
        `3. Choose "${template.title}" template`,
        '4. Fill out the template with your details',
        '5. Submit the issue',
      ],
      alternativeContact: {
        npm: 'https://www.npmjs.com/package/@om-surushe/efficient-ado',
        author: {
          name: 'Om Surushe',
          github: 'https://github.com/om-surushe',
          npm: 'https://www.npmjs.com/~om-surushe',
        },
      },
    },
    suggestedActions: [
      'Copy the template above and fill it out with your issue details',
      'Visit the GitHub issues URL to submit',
      'Check existing issues first to avoid duplicates',
    ],
  };
}

/**
 * Tool metadata for MCP
 */
export const reportIssueTool = {
  name: 'report_issue',
  description:
    'Get instructions and template for reporting bugs, requesting features, or asking questions about this MCP server. Provides GitHub issue URL and formatted template.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      issueType: {
        type: 'string',
        enum: ['bug', 'feature', 'question', 'documentation'],
        description: 'Type of issue to report (default: bug)',
      },
    },
  },
};

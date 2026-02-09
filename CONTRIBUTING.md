# Contributing to Efficient ADO

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful, constructive, and professional. We're building tools to help people, not to argue.

## Getting Started

1. **Fork the repository**
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/efficient-ado.git
   cd efficient-ado
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Create a branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Locally
```bash
# Build
npm run build

# Watch mode
npm run dev

# Type checking
npm run typecheck
```

### Testing Against Real Azure DevOps

Set up your `.env` file:
```bash
AZDO_ORG_URL=https://dev.azure.com/your-org
AZDO_PAT=your-personal-access-token
AZDO_PROJECT=your-project
AZDO_REPO=your-repo
```

Then run:
```bash
node dist/index.js
```

### Before Committing

1. **Type check**: `npm run typecheck`
2. **Build successfully**: `npm run build`
3. **Test manually** against real ADO (automated tests coming soon)

All checks should pass before submitting a PR.

## Commit Messages

Follow conventional commits:

- `feat:` New feature (new tool, capability)
- `fix:` Bug fix
- `docs:` Documentation changes
- `chore:` Tooling, dependencies
- `test:` Test additions or fixes
- `refactor:` Code refactoring

**Examples:**
```
feat: add query_work_items tool with WIQL support
fix: vote_on_pr now uses actual user ID instead of "me"
docs: update README with composite workflow examples
```

## Pull Requests

1. **Keep PRs focused** - One feature or fix per PR
2. **Write clear descriptions** - Explain what and why
3. **Test against real ADO** for tool changes
4. **Update docs** if behavior changes (README, tool descriptions)
5. **Update STATUS.md** to reflect new tools

## Testing

Currently manual testing against real Azure DevOps. Automated tests coming soon.

**Manual testing checklist:**
- [ ] Tool builds without TypeScript errors
- [ ] Tool validates input correctly (Zod schema)
- [ ] Tool returns proper ToolResponse format
- [ ] Suggested actions make sense
- [ ] Error messages help agents fix issues
- [ ] Works against real ADO instance

## Project Structure

```
src/
├── index.ts           # MCP server entry point
├── client.ts          # Azure DevOps API client
├── config.ts          # Configuration management
├── types.ts           # Shared TypeScript types
└── tools/             # MCP tool implementations
    ├── setup-workspace.ts
    ├── list-prs.ts
    ├── get-pr.ts
    └── ... (35 tools total)

dist/                  # Build output
tests/                 # Tests (coming soon)
```

## Design Principles

1. **Agent-first** - Design APIs for AI agents, not humans
2. **Rich context** - Include state, stats, blockers, suggested actions
3. **Tiered responses** - Support summary/standard/detailed levels
4. **Composite tools** - Combine common workflows (start_review, quick_approve)
5. **Clear errors** - Tell agents HOW to fix issues
6. **Type safety** - Leverage TypeScript and Zod validation

## Adding New Tools

Follow the existing pattern:

1. Create `src/tools/your-tool.ts`
2. Define Zod schema for input validation
3. Implement tool function returning `ToolResponse`
4. Export tool metadata (name, description, inputSchema)
5. Add to `src/index.ts` (import + tools array + handlers)
6. Update `STATUS.md` and `README.md`
7. Test against real ADO

**Tool template:**
```typescript
import { z } from 'zod';
import { getGitApi } from '../client.js';
import { getProject, getRepo } from '../config.js';
import { ToolResponse } from '../types.js';

export const YourToolSchema = z.object({
  // ... your parameters
});

export type YourToolInput = z.infer<typeof YourToolSchema>;

export async function yourTool(input: YourToolInput): Promise<ToolResponse> {
  try {
    const params = YourToolSchema.parse(input);
    
    // ... your logic
    
    return {
      success: true,
      data: { /* your response */ },
      suggestedActions: [/* helpful next steps */],
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: 'YOUR_ERROR_CODE',
        message: error.message,
      },
      suggestedActions: [/* how to fix */],
    };
  }
}

export const yourToolTool = {
  name: 'your_tool',
  description: 'Clear description of what this tool does',
  inputSchema: {
    type: 'object' as const,
    properties: { /* schema */ },
    required: [/* required fields */],
  },
};
```

## Questions?

Open an issue or discussion on GitHub. Use `report_issue` tool for bugs!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

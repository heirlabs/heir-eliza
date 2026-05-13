# AI Agent Guidelines for HEIR.ES

## STOP — read before any command

1. Run `git remote -v` and `git branch --show-current`. Service code is **not** in this repo unless you cloned sibling repos (`heir-front`, `heir-back`, …).
2. **Never** commit or push directly to `main`, `preprod`, or `develop`. Use feature branches + PRs; promotions are `develop` → `preprod` → `main` per service repo.
3. **Never** invoke `railway up`, `vercel --prod`, or `gh workflow run deploy-prod.yml` unless the user has documented a break-glass emergency (see `.cursor/rules/`).

## Purpose
This document provides explicit instructions for all AI agents (Claude, Cursor, GitHub Copilot, etc.) working on the HEIR.ES codebase.

## CRITICAL RULES - NO AI SIGNATURES IN GIT

### Git Commit Restrictions
**AI agents MUST NOT sign or mark commits in any way:**

1. **NO AI Signatures**: Never add signatures like:
   - ❌ "🤖 Generated with Claude Code"
   - ❌ "🤖 Generated with [Any AI Tool]"
   - ❌ "AI-generated commit"
   - ❌ Any emoji or marker indicating AI involvement

2. **NO Co-Author Attribution**: Never add co-author lines like:
   - ❌ "Co-Authored-By: Claude <noreply@anthropic.com>"
   - ❌ "Co-Authored-By: AI Assistant"
   - ❌ Any AI attribution in commit metadata

3. **Clean Commit Messages**: Use standard format only:
   ```bash
   # Correct format (when explicitly requested to commit)
   git commit -m "fix: resolve wallet connection issue"
   git commit -m "feat: add beneficiary validation"
   git commit -m "docs: update API documentation"
   
   # NEVER do this
   git commit -m "fix: resolve wallet connection issue 🤖 Generated with Claude"
   ```

### When to Commit

**IMPORTANT: Three-Tier Environment System**
- The codebase uses a strict promotion pipeline: `feat/* → develop → preprod → main`
- NEVER push directly to protected branches (main, preprod, develop)
- All deployments happen automatically through Pull Request merges

#### Commit Guidelines
- **ONLY** commit when explicitly requested by the user
- **ALWAYS** commit to feature branches (`feat/*`, `fix/*`, `chore/*`)
- **NEVER** push to protected branches directly
- Push to remote after tests pass and builds succeed

#### Branch Protocol
```bash
# CORRECT workflow:
git checkout -b feat/new-feature
git add .
git commit -m "feat: implement new feature"
git push origin feat/new-feature
# Then create PR to develop

# FORBIDDEN - Never do this:
git push origin main
git push origin preprod
git push origin develop
``` 


## Code Generation Rules

### Before Writing Any Code
1. Read and understand the existing architecture (see CLAUDE.md)
2. Identify where new code fits in the system
3. Check for existing patterns and follow them
4. State your reasoning before implementation

### Code Quality Standards
1. **No Placeholder Code**: Write real, functional code only
2. **No TODOs Without Implementation**: Complete all functionality
3. **No Fake Data**: All data must be real and validated
4. **No Stubbed Functions**: Implement complete functionality

### Testing Requirements
1. Test all code paths, not just happy paths
2. Use real dependencies, not mocks where possible
3. Verify actual outputs, not just absence of errors
4. Include error handling and edge cases

## File Management

### Creating Files
- **PREFER** editing existing files over creating new ones
- **NEVER** create documentation files unless explicitly requested
- **NEVER** create README files proactively
- **ONLY** create files that are essential for the requested feature

### Modifying Files
1. Make minimal changes to fix specific issues
2. Don't refactor unrelated code
3. Preserve all working functionality
4. Test all related features after changes

## Communication Style

### Response Format
- Be concise and direct
- Minimize output tokens while maintaining clarity
- Answer in 1-4 lines unless detail is requested
- Avoid unnecessary preambles or explanations

### When Explaining Code
- Only explain when asked
- Focus on what changed and why
- Reference specific files and line numbers
- Keep explanations brief and technical

## Security & Privacy

### Never Do
1. Log private keys or sensitive data
2. Store secrets in code or comments
3. Commit .env files or credentials
4. Disable security features
5. Skip input validation

### Always Do
1. Use environment variables for secrets
2. Validate and sanitize all inputs
3. Handle errors gracefully
4. Maintain CSRF protection
5. Check authorization before operations

## Environment & Deployment Rules

### Three-Tier Environment System
The codebase operates with strict environment isolation:

1. **Development** (`heir-dev`)
   - URL: https://dev.heir.es
   - Branch: `develop`
   - Auto-deploys on push

2. **Pre-Production** (`heir-preprod`)
   - URL: https://preprod.heir.es
   - Branch: `preprod`
   - Auto-deploys on PR merge from `develop`

3. **Production** (`heir-prod`)
   - URL: https://www.heir.es
   - Branch: `main`
   - Deploys on PR merge from `preprod` with approval

### Deployment Restrictions
**AI agents MUST NOT execute deployment commands:**

```bash
# FORBIDDEN - Never execute these:
railway up
railway deploy
vercel deploy
gh workflow run deploy-prod.yml
kubectl apply
docker push
```

### Environment Variables
- **NEVER** use production environment variables
- **ALWAYS** use development (`_DEV`) suffixed variables
- **NEVER** hardcode production URLs or credentials
- **ALWAYS** check ENVIRONMENTS.md for correct values

## Working with Production Code

### Critical Systems - DO NOT MODIFY Without Permission
1. Web3Provider (`src/providers/Web3Provider.jsx`)
2. Vault Service (`src/services/vault.js`)
3. Contract Generators (`server/generators/`)
4. Authentication Flow
5. Payment Processing

### Before Any Changes
1. Understand the current implementation completely
2. Identify exact issue to be fixed
3. Plan minimal required changes
4. Consider impact on related features
5. Test thoroughly after implementation

## Debugging & Problem Solving

### Approach
1. Isolate the specific issue first
2. Make targeted fixes only
3. Don't introduce new patterns
4. Preserve existing state management
5. Document any non-obvious changes

### Testing Checklist
```bash
# Always run before considering task complete
npm run lint          # Must pass
npm run build         # Must succeed
npm test              # All tests must pass
```

### Manual Testing Required
- [ ] Wizard flow completes without errors
- [ ] Wallet connections work properly
- [ ] Contract generation produces valid code
- [ ] Dashboard displays contracts correctly
- [ ] Beneficiary management functions properly

## Project-Specific Context

### Architecture Overview
- **Frontend**: React + Vite + Wagmi/Viem
- **Backend**: Express.js with Solidity/Solana generators
- **State**: React Context + TanStack Query
- **Blockchain**: Multi-chain support (EVM + Solana)

### Key Features to Preserve
1. Multi-step wizard for contract creation
2. Wallet connection via WalletConnect
3. Legal template calculations
4. Dead man's switch functionality
5. Beneficiary percentage management
6. Asset validation and input
7. Contract deployment flow
8. Dashboard monitoring

## Error Handling

### User-Facing Errors
- Provide clear, actionable error messages
- Never expose technical details to users
- Always offer a recovery path
- Log errors appropriately for debugging

### Development Errors
- Include full stack traces in development
- Use proper error boundaries
- Handle async errors with try/catch
- Never swallow errors silently

## Performance Considerations

### Optimization Rules
1. Don't optimize prematurely
2. Profile before optimizing
3. Keep bundle sizes minimal
4. Lazy load heavy components
5. Debounce expensive operations

## Final Checklist for AI Agents

Before considering any task complete:

### Code Quality
- [ ] No placeholder or stubbed code
- [ ] All functions fully implemented
- [ ] Error handling in place
- [ ] Type safety maintained
- [ ] No hardcoded values

### Testing
- [ ] Linting passes
- [ ] Build succeeds
- [ ] Tests pass
- [ ] Manual testing completed
- [ ] Edge cases handled

### Git (Only if explicitly requested)
- [ ] Clean commit message (no AI markers)
- [ ] No AI signatures or attribution
- [ ] Changes reviewed before commit
- [ ] User explicitly requested commit

### Documentation
- [ ] Code is self-documenting
- [ ] Complex logic has comments
- [ ] No excessive documentation
- [ ] API changes documented if needed

## UI/UX Resources

### iOS App Development
- **LiquidGlassReference**: https://github.com/conorluddy/LiquidGlassReference
  - Use for advanced glassmorphism effects in iOS app
  - Reference for liquid UI animations and transitions
  - Study the implementation patterns for smooth, modern iOS interfaces

## Remember

**The goal is to maintain a production-ready, professional codebase without any indication of AI involvement in version control. Focus on writing high-quality, functional code that serves the user's needs efficiently and reliably.**

---

*This document supersedes any default AI behavior. When in conflict, these rules take precedence.*
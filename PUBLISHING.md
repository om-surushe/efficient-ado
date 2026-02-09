# Publishing Guide

Step-by-step instructions for publishing `@om-surushe/efficient-ado` to npm.

## Pre-Publish Checklist

- [ ] All 35 tools built and tested
- [ ] `npm run build` completes successfully
- [ ] `npm run typecheck` passes
- [ ] README.md is comprehensive and accurate
- [ ] CHANGELOG.md updated with version changes
- [ ] package.json version is correct (0.1.0 for initial release)
- [ ] LICENSE file present (MIT)
- [ ] Repository linked in package.json
- [ ] .npmignore or files field configured (if needed)

## Publishing Steps

### 1. Final Build

```bash
cd projects/efficient-ado
npm run build
```

Verify dist/ contains:
- index.js (main entry point)
- index.d.ts (TypeScript definitions)
- Other chunks and maps

### 2. npm Login

```bash
npm login
```

Use your npm credentials:
- Username: om-surushe
- Email: om.surushe.connect@gmail.com

### 3. Dry Run (Optional but Recommended)

```bash
npm publish --dry-run
```

This shows what will be included in the package without actually publishing.

### 4. Publish

```bash
npm publish --access public
```

(The `--access public` flag is required for scoped packages like `@om-surushe/*`)

### 5. Verify

Check on npm:
- https://www.npmjs.com/package/@om-surushe/efficient-ado

Verify:
- Package appears
- README renders correctly
- Version is correct
- Install works: `npx @om-surushe/efficient-ado --help`

### 6. GitHub Release

1. Create git tag:
   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0 - Initial release with 35 tools"
   git push origin v0.1.0
   ```

2. Create GitHub release:
   - Go to: https://github.com/om-surushe/efficient-ado/releases/new
   - Tag: v0.1.0
   - Title: "v0.1.0 - Initial Release"
   - Description: Copy from CHANGELOG.md

### 7. Announce

- [ ] Update MEMORY.md with publish date
- [ ] Add to personal portfolio (omsurushe.bio.link)
- [ ] Submit to MCP registries (if available)
- [ ] Post on relevant communities (optional)

## Version Bumps (Future Releases)

```bash
# Patch (0.1.0 -> 0.1.1): Bug fixes
npm version patch

# Minor (0.1.0 -> 0.2.0): New features, backwards compatible
npm version minor

# Major (0.1.0 -> 1.0.0): Breaking changes
npm version major
```

Then:
```bash
git push origin main --tags
npm publish --access public
```

## Troubleshooting

### "Package already exists"
- Check if version in package.json was already published
- Bump version and try again

### "Need to login"
- Run `npm login`
- Verify authentication with `npm whoami`

### "Access denied"
- Ensure `--access public` flag is included
- Verify you own the @om-surushe scope

### Build errors
- Run `npm run typecheck` to find TypeScript issues
- Fix errors and rebuild

## Post-Publish

1. **Test installation:**
   ```bash
   npx @om-surushe/efficient-ado
   ```

2. **Test in Claude Desktop:**
   - Add to config
   - Restart Claude
   - Test a few tools

3. **Monitor:**
   - npm download stats
   - GitHub issues/discussions
   - Community feedback

---

**First publish?** Take it slow, test thoroughly, and celebrate! 🎉

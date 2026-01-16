# Release Skill

Create a new GitHub release with proper versioning.

## Usage

```
/release {name}
```

Example: `/release Boundary forces`

## Process

1. **Check current state**
   - Get latest git tag: `git tag --sort=-v:refname | head -1`
   - Check unpushed commits: `git log origin/main..HEAD --oneline`
   - If no unpushed commits, abort

2. **Determine new version**
   - Parse current tag (e.g., `0.3.0`)
   - Increment patch version (e.g., `0.4.0`)
   - Ask user to confirm or specify different version

3. **Update package.json**
   - Update `"version"` field to new version
   - Commit: `chore: bump version to {version}`

4. **Push commits**
   - `git push origin main`

5. **Create and push tag**
   - `git tag -a {version} -m "v{version}"`
   - `git push origin {version}`

6. **Generate release notes**
   - List commits since last tag
   - Format as bullet points

7. **Create GitHub release**
   - Title format: `{version} - {name}`
   - Use `gh release create {version} --title "{version} - {name}" --notes "{notes}"`

8. **Output**
   - Print release URL

---
name: bug-report
description: Bug reporting and debugging guidelines
---

# Bug Reporting and Debugging Guidelines

## What You Should Report

When reporting a bug, provide the following:

### 1. Bug Description
- Clear description of the issue
- Expected behavior vs. actual behavior
- Steps to reproduce the problem

### 2. Environment Information
- Branch name and commit hash
- Operating system and version
- Build configuration and environment variables
- Compiler/toolchain version if relevant
- Dependencies and their versions

### 3. Error Messages and Logs
- Complete error messages (not truncated)
- Relevant log files or command output
- Stack traces, core dumps, or crash reports if applicable
- Build output showing the failure point

### 4. Context
- What were you trying to accomplish?
- What changes were made recently?
- Does the issue reproduce consistently?
- When did this last work correctly?

## What I Should Be Aware Of When Debugging

### 1. Check Recent Changes
- Review recent commits on the current branch
- Check if the issue exists on other branches
- Look for related changes in code, configurations, or dependencies

### 2. Understand the Codebase Context
- Identify the affected components and their dependencies
- Review architecture and design patterns used
- Check for configuration files that might affect behavior
- Look for environment-specific settings

### 3. Common Debug Approaches
- **Build failures**: Check compiler output, missing dependencies, configuration issues
- **Runtime issues**: Check logs, error messages, system resources
- **Test failures**: Review test output, compare with expected results
- **Performance issues**: Profile the code, check resource usage
- **Integration issues**: Verify API contracts, data formats, communication protocols

### 4. Systematic Debugging
- Reproduce the issue reliably
- Isolate the problem to the smallest possible scope
- Use appropriate debugging tools (debuggers, profilers, tracers)
- Add logging or instrumentation if needed
- Test hypotheses methodically

### 5. Testing and Verification
- Reproduce the issue in a clean environment
- Test on different platforms/configurations if applicable
- Compare with known working versions
- Verify the fix doesn't introduce regressions
- Add or update tests to prevent future occurrences

## Debugging Workflow

1. **Gather Information**: Collect all relevant details from the bug report
2. **Reproduce**: Attempt to reproduce the issue consistently
3. **Isolate**: Narrow down the root cause to specific components
4. **Analyze**: Use appropriate debugging tools and techniques
5. **Fix**: Implement and test the solution
6. **Verify**: Ensure the fix works and doesn't introduce regressions
7. **Document**: Update relevant documentation or add comments

## Project-Specific Resources

Check the `.claude/skills/` directory for project-specific debugging guides and tools.

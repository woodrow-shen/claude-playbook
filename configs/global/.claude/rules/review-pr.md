---
name: review-pr
description: PR review guidelines and checklist
---

# PR Review Guidelines

Follow GitHub flow and code review best practices.

## Review Checklist

- [ ] PR description clearly explains the changes
- [ ] Linked issues/requirements are addressed
- [ ] CI/CD checks pass
- [ ] Code is correct and handles edge cases
- [ ] Code follows project style and conventions
- [ ] Error handling is appropriate
- [ ] Security considerations are addressed
- [ ] Performance implications are acceptable
- [ ] Logging/observability is adequate
- [ ] Tests are included and meaningful
- [ ] Documentation is updated
- [ ] All commits have `Signed-off-by` line
- [ ] Commit messages are clear and descriptive
- [ ] No unnecessary merge commits or history pollution

## Review Categories

### Code Quality
- Follows project conventions
- Proper error handling
- Clear variable/function names
- Adequate comments

### Testing
- Unit tests included
- Integration tests if needed
- Test coverage adequate
- Edge cases covered

### Documentation
- Code comments clear
- API documentation updated
- README updated if needed
- Examples provided

### Architecture
- Design is sound
- No unnecessary complexity
- Follows existing patterns
- Scalable approach

### Risk Assessment
- Breaking changes identified
- Migration path provided
- Backward compatibility considered
- Rollback plan if needed

## Best Practices

- **Be timely**: Review PRs promptly to avoid blocking others
- **Be thorough**: Don't rush through reviews
- **Be constructive**: Offer solutions, not just criticism
- **Be specific**: Reference exact lines and provide examples
- **Be respectful**: Focus on code quality, not personal style
- **Ask questions**: If something is unclear, ask for clarification
- **Acknowledge good work**: Highlight clever solutions or improvements

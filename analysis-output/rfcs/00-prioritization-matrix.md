# RFC Prioritization Matrix

**Analysis Date:** November 18, 2025
**Commit SHA:** `03edd7d9019186493b7008db9f465bf8023cf6d1`

---

## Impact vs Effort Grid

```
                    IMPACT
          Low        Medium       High
       ┌──────────┬──────────┬──────────┐
  Low  │          │ RFC-0006 │ RFC-0001 │
       │          │ RFC-0007 │ RFC-0002 │
       ├──────────┼──────────┼──────────┤
EFFORT │          │          │ RFC-0003 │
Medium │          │          │ RFC-0004 │
       ├──────────┼──────────┼──────────┤
  High │          │          │ RFC-0005 │
       │          │          │ RFC-0008 │
       └──────────┴──────────┴──────────┘
```

---

## RFC Summary

### Quick Wins (<1 week effort)

| RFC | Title | Impact | Effort | Priority |
|-----|-------|--------|--------|----------|
| RFC-0001 | Critical Security Vulnerability Remediation | High | Low | **P0** |
| RFC-0002 | Batch Redis Cache Invalidation | High | Low | **P0** |
| RFC-0006 | Increase EventPropagation Queue Retry Attempts | Medium | Low | P1 |
| RFC-0007 | Add Test Coverage Metrics | Medium | Low | P1 |

### Strategic (2-4 weeks effort)

| RFC | Title | Impact | Effort | Priority |
|-----|-------|--------|--------|----------|
| RFC-0003 | S3 LIST Operation Optimization | High | Medium | **P0** |
| RFC-0004 | ClickHouse Query Result Caching | High | Medium | P1 |

### Long-term (>1 month effort)

| RFC | Title | Impact | Effort | Priority |
|-----|-------|--------|--------|----------|
| RFC-0005 | UI Component Library Consolidation | High | High | P2 |
| RFC-0008 | Comprehensive E2E Test Suite | High | High | P2 |

---

## Prioritization Criteria

### Impact Factors
- **User-facing**: Affects end-user experience
- **Security**: Addresses vulnerabilities or risks
- **Performance**: Improves throughput or latency
- **Maintainability**: Reduces technical debt
- **Reliability**: Increases system stability

### Effort Factors
- **Code changes**: Lines of code modified
- **Testing**: Test coverage requirements
- **Migration**: Data or schema migrations
- **Coordination**: Cross-team dependencies
- **Risk**: Potential for regressions

---

## Recommended Implementation Order

### Phase 1: Immediate (Week 1-2)
1. **RFC-0001**: Security vulnerabilities (Critical CVE)
2. **RFC-0002**: Cache invalidation performance

### Phase 2: Short-term (Week 3-4)
3. **RFC-0006**: Queue retry configuration
4. **RFC-0007**: Test coverage metrics

### Phase 3: Medium-term (Month 2)
5. **RFC-0003**: S3 optimization
6. **RFC-0004**: ClickHouse caching

### Phase 4: Long-term (Quarter 2+)
7. **RFC-0005**: UI consolidation
8. **RFC-0008**: E2E test suite

---

## Success Metrics

### RFC-0001: Security Remediation
- [ ] Zero critical vulnerabilities
- [ ] Zero high-severity vulnerabilities
- [ ] npm audit clean

### RFC-0002: Cache Invalidation
- [ ] 90% reduction in cache invalidation time
- [ ] Pipeline execution for bulk operations

### RFC-0003: S3 Optimization
- [ ] 80% reduction in S3 LIST calls
- [ ] Direct file access for known keys

### RFC-0004: ClickHouse Caching
- [ ] 50% cache hit rate for common queries
- [ ] p99 query latency <100ms for cached results

### RFC-0005: UI Consolidation
- [ ] Single component library (shadcn/ui)
- [ ] 30% reduction in bundle size
- [ ] Consistent design language

### RFC-0006: Queue Retries
- [ ] EventPropagation attempts increased to 6
- [ ] DLQ handling for failed jobs

### RFC-0007: Test Coverage
- [ ] Coverage reports in CI
- [ ] Minimum 70% coverage threshold

### RFC-0008: E2E Tests
- [ ] 20+ critical path tests
- [ ] <5 minute test execution
- [ ] Playwright visual regression

---

## Stakeholder Approvals Required

| RFC | Engineering | Product | Security | DevOps |
|-----|-------------|---------|----------|--------|
| RFC-0001 | ✓ | | ✓ | |
| RFC-0002 | ✓ | | | |
| RFC-0003 | ✓ | | | ✓ |
| RFC-0004 | ✓ | | | ✓ |
| RFC-0005 | ✓ | ✓ | | |
| RFC-0006 | ✓ | | | |
| RFC-0007 | ✓ | | | |
| RFC-0008 | ✓ | ✓ | | |

---

## Dependencies

```
RFC-0001 ─┐
          ├─→ RFC-0003 ─┐
RFC-0002 ─┘              │
                         ├─→ RFC-0004
RFC-0006 ─────────────────┘

RFC-0007 ─────────────────→ RFC-0008

RFC-0005 (independent)
```

---

## Risk Assessment

| RFC | Technical Risk | Schedule Risk | Rollback Complexity |
|-----|----------------|---------------|---------------------|
| RFC-0001 | Low | Low | Easy (revert deps) |
| RFC-0002 | Low | Low | Easy (revert code) |
| RFC-0003 | Medium | Low | Easy (feature flag) |
| RFC-0004 | Medium | Medium | Medium (cache clear) |
| RFC-0005 | High | High | Hard (UI regression) |
| RFC-0006 | Low | Low | Easy (config change) |
| RFC-0007 | Low | Low | Easy (CI config) |
| RFC-0008 | Medium | High | Easy (tests only) |

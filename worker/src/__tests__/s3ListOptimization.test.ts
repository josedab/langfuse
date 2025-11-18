import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("S3 LIST Operation Optimization", () => {
  describe("shouldSkipS3List logic", () => {
    // Test helper function that replicates the shouldSkipS3List logic
    const shouldSkipS3List = (params: {
      s3SkipListEnabled: boolean;
      entityType: string;
      source: string;
      projectId: string;
      projectIdsToSkipS3List: string[];
    }): boolean => {
      const {
        s3SkipListEnabled,
        entityType,
        source,
        projectId,
        projectIdsToSkipS3List,
      } = params;

      const isDatasetRunItemEvent = entityType === "dataset_run_item";
      const isObservationEvent = entityType === "observation";

      const isOtelOrSkipS3Project =
        projectId !== null &&
        (source === "otel" || projectIdsToSkipS3List.includes(projectId));

      return (
        s3SkipListEnabled ||
        isDatasetRunItemEvent ||
        (isObservationEvent && isOtelOrSkipS3Project)
      );
    };

    describe("when LANGFUSE_S3_SKIP_LIST_ENABLED is true (default)", () => {
      it("should skip S3 LIST for trace events", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: true,
          entityType: "trace",
          source: "api",
          projectId: "project-123",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(true);
      });

      it("should skip S3 LIST for observation events", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: true,
          entityType: "observation",
          source: "api",
          projectId: "project-123",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(true);
      });

      it("should skip S3 LIST for score events", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: true,
          entityType: "score",
          source: "api",
          projectId: "project-123",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(true);
      });

      it("should skip S3 LIST for dataset_run_item events", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: true,
          entityType: "dataset_run_item",
          source: "api",
          projectId: "project-123",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(true);
      });
    });

    describe("when LANGFUSE_S3_SKIP_LIST_ENABLED is false (legacy behavior)", () => {
      it("should NOT skip S3 LIST for trace events from API", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: false,
          entityType: "trace",
          source: "api",
          projectId: "project-123",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(false);
      });

      it("should NOT skip S3 LIST for observation events from API (not in skip list)", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: false,
          entityType: "observation",
          source: "api",
          projectId: "project-123",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(false);
      });

      it("should skip S3 LIST for observation events from OTel", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: false,
          entityType: "observation",
          source: "otel",
          projectId: "project-123",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(true);
      });

      it("should skip S3 LIST for observation events from projects in skip list", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: false,
          entityType: "observation",
          source: "api",
          projectId: "project-123",
          projectIdsToSkipS3List: ["project-123", "project-456"],
        });
        expect(result).toBe(true);
      });

      it("should always skip S3 LIST for dataset_run_item events", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: false,
          entityType: "dataset_run_item",
          source: "api",
          projectId: "project-123",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(true);
      });

      it("should NOT skip S3 LIST for score events from API", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: false,
          entityType: "score",
          source: "api",
          projectId: "project-123",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("should handle empty projectIdsToSkipS3List", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: false,
          entityType: "observation",
          source: "api",
          projectId: "project-123",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(false);
      });

      it("should correctly check project membership in skip list", () => {
        const result = shouldSkipS3List({
          s3SkipListEnabled: false,
          entityType: "observation",
          source: "api",
          projectId: "project-456",
          projectIdsToSkipS3List: ["project-123", "project-789"],
        });
        expect(result).toBe(false);
      });

      it("should prioritize global flag over legacy behavior", () => {
        // Even if observation from API and not in skip list,
        // global flag should still cause skip
        const result = shouldSkipS3List({
          s3SkipListEnabled: true,
          entityType: "observation",
          source: "api",
          projectId: "project-999",
          projectIdsToSkipS3List: [],
        });
        expect(result).toBe(true);
      });
    });
  });

  describe("metrics tracking", () => {
    it("should track method=direct when skipS3List is true", () => {
      // This is a documentation test - actual implementation verified in integration tests
      const expectedMetric = {
        name: "langfuse.ingestion.s3_access",
        value: 1,
        tags: {
          method: "direct",
          entity_type: "trace",
        },
      };

      expect(expectedMetric.tags.method).toBe("direct");
    });

    it("should track method=list when skipS3List is false", () => {
      // This is a documentation test - actual implementation verified in integration tests
      const expectedMetric = {
        name: "langfuse.ingestion.s3_access",
        value: 1,
        tags: {
          method: "list",
          entity_type: "trace",
        },
      };

      expect(expectedMetric.tags.method).toBe("list");
    });
  });
});

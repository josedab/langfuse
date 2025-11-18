# Extending and Integrating Langfuse

**Part 4 of 5 in the Langfuse Technical Deep Dive Series**

*Analysis based on commit `03edd7d9019186493b7008db9f465bf8023cf6d1`*

---

## What You'll Learn

- Public API design and versioning strategy
- SDK integration patterns
- Webhook system and automation framework
- Evaluation framework extensibility
- Enterprise features and custom SSO

---

## Introduction

Langfuse is designed as a platform that others build upon. SDKs, webhooks, and evaluations all rely on well-designed extension points. In this post, we'll explore how to integrate with and extend Langfuse.

---

## Public API Design

### API Route Structure

Public APIs live under `/api/public`:

```
web/src/pages/api/public/
├── ingestion.ts          # Batch event ingestion
├── health.ts             # Health checks
├── traces/
│   ├── index.ts          # List/create traces
│   └── [traceId].ts      # Get/update trace
├── scores/
│   ├── index.ts          # List/create scores
│   └── [scoreId].ts      # Get/update/delete score
├── prompts.ts            # Prompt management
├── datasets/
│   ├── index.ts          # List/create datasets
│   └── [datasetId]/
│       ├── items/        # Dataset items
│       └── runs/         # Dataset runs
└── ...
```

### Route Handler Pattern

Every public route uses the same wrapper:

```typescript
// From: web/src/features/public-api/server/withMiddlewares.ts

export function withMiddlewares(handlers: RouteHandlers) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // 1. CORS handling
    await cors(req, res);
    if (req.method === "OPTIONS") return res.status(200).end();

    // 2. OpenTelemetry instrumentation
    return instrumentAsync(
      { name: `api.public.${req.url}` },
      async () => {
        // 3. Route to handler
        const handler = handlers[req.method as keyof RouteHandlers];
        if (!handler) {
          return res.status(405).json({ error: "Method not allowed" });
        }

        return handler(req, res);
      }
    );
  };
}

// Usage
export default withMiddlewares({
  GET: createAuthedProjectAPIRoute(getTraces, { responseSchema }),
  POST: createAuthedProjectAPIRoute(createTrace, { bodySchema, responseSchema }),
});
```

### Authentication Wrapper

```typescript
// From: web/src/features/public-api/server/createAuthedProjectAPIRoute.ts

export function createAuthedProjectAPIRoute(
  handler: AuthedHandler,
  config: RouteConfig
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // 1. Verify API key
    const authResult = await verifyApiKey(req);
    if (!authResult.valid) {
      return res.status(401).json({ error: authResult.error });
    }

    // 2. Check rate limits
    const rateLimitResult = await checkRateLimit(authResult.scope);
    if (rateLimitResult.exceeded) {
      res.setHeader("Retry-After", rateLimitResult.retryAfter);
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    // 3. Parse and validate input
    const query = config.querySchema?.parse(req.query) ?? {};
    const body = config.bodySchema?.parse(req.body) ?? {};

    // 4. Execute handler
    const result = await handler(req, authResult.scope, { query, body });

    // 5. Validate response (development only)
    if (process.env.NODE_ENV === "development" && config.responseSchema) {
      config.responseSchema.parse(result);
    }

    return res.status(200).json(result);
  };
}
```

### API Versioning

Langfuse uses URL path versioning:

```typescript
// Versioned endpoints
/api/public/scores          // v1 (legacy)
/api/public/scores/v2       // v2 with breaking changes

// Version-specific schemas
export const GetScoresV1Response = z.object({
  data: z.array(ScoreV1Schema),
});

export const GetScoresV2Response = z.object({
  data: z.array(ScoreV2Schema),
  meta: z.object({
    page: z.number(),
    totalCount: z.number(),
  }),
});
```

### Type Definitions

API types are strictly defined with Zod:

```typescript
// From: web/src/features/public-api/types/datasets.ts

export const DatasetItemBody = z.object({
  datasetName: z.string().min(1),
  input: z.unknown().optional(),
  expectedOutput: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
  sourceTraceId: z.string().optional(),
  sourceObservationId: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  id: z.string().optional(),
});

export const PostDatasetItemsV1Response = z.object({
  id: z.string(),
  datasetId: z.string(),
  input: z.unknown().nullable(),
  expectedOutput: z.unknown().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type DatasetItem = z.infer<typeof PostDatasetItemsV1Response>;
```

---

## SDK Integration Patterns

### Event Batching

SDKs batch events for efficient ingestion:

```typescript
// SDK pattern (conceptual)
class LangfuseClient {
  private eventQueue: Event[] = [];
  private flushInterval: number = 5000; // 5 seconds

  trace(data: TraceData): Trace {
    const event = {
      id: generateId(),
      type: "trace-create",
      timestamp: new Date().toISOString(),
      body: data,
    };

    this.eventQueue.push(event);
    this.scheduleFlush();

    return new Trace(this, event.body.id);
  }

  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const batch = this.eventQueue.splice(0);

    await fetch("/api/public/ingestion", {
      method: "POST",
      headers: {
        Authorization: `Basic ${this.credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batch }),
    });
  }
}
```

### Update Pattern

SDKs send updates as separate events:

```typescript
// Create trace
const trace = langfuse.trace({ name: "my-trace" });

// Later: Update with output
trace.update({ output: "Result here" });

// This sends two events:
// 1. { type: "trace-create", body: { id: "xxx", name: "my-trace" } }
// 2. { type: "trace-update", body: { id: "xxx", output: "Result here" } }

// Server merges them into final state
```

### Nested Observations

```typescript
const trace = langfuse.trace({ name: "qa-pipeline" });

// Create span for retrieval
const retrievalSpan = trace.span({ name: "retrieval" });
const docs = await retrieveDocuments(query);
retrievalSpan.end({ output: docs });

// Create generation for LLM call
const generation = trace.generation({
  name: "answer",
  model: "gpt-4",
  input: { query, docs },
});
const answer = await llm.generate(query, docs);
generation.end({
  output: answer,
  usage: { totalTokens: 1500 },
});

trace.update({ output: answer });
```

### Error Handling

```typescript
// SDK handles errors gracefully
try {
  await langfuse.flush();
} catch (error) {
  // Log error but don't throw
  console.error("Failed to flush events:", error);

  // Optionally retry
  if (error instanceof NetworkError) {
    this.retryQueue.push(...batch);
  }
}
```

---

## Webhook System

### Automation Framework

Langfuse provides event-driven automations:

```typescript
// From: packages/shared/prisma/schema.prisma

model Automation {
  id            String   @id @default(cuid())
  projectId     String
  name          String
  enabled       Boolean  @default(true)

  // Trigger configuration
  trigger       Json     // { event: "trace", actions: ["created", "updated"] }
  filter        Json?    // Optional filter conditions

  // Actions to execute
  actions       AutomationAction[]
  executions    AutomationExecution[]
}

model AutomationAction {
  id            String   @id @default(cuid())
  automationId  String
  type          String   // WEBHOOK, SLACK
  config        Json     // Type-specific configuration
}
```

### Webhook Execution

```typescript
// From: worker/src/queues/webhookQueue.ts

async function executeWebhook(job: Job<WebhookJobData>) {
  const { automationId, actionId, traceId, projectId } = job.data;

  // Load configuration
  const action = await prisma.automationAction.findUnique({
    where: { id: actionId },
    include: { automation: true },
  });

  if (!action || action.type !== "WEBHOOK") {
    return;
  }

  const config = action.config as WebhookConfig;

  // Build payload
  const trace = await getTraceById(projectId, traceId);
  const payload = {
    event: "trace.created",
    timestamp: new Date().toISOString(),
    data: {
      traceId: trace.id,
      projectId: trace.projectId,
      name: trace.name,
      // ... other fields
    },
  };

  // Generate signature
  const timestamp = Date.now();
  const signature = generateWebhookSignature(
    JSON.stringify(payload),
    timestamp,
    config.secretKey
  );

  // Send webhook
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Langfuse-Signature": `t=${timestamp},v1=${signature}`,
    },
    body: JSON.stringify(payload),
  });

  // Record execution
  await prisma.automationExecution.create({
    data: {
      automationId,
      status: response.ok ? "SUCCESS" : "FAILED",
      httpStatus: response.status,
    },
  });
}
```

### Signature Verification

Webhook recipients verify signatures:

```typescript
// Recipient-side verification
function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): boolean {
  // Parse header: "t=1234567890,v1=abcdef..."
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );

  const timestamp = parseInt(parts.t);
  const signature = parts.v1;

  // Check timestamp (prevent replay attacks)
  const age = Date.now() - timestamp;
  if (age > 5 * 60 * 1000) { // 5 minutes
    return false;
  }

  // Verify signature
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## Evaluation Framework

### Evaluation Templates

Templates define how to evaluate traces:

```typescript
// From: packages/shared/prisma/schema.prisma

model EvalTemplate {
  id          String   @id @default(cuid())
  projectId   String
  name        String
  version     Int      @default(1)

  // LLM configuration
  prompt      String   // Template with {{variables}}
  model       String   // e.g., "gpt-4"
  modelParams Json     // Temperature, max_tokens, etc.

  // Output configuration
  outputType  String   // BOOLEAN, NUMERIC, CATEGORICAL
  outputSchema Json?   // For structured output

  // Variable definitions
  vars        String[] // ["input", "output", "context"]
}
```

### Job Configuration

Jobs define when and what to evaluate:

```typescript
model JobConfiguration {
  id            String   @id @default(cuid())
  projectId     String
  status        String   // ACTIVE, INACTIVE
  jobType       String   // EVAL

  // Target selection
  targetObject  String   // "trace" or "observation"
  filter        Json     // Conditions for selection
  sampling      Float    @default(1.0) // 0.0 to 1.0

  // Evaluation configuration
  evalTemplateId String
  variableMapping Json   // Map template vars to trace fields

  // Execution tracking
  executions    JobExecution[]
}
```

### Variable Mapping

Map trace fields to template variables:

```typescript
// Variable mapping configuration
{
  "input": {
    "type": "trace",
    "field": "input"
  },
  "output": {
    "type": "trace",
    "field": "output"
  },
  "context": {
    "type": "observation",
    "name": "retrieval",
    "field": "output"
  }
}

// Resolver
async function resolveVariables(
  mapping: VariableMapping,
  trace: Trace,
  observations: Observation[]
): Promise<Record<string, unknown>> {
  const variables: Record<string, unknown> = {};

  for (const [varName, config] of Object.entries(mapping)) {
    if (config.type === "trace") {
      variables[varName] = trace[config.field];
    } else if (config.type === "observation") {
      const obs = observations.find((o) => o.name === config.name);
      variables[varName] = obs?.[config.field];
    }
  }

  return variables;
}
```

### Custom Evaluators

The evaluation service is extensible:

```typescript
// From: worker/src/services/EvalService/index.ts

export class EvalService {
  async executeEvaluation(params: {
    templateId: string;
    traceId: string;
  }): Promise<EvalResult> {
    const template = await this.getTemplate(params.templateId);
    const trace = await this.getTrace(params.traceId);
    const observations = await this.getObservations(params.traceId);

    // Resolve variables
    const variables = await resolveVariables(
      template.variableMapping,
      trace,
      observations
    );

    // Render prompt
    const prompt = Handlebars.compile(template.prompt)(variables);

    // Execute evaluation
    const result = await this.callLLM({
      model: template.model,
      prompt,
      modelParams: template.modelParams,
    });

    // Parse output
    const score = this.parseOutput(result, template.outputType);

    // Store score
    await this.createScore({
      traceId: params.traceId,
      name: template.name,
      value: score.value,
      source: "EVAL",
      configId: params.templateId,
    });

    return { score, usage: result.usage };
  }
}
```

---

## Enterprise Features

### Custom SSO

Enterprise customers can configure custom SSO per domain:

```typescript
// From: web/src/server/auth.ts

// Multi-tenant SSO configuration
const customSSOProvider = {
  id: "custom-sso",
  name: "Custom SSO",
  type: "oidc",

  authorization: {
    url: async (req) => {
      // Get domain from email
      const email = req.query.email as string;
      const domain = email.split("@")[1];

      // Look up SSO config for domain
      const ssoConfig = await getSSOConfigForDomain(domain);

      return {
        url: ssoConfig.authorizationUrl,
        params: {
          client_id: ssoConfig.clientId,
          redirect_uri: ssoConfig.redirectUri,
          scope: "openid email profile",
        },
      };
    },
  },

  token: {
    url: async (req) => {
      const domain = getDomainFromState(req.query.state);
      const ssoConfig = await getSSOConfigForDomain(domain);
      return ssoConfig.tokenUrl;
    },
  },

  userinfo: {
    url: async (req) => {
      const domain = getDomainFromState(req.query.state);
      const ssoConfig = await getSSOConfigForDomain(domain);
      return ssoConfig.userinfoUrl;
    },
  },
};
```

### SSO Enforcement

Domains can require SSO:

```typescript
// From: web/src/server/auth.ts

callbacks: {
  async signIn({ user, account }) {
    // Check if domain requires SSO
    const domain = user.email?.split("@")[1];
    const enforcedDomains = env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT?.split(",");

    if (enforcedDomains?.includes(domain)) {
      // Must use SSO provider
      if (account?.provider !== "custom-sso") {
        logger.warn("SSO enforcement blocked sign-in", {
          email: user.email,
          provider: account?.provider,
        });
        return false;
      }
    }

    return true;
  },
}
```

### Billing Integration

Stripe integration for usage-based billing:

```typescript
// From: web/src/ee/features/billing/server/stripeBillingService.ts

export class StripeBillingService {
  async recordUsage(params: {
    orgId: string;
    metric: string;
    quantity: number;
  }): Promise<void> {
    const { orgId, metric, quantity } = params;

    // Get Stripe subscription
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { stripeSubscriptionId: true },
    });

    if (!org?.stripeSubscriptionId) return;

    // Record usage
    await stripe.subscriptionItems.createUsageRecord(
      org.stripeSubscriptionId,
      {
        quantity,
        timestamp: Math.floor(Date.now() / 1000),
        action: "increment",
      },
      {
        idempotencyKey: `${orgId}-${metric}-${Date.now()}`,
      }
    );
  }
}
```

---

## Integration Examples

### LangChain Integration

```python
# Python SDK usage with LangChain
from langfuse.callback import CallbackHandler

handler = CallbackHandler(
    public_key="pk-...",
    secret_key="sk-...",
)

# Use with any LangChain component
from langchain.chat_models import ChatOpenAI

llm = ChatOpenAI(callbacks=[handler])
response = llm.predict("What is the capital of France?")

# Traces automatically captured
```

### Custom Scoring

```typescript
// Send custom scores via API
await fetch("/api/public/scores", {
  method: "POST",
  headers: {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    traceId: "trace-123",
    name: "user-feedback",
    value: 1, // Thumbs up
    dataType: "BOOLEAN",
    comment: "User marked as helpful",
  }),
});
```

### Dataset Experiments

```typescript
// Create dataset
const dataset = await langfuse.createDataset({
  name: "qa-test-cases",
});

// Add items
await langfuse.createDatasetItem({
  datasetName: "qa-test-cases",
  input: { question: "What is 2+2?" },
  expectedOutput: { answer: "4" },
});

// Run experiment
const run = await langfuse.createDatasetRun({
  datasetName: "qa-test-cases",
  name: "gpt-4-v1",
});

for (const item of dataset.items) {
  const trace = langfuse.trace({
    name: "experiment",
    metadata: { runId: run.id },
  });

  const output = await myApp(item.input);

  trace.update({ output });

  await langfuse.createDatasetRunItem({
    runId: run.id,
    datasetItemId: item.id,
    traceId: trace.id,
  });
}
```

---

## Key Takeaways

1. **Consistent API patterns**: Every endpoint uses the same wrapper for auth, validation, and instrumentation

2. **Strict type definitions**: Zod schemas ensure API contracts are enforced

3. **Webhook security**: HMAC signatures with timestamps prevent tampering and replay attacks

4. **Flexible evaluations**: Templates and variable mapping enable custom evaluation logic

5. **Enterprise extensibility**: Custom SSO and billing integration for organization needs

---

## Next Steps

In **Part 5**, we'll analyze Langfuse's performance characteristics—queue system architecture, caching strategies, and scaling recommendations.

---

*This post is part of a technical series on Langfuse architecture. Find the complete series at [analysis-output/blog-series/00-series-outline.md](./00-series-outline.md).*

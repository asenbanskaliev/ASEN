/**
 * P45: desktop RPC transport and router — a pure, request/response surface for
 * whitelisted read-only projections. No Pi command registration, no widget
 * publisher and no host integration live here; the host adapter owns framing,
 * gating and the real projection sources.
 *
 * Security stance (REA of Gentle Shell v4.8.0 `lib/desktop-rpc.ts`): the
 * interactive host channel is the only gate, so this module bounds every
 * inbound request (size, identifier, method vocabulary) and never lets a
 * handler failure surface a stack trace, absolute path or raw input echo.
 */

export interface DesktopRpcRequest {
 requestId: string;
 method: string;
 params?: Record<string, unknown>;
}

export interface DesktopRpcResponse {
 /** Correlation id echoed back; null when the request carried no usable id. */
 requestId: string | null;
 result?: unknown;
 error?: { code: string; message: string };
}

export type DesktopRpcHandler = (params: Record<string, unknown>) => unknown | Promise<unknown>;

export interface DesktopRpcRouter {
 register(method: string, handler: DesktopRpcHandler): void;
 handle(request: DesktopRpcRequest): Promise<DesktopRpcResponse>;
 listMethods(): readonly string[];
}

/** Wire error vocabulary; `permission_denied` and `profile_apply_busy` are reserved for write gates the host may add later. */
export const RPC_ERRORS = {
 INVALID_REQUEST: "invalid_request",
 UNSUPPORTED_METHOD: "unsupported_method",
 INTERNAL_ERROR: "internal_error",
 PERMISSION_DENIED: "permission_denied",
 PROFILE_APPLY_BUSY: "profile_apply_busy",
} as const;

export type DesktopRpcErrorCode = (typeof RPC_ERRORS)[keyof typeof RPC_ERRORS];

/** Largest inbound envelope the transport may hand to the router (64 KiB). */
export const MAX_REQUEST_BYTES = 65536;
export const MAX_REQUEST_ID_LENGTH = 128;
export const METHOD_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
/** Error detail bound so a handler message cannot become a side-channel. */
export const MAX_ERROR_MESSAGE_CHARS = 200;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;
const WINDOWS_PATH = /[A-Za-z]:[\\/][^\s;,)'"]*/gu;
const POSIX_PATH = /(?:\/[A-Za-z0-9._~-]+){2,}/gu;
const CONTROL_CHARS_GLOBAL = /[\u0000-\u001f\u007f]/gu;

/** The complete built-in surface: bounded read-only projections, never writes. */
export const DESKTOP_RPC_READ_ONLY_METHODS = Object.freeze([
 "get_permission_mode",
 "get_snapshot",
 "list_jobs",
 "list_subagents",
] as const);

type ValidationFailure = { error: string };
type ValidatedRequest = DesktopRpcRequest | ValidationFailure;

function isValidationFailure(value: ValidatedRequest): value is ValidationFailure {
 return (value as DesktopRpcRequest).requestId === undefined
  && typeof (value as ValidationFailure).error === "string";
}

/** Ordered, bounded request shape check. Returns `{error}` instead of throwing so the transport can answer with a correlated failure. */
export function validateRequest(raw: unknown): DesktopRpcRequest | ValidationFailure {
 if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { error: "request must be a JSON object" };
 const candidate = raw as Record<string, unknown>;
 const requestId = candidate.requestId;
 if (typeof requestId !== "string") return { error: "requestId must be a string" };
 if (requestId.length === 0) return { error: "requestId must not be empty" };
 if (requestId.length > MAX_REQUEST_ID_LENGTH) return { error: `requestId exceeds ${MAX_REQUEST_ID_LENGTH} characters` };
 if (CONTROL_CHARS.test(requestId)) return { error: "requestId must not contain control characters" };
 const method = candidate.method;
 if (typeof method !== "string") return { error: "method must be a string" };
 if (!METHOD_PATTERN.test(method)) return { error: "method must match ^[a-z][a-z0-9_]{0,63}$" };
 const params = candidate.params;
 if (params !== undefined && (typeof params !== "object" || params === null || Array.isArray(params))) {
  return { error: "params must be an object when present" };
 }
 return params === undefined
  ? { requestId, method }
  : { requestId, method, params: params as Record<string, unknown> };
}

/** Framing helper for the host adapter: byte bound, then JSON, then request shape. */
export function parseDesktopRpcRequest(raw: string): DesktopRpcRequest | ValidationFailure {
 if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) return { error: `request exceeds ${MAX_REQUEST_BYTES} bytes` };
 let decoded: unknown;
 try {
  decoded = JSON.parse(raw);
 } catch {
  return { error: "request must be valid JSON" };
 }
 return validateRequest(decoded);
}

/** Strip stack lines, absolute paths and control characters; never echo raw input, cap the detail. */
function sanitizeDetail(value: unknown): string {
 let text: string;
 if (value instanceof Error) text = value.message;
 else if (typeof value === "string") text = value;
 else text = "";
 const firstLine = text.split(/[\r\n]+/u)[0] ?? "";
 const collapsed = firstLine
  .replace(WINDOWS_PATH, "<path>")
  .replace(POSIX_PATH, "<path>")
  .replace(CONTROL_CHARS_GLOBAL, " ")
  .replace(/\s+/gu, " ")
  .trim();
 return collapsed.slice(0, MAX_ERROR_MESSAGE_CHARS) || "desktop rpc handler failed";
}

/** Best-effort correlation for a request that never passed validation. */
function correlate(raw: unknown): string | null {
 if (typeof raw !== "object" || raw === null) return null;
 const requestId = (raw as { requestId?: unknown }).requestId;
 if (typeof requestId !== "string") return null;
 if (requestId.length === 0 || requestId.length > MAX_REQUEST_ID_LENGTH) return null;
 return CONTROL_CHARS.test(requestId) ? null : requestId;
}

const READ_ONLY_STUBS: Record<(typeof DESKTOP_RPC_READ_ONLY_METHODS)[number], DesktopRpcHandler> = {
 get_permission_mode: () => ({ mode: "normal" }),
 get_snapshot: () => ({}),
 list_jobs: () => ({ jobs: [] }),
 list_subagents: () => ({ agents: [] }),
};

/**
 * One router instance per desktop channel. Every request is validated, then
 * dispatched to exactly one handler and answered independently: no queue, no
 * shared per-request state, and a throwing handler can never fail its siblings.
 */
export function createDesktopRpcRouter(): DesktopRpcRouter {
 const handlers = new Map<string, DesktopRpcHandler>();
 for (const method of DESKTOP_RPC_READ_ONLY_METHODS) handlers.set(method, READ_ONLY_STUBS[method]);
 return {
  /** The host wires real projections over the stubs; re-registering one read-only method is the supported override. */
  register(method: string, handler: DesktopRpcHandler): void {
   if (typeof method !== "string" || !METHOD_PATTERN.test(method)) throw Error("Invalid desktop RPC method name");
   if (typeof handler !== "function") throw Error("Desktop RPC handler must be a function");
   handlers.set(method, handler);
  },
  listMethods(): readonly string[] {
   return Object.freeze([...handlers.keys()].sort());
  },
  async handle(request: DesktopRpcRequest): Promise<DesktopRpcResponse> {
   const validated = validateRequest(request);
   if (isValidationFailure(validated)) {
    return { requestId: correlate(request), error: { code: RPC_ERRORS.INVALID_REQUEST, message: sanitizeDetail(validated.error) } };
   }
   const requestId = validated.requestId;
   const handler = handlers.get(validated.method);
   if (handler === undefined) {
    return { requestId, error: { code: RPC_ERRORS.UNSUPPORTED_METHOD, message: "Desktop RPC method is not registered" } };
   }
   try {
    return { requestId, result: await handler(validated.params ?? {}) };
   } catch (error) {
    return { requestId, error: { code: RPC_ERRORS.INTERNAL_ERROR, message: sanitizeDetail(error) } };
   }
  },
 };
}

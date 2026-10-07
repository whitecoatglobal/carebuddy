import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execute, uid, type State, type Command } from "care-buddy-shared";
import {
  AI_TOOL_DEFINITIONS,
  commandFromTool,
  CommandValidationError,
} from "./commands.js";

/** Private MCP boundary. Only server-authenticated snapshots may enter here.
 * A fresh transport is created for every request; clients cannot supply an owner,
 * swap the selected profile, access SQL, or execute a database write.
 */
export async function connectBuddyMcp(
  rawState: State,
  timeZone?: string,
  contextId?: string | null,
  scope?: "occurrence" | "future",
) {
  const state = structuredClone(rawState);
  const profile = state.profiles.find(
    (p) => p.id === state.selectedProfileId && p.canView,
  );
  if (!profile) throw new CommandValidationError();
  const records = [
    ...state.reminders,
    ...state.appointments,
    ...state.benefits,
  ].filter((r) => r.profileId === profile.id);
  if (contextId && !records.some((r) => r.id === contextId))
    throw new CommandValidationError();
  const allowed = profile.canManage ? AI_TOOL_DEFINITIONS : [];
  const server = new Server(
    { name: "care-buddy-account-tools", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "read_selected_care",
        description:
          "Read only the signed-in account’s selected person. No account or profile override is accepted.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      ...allowed.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        inputSchema: t.function.parameters as { type: "object" },
        annotations: { readOnlyHint: true, openWorldHint: false },
      })),
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments ?? {};
    let data: unknown;
    if (request.params.name === "read_selected_care") {
      if (Object.keys(args).length) throw new CommandValidationError();
      data = {
        context: {
          now: state.now,
          timeZone,
          profile,
          reminders: state.reminders.filter(
            (r) => r.profileId === profile.id && !r.deletedAt,
          ),
          appointments: state.appointments.filter(
            (r) => r.profileId === profile.id,
          ),
          benefits: state.benefits.filter((r) => r.profileId === profile.id),
          contextId: contextId ?? null,
          scope: scope ?? null,
        },
        history: state.chats
          .filter((c) => c.profileId === profile.id)
          .slice(-12)
          .map((c) => ({ role: c.role, text: c.text })),
      };
    } else {
      if (!allowed.some((t) => t.function.name === request.params.name))
        throw new CommandValidationError();
      const command = commandFromTool(
        request.params.name,
        JSON.stringify(args),
      );
      if ("input" in command && command.input.profileId !== profile.id)
        throw new CommandValidationError();
      if (
        "id" in command &&
        ![profile, ...records].some((r) => r.id === command.id)
      )
        throw new CommandValidationError();
      // Validation on a clone only: no store, database, network or confirmation capability.
      execute(structuredClone(state), command, uid(), profile.id);
      data = { command };
    }
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });
  const client = new Client({
    name: "care-buddy-tokenhub-bridge",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  } catch (error) {
    await server.close();
    throw error;
  }
  async function call(name: string, args: Record<string, unknown>) {
    try {
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as Array<{ type: string; text?: string }>;
      if (result.isError || content.length !== 1 || content[0].type !== "text")
        throw new CommandValidationError();
      return JSON.parse(content[0].text!);
    } catch {
      throw new CommandValidationError();
    }
  }
  return {
    client,
    read: () => call("read_selected_care", {}),
    tools: async () =>
      (await client.listTools()).tools
        .filter((t) => t.name !== "read_selected_care")
        .map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        })),
    propose: async (name: string, args: string): Promise<Command> => {
      // Parse with the same strict allowlist before crossing the protocol boundary.
      commandFromTool(name, args);
      return (await call(name, JSON.parse(args))).command;
    },
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

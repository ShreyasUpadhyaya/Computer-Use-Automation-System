import { GoogleGenAI, type Chat, type FunctionCall } from '@google/genai';
import { AGENT_TOOLS } from './tools.js';
import type { Perception } from './perception.js';
import fs from 'node:fs/promises';

export interface AgentDecision {
  functionCall: FunctionCall;
  rawText?: string;
}

const SYSTEM_INSTRUCTION = `You are a computer-use agent operating a legacy bank back-office web
application on behalf of a human operator. You will be given a goal and, at
each step, the current page's accessibility tree (roles + accessible names)
and a screenshot. You act ONLY by calling one of the provided tools — never
describe what you would do, always call a tool.

Rules:
- Identify every element by its ARIA role and accessible name exactly as
  shown in the accessibility tree. Do not invent roles or names.
- Take one action per turn. Look at the result before deciding the next one.
- If a page shows an error, a "not found" message, a permission-denied
  message, or a session-expired message, treat that as a real outcome of
  the goal (not a bug) and call finish with the appropriate summary — do
  not try to work around it.
- If you are unsure what to click, or the same action fails twice, call
  finish with outcome "stuck" rather than guessing repeatedly.
- Call finish as soon as the goal's checkpoint is visibly satisfied.`;

/**
 * Wraps @google/genai's `Chat` helper rather than hand-building the
 * `contents` history array. Gemini 3.x models attach an opaque
 * `thoughtSignature` to each functionCall part and require it to be
 * replayed back verbatim on the next turn (the API hard-rejects a request
 * missing it); `Chat` appends the raw model turn — signature included —
 * into its own history automatically, which is the only way to avoid
 * silently dropping that field when reconstructing turns by hand.
 */
export class GeminiAgentClient {
  private ai: GoogleGenAI;
  private model: string;
  private chat: Chat | undefined;

  constructor(apiKey: string, model: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async start(goal: string): Promise<void> {
    this.chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: AGENT_TOOLS }],
      },
      history: [{ role: 'user', parts: [{ text: `Goal: ${goal}` }] }],
    });
  }

  /**
   * Records the outcome of the previously executed tool call (if any) as a
   * functionResponse, then sends the new perception and returns the next
   * tool call the model decides on.
   */
  async decideNextAction(
    perception: Perception,
    previousToolResult?: { functionName: string; result: Record<string, unknown> },
  ): Promise<AgentDecision> {
    if (!this.chat) {
      throw new Error('GeminiAgentClient.start() must be called before decideNextAction()');
    }

    const imageBytes = await fs.readFile(perception.screenshotPath);
    const parts: Array<Record<string, unknown>> = [];

    if (previousToolResult) {
      parts.push({
        functionResponse: { name: previousToolResult.functionName, response: previousToolResult.result },
      });
    }
    parts.push({
      text: `Current URL: ${perception.url}\nPage title: ${perception.title}\n\nAccessibility tree:\n${perception.accessibilityTree}`,
    });
    parts.push({ inlineData: { mimeType: 'image/png', data: imageBytes.toString('base64') } });

    const response = await this.chat.sendMessage({ message: parts });

    const call = response.functionCalls?.[0];
    if (!call) {
      throw new Error(`Model did not return a function call. Text response: ${response.text ?? '(empty)'}`);
    }

    return { functionCall: call, rawText: response.text };
  }
}

import { GoogleGenAI, type Content, type FunctionCall } from '@google/genai';
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

export class GeminiAgentClient {
  private ai: GoogleGenAI;
  private model: string;
  private history: Content[] = [];

  constructor(apiKey: string, model: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async start(goal: string): Promise<void> {
    this.history = [{ role: 'user', parts: [{ text: `Goal: ${goal}` }] }];
  }

  /**
   * Records the outcome of the previously executed tool call (if any), then
   * sends the new perception and gets back the next tool call. Combined
   * into one turn because Gemini expects a functionResponse to immediately
   * follow the functionCall it answers, in the same or next user turn.
   */
  async decideNextAction(
    perception: Perception,
    previousToolResult?: { functionName: string; result: Record<string, unknown> },
  ): Promise<AgentDecision> {
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

    this.history.push({ role: 'user', parts });

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: this.history,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: AGENT_TOOLS }],
      },
    });

    const call = response.functionCalls?.[0];
    if (!call) {
      throw new Error(
        `Model did not return a function call. Text response: ${response.text ?? '(empty)'}`,
      );
    }

    this.history.push({
      role: 'model',
      parts: [{ functionCall: call }],
    });

    return { functionCall: call, rawText: response.text };
  }
}

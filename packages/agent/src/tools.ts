import { Type, type FunctionDeclaration } from '@google/genai';

/**
 * The tool surface exposed to the discovery LLM. Every tool takes a
 * role + accessible-name pair (never raw CSS/XPath, never x/y coordinates)
 * so that every decision the model makes is already expressed in the same
 * vocabulary as packages/core's LocatorCandidate — recording a discovery
 * step is then a direct translation of the function call the model made,
 * not a re-interpretation of it.
 */
export const AGENT_TOOLS: FunctionDeclaration[] = [
  {
    name: 'navigate',
    description: 'Navigate the browser to an absolute URL.',
    parameters: {
      type: Type.OBJECT,
      properties: { url: { type: Type.STRING, description: 'Absolute URL to navigate to.' } },
      required: ['url'],
    },
  },
  {
    name: 'click',
    description: 'Click an element identified by its accessibility role and accessible name.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        role: { type: Type.STRING, description: 'ARIA role, e.g. "button", "link".' },
        name: { type: Type.STRING, description: 'Accessible name / visible label of the element.' },
        reasoning: { type: Type.STRING, description: 'One sentence: why this action moves toward the goal.' },
      },
      required: ['role', 'name', 'reasoning'],
    },
  },
  {
    name: 'type',
    description: 'Type text into an input/textbox identified by role and accessible name.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        role: { type: Type.STRING },
        name: { type: Type.STRING },
        text: { type: Type.STRING },
        reasoning: { type: Type.STRING, description: 'One sentence: why this action moves toward the goal.' },
      },
      required: ['role', 'name', 'text', 'reasoning'],
    },
  },
  {
    name: 'selectOption',
    description: 'Choose an option in a <select> dropdown identified by role and accessible name.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        role: { type: Type.STRING },
        name: { type: Type.STRING },
        optionValue: { type: Type.STRING, description: 'The visible text of the option to select.' },
        reasoning: { type: Type.STRING },
      },
      required: ['role', 'name', 'optionValue', 'reasoning'],
    },
  },
  {
    name: 'extract',
    description: 'Read the text of an element identified by role and accessible name, and bind it to a named output.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        role: { type: Type.STRING },
        name: { type: Type.STRING },
        outputName: { type: Type.STRING, description: 'Name to bind the extracted value to, e.g. "balance".' },
        reasoning: { type: Type.STRING },
      },
      required: ['role', 'name', 'outputName', 'reasoning'],
    },
  },
  {
    name: 'finish',
    description: 'Declare the goal complete (success) or unreachable (stuck). Always call this to end the run.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        outcome: { type: Type.STRING, enum: ['success', 'stuck'] },
        summary: { type: Type.STRING, description: 'One or two sentences on the final state and why.' },
      },
      required: ['outcome', 'summary'],
    },
  },
];

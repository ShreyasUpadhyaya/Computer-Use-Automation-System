import fs from 'node:fs/promises';
import path from 'node:path';
import type { CapabilityArtifact } from './artifact.js';

/**
 * The simplest artifact store that satisfies "versioned and reviewable"
 * (Section 3.2): one JSON file per artifact version, human-readable and
 * diffable in a PR, no database. This is a deliberate simplicity choice —
 * see REPORT.md's Cuts section — appropriate at this scale; swapping in a
 * real store later would only change this module, not any caller.
 */
export class ArtifactStore {
  constructor(private readonly rootDir: string) {}

  private filePath(id: string, version: number): string {
    return path.join(this.rootDir, id, `v${version}.json`);
  }

  async save(artifact: CapabilityArtifact): Promise<string> {
    const filePath = this.filePath(artifact.id, artifact.version);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(artifact, null, 2), 'utf8');
    return filePath;
  }

  async load(id: string, version: number): Promise<CapabilityArtifact> {
    const filePath = this.filePath(id, version);
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as CapabilityArtifact;
  }

  async loadLatest(id: string): Promise<CapabilityArtifact | undefined> {
    const dir = path.join(this.rootDir, id);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return undefined;
    }

    const versions = entries
      .map((entry) => /^v(\d+)\.json$/.exec(entry))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => Number(match[1]))
      .sort((a, b) => b - a);

    const latest = versions[0];
    return latest === undefined ? undefined : this.load(id, latest);
  }
}
